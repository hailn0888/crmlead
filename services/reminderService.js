// services/reminderService.js
// Hàm dùng chung cho nhắc lịch chăm sóc khách hàng (routes + job nền).
const TZ = 'Asia/Ho_Chi_Minh';
const MIN = 60 * 1000;

const QUIET_FROM_HOUR = 21; // từ 21:00 không bắn thông báo
const QUIET_TO_HOUR = 7;    // đến 07:00 mới bắn lại
const DEFAULT_PRE_MIN = 15; // "sắp tới giờ" = trước 15 phút
const OVERDUE_AFTER_MIN = 30; // quá giờ 30 phút chưa xử lý = "quá hạn"

const RESET_MARKERS = {
    da_nhac: false,
    da_nhac_truoc_luc: null,
    da_nhac_dung_gio_luc: null,
    da_nhac_qua_han_luc: null
};

// ---------------------------------------------------------------- Thời gian (giờ VN)
function vnParts(date = new Date()) {
    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
    return {
        y: +p.year, mo: +p.month, d: +p.day,
        h: (+p.hour) % 24, mi: +p.minute,
        ymd: `${p.year}-${p.month}-${p.day}`
    };
}

function isQuietHours(date = new Date()) {
    const h = vnParts(date).h;
    return h >= QUIET_FROM_HOUR || h < QUIET_TO_HOUR;
}

// Mốc 00:00 giờ VN của ngày chứa `date`, tính bằng mili-giây UTC
function startOfVnDayMs(date = new Date()) {
    const p = vnParts(date);
    return Date.UTC(p.y, p.mo - 1, p.d) - 7 * 60 * MIN;
}

function fmtHHmm(iso) {
    const p = vnParts(new Date(iso));
    return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

// Kiểm tra thời gian nhắc hợp lệ: ISO hợp lệ, không ở quá khứ (cho phép lệch 1 phút), không quá 1 năm
function validateRemindTime(value) {
    if (!value) return { ok: false, message: 'Thiếu thời gian nhắc hẹn!' };
    const t = Date.parse(value);
    if (Number.isNaN(t)) return { ok: false, message: 'Thời gian nhắc hẹn không hợp lệ!' };
    if (t < Date.now() - MIN) return { ok: false, message: 'Thời gian nhắc hẹn phải ở tương lai!' };
    if (t > Date.now() + 366 * 24 * 60 * MIN) return { ok: false, message: 'Thời gian nhắc hẹn quá xa!' };
    return { ok: true, iso: new Date(t).toISOString() };
}

// Giai đoạn hiện tại của một nhắc hẹn đang chờ
function phaseOf(row, nowMs = Date.now()) {
    const t = Date.parse(row.thoi_gian_nhac);
    const pre = (row.nhac_truoc_phut || DEFAULT_PRE_MIN) * MIN;
    if (nowMs >= t + OVERDUE_AFTER_MIN * MIN) return 'qua_han';
    if (nowMs >= t) return 'dung_gio';
    if (nowMs >= t - pre) return 'sap';
    return 'chua_den';
}

// ---------------------------------------------------------------- Người dùng / khách hàng
// Tra user theo họ tên hoặc tên đăng nhập. Dùng .eq() riêng từng cột (không nối chuỗi vào .or())
// nên tên có dấu phẩy/ngoặc không làm hỏng câu lọc, và trùng tên không làm .single() báo lỗi.
async function resolveUser(supabase, agent) {
    if (!agent) return null;
    for (const col of ['ho_va_ten', 'ten_dang_nhap']) {
        const { data } = await supabase
            .from('users').select('id, ho_va_ten, ten_dang_nhap').eq(col, agent).limit(1);
        if (data && data.length) return data[0];
    }
    return null;
}

async function customerNames(supabase, phones) {
    const map = {};
    const list = [...new Set((phones || []).filter(Boolean))];
    if (!list.length) return map;
    const { data } = await supabase.from('customers').select('ho, ten, dien_thoai').in('dien_thoai', list);
    (data || []).forEach(c => { map[c.dien_thoai] = `${c.ho || ''} ${c.ten || ''}`.trim(); });
    return map;
}

// ---------------------------------------------------------------- Nội dung thông báo
function snippet(text, max = 80) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function buildMessage(phase, row, name) {
    const who = name ? `${name} (${row.dien_thoai})` : row.dien_thoai;
    const hhmm = fmtHHmm(row.thoi_gian_nhac);
    const note = row.ghi_chu ? ` Lưu ý: ${snippet(row.ghi_chu)}` : '';
    if (phase === 'sap') return { title: 'Sắp tới giờ gọi lại khách', body: `${who} - hẹn lúc ${hhmm}.${note}` };
    if (phase === 'dung_gio') return { title: 'Đến giờ gọi lại khách', body: `${who} - hẹn lúc ${hhmm}.${note}` };
    return { title: 'Quá hạn gọi lại khách', body: `${who} - hẹn lúc ${hhmm}, chưa xử lý.${note}` };
}

// ---------------------------------------------------------------- Ghi DB
async function createNotification(supabase, userId, loai, noiDung, callHistoryId) {
    if (!userId) return;
    try {
        await supabase.from('notifications').insert([{
            user_id: userId,
            loai_thong_bao: loai,
            noi_dung: noiDung,
            call_history_id: callHistoryId || null,
            da_doc: false
        }]);
    } catch (err) {
        console.error('[reminder] Lỗi tạo thông báo:', err);
    }
}

// Mỗi khách (theo agent) chỉ có 1 nhắc hẹn đang chờ: nếu đã có thì cập nhật lại thay vì tạo trùng.
async function upsertReminder(supabase, { dien_thoai, ten_agent, user_id, thoi_gian_nhac, ghi_chu, call_history_id }) {
    const { data: existing, error: findErr } = await supabase
        .from('nhac_hen_lai').select('id')
        .eq('dien_thoai', dien_thoai).eq('ten_agent', ten_agent).eq('trang_thai', 'cho')
        .order('id', { ascending: false }).limit(1);
    if (findErr) throw findErr;

    const now = new Date().toISOString();
    if (existing && existing.length) {
        const { error } = await supabase.from('nhac_hen_lai').update({
            thoi_gian_nhac,
            ghi_chu: ghi_chu || null,
            user_id: user_id || null,
            call_history_id: call_history_id || null,
            updated_at: now,
            ...RESET_MARKERS
        }).eq('id', existing[0].id);
        if (error) throw error;
        return { id: existing[0].id, updated: true };
    }

    const { data, error } = await supabase.from('nhac_hen_lai').insert([{
        dien_thoai, ten_agent,
        user_id: user_id || null,
        call_history_id: call_history_id || null,
        thoi_gian_nhac,
        ghi_chu: ghi_chu || null,
        trang_thai: 'cho',
        da_nhac: false
    }]).select('id').single();
    if (error) throw error;
    return { id: data.id, updated: false };
}

module.exports = {
    TZ, MIN, DEFAULT_PRE_MIN, OVERDUE_AFTER_MIN, RESET_MARKERS,
    vnParts, isQuietHours, startOfVnDayMs, fmtHHmm,
    validateRemindTime, phaseOf,
    resolveUser, customerNames,
    snippet, buildMessage,
    createNotification, upsertReminder
};