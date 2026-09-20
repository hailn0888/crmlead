// services/reminderJob.js
// Job nền chạy mỗi phút: quét nhắc hẹn tới hạn -> ghi chuông (notifications) + gửi Web Push.
// Khởi động 1 lần trong server.js:  require('./services/reminderJob').start(supabase);
// LƯU Ý: chỉ chạy trên 1 tiến trình (không dùng PM2 cluster nhiều instance) để khỏi gửi trùng.
const svc = require('./reminderService');
const push = require('./pushService');

const MIN = svc.MIN;
const HOUR = 60 * MIN;
const LOAI_NHAC = 'nhac_goi_lai';
const LOAI_TONG_HOP = 'nhac_tong_hop';

let timer = null;
let running = false;
const digestSent = new Set(); // "yyyy-mm-dd:userKey" - chống gửi trùng bản tổng hợp sáng

// --------------------------------------------------------------------------
// Hàm THUẦN quyết định gửi mốc nào cho 1 nhắc hẹn (dễ test, không đụng DB).
//   sap      : trước giờ hẹn `nhac_truoc_phut` (mặc định 15')
//   dung_gio : đúng giờ hẹn
//   qua_han  : quá giờ 30' mà vẫn chưa xử lý
// Quy tắc: ngoài giờ yên tĩnh (21h-7h) thì hoãn; mốc đã quá cũ thì bỏ qua âm thầm
// (bản tổng hợp 8h sáng sẽ liệt kê các nhắc hẹn quá hạn).
// --------------------------------------------------------------------------
function planRow(r, now, quiet) {
    const t = Date.parse(r.thoi_gian_nhac);
    const pre = (r.nhac_truoc_phut || svc.DEFAULT_PRE_MIN) * MIN;
    const late = now - t;
    const iso = new Date(now).toISOString();
    const patch = {};
    const sends = [];

    if (!r.da_nhac_truoc_luc) {
        if (late >= 0) patch.da_nhac_truoc_luc = iso; // đã quá giờ: bỏ qua mốc "sắp tới"
        else if (!quiet && now >= t - pre) { patch.da_nhac_truoc_luc = iso; sends.push('sap'); }
    }

    if (!r.da_nhac_dung_gio_luc && late >= 0) {
        if (late > 2 * HOUR) {
            patch.da_nhac_dung_gio_luc = iso; patch.da_nhac = true; // quá cũ: bỏ qua âm thầm
        } else if (!quiet) {
            patch.da_nhac_dung_gio_luc = iso; patch.da_nhac = true;
            if (late >= svc.OVERDUE_AFTER_MIN * MIN) { // server tắt lâu: gộp thành 1 thông báo "quá hạn"
                patch.da_nhac_qua_han_luc = iso; sends.push('qua_han');
            } else {
                sends.push('dung_gio');
            }
        }
    } else if (r.da_nhac_dung_gio_luc && !r.da_nhac_qua_han_luc && late >= svc.OVERDUE_AFTER_MIN * MIN) {
        if (late > 6 * HOUR) patch.da_nhac_qua_han_luc = iso; // quá cũ: bỏ qua âm thầm
        else if (!quiet) { patch.da_nhac_qua_han_luc = iso; sends.push('qua_han'); }
    }
    return { patch, sends };
}

// --------------------------------------------------------------------------
async function notify(supabase, userId, phase, row, name) {
    if (!userId) return;
    const msg = svc.buildMessage(phase, row, name);
    await svc.createNotification(supabase, userId, LOAI_NHAC, `${msg.title}: ${msg.body}`, row.call_history_id);
    await push.sendToUser(supabase, userId, {
        title: msg.title,
        body: msg.body,
        url: '/agents/calls.html?tab=4',
        tag: `nhac-${row.id}-${phase}`,
        phase,
        id: row.id
    });
}

async function tick(supabase) {
    const now = Date.now();
    const quiet = svc.isQuietHours(new Date(now));

    const { data: rows, error } = await supabase
        .from('nhac_hen_lai').select('*')
        .eq('trang_thai', 'cho')
        .lte('thoi_gian_nhac', new Date(now + HOUR).toISOString())
        .gte('thoi_gian_nhac', new Date(now - 24 * HOUR).toISOString())
        .order('thoi_gian_nhac', { ascending: true })
        .limit(500);
    if (error) { console.error('[reminderJob] Lỗi quét nhắc hẹn:', error.message); return; }

    const plan = (rows || [])
        .map(r => ({ r, ...planRow(r, now, quiet) }))
        .filter(p => Object.keys(p.patch).length || p.sends.length);

    if (plan.length) {
        const names = await svc.customerNames(supabase, plan.filter(p => p.sends.length).map(p => p.r.dien_thoai));
        const userCache = new Map();
        for (const p of plan) {
            // Đánh dấu TRƯỚC khi gửi: lỗi gửi sẽ không khiến thông báo lặp lại mỗi phút
            const { error: upErr } = await supabase.from('nhac_hen_lai')
                .update({ ...p.patch, updated_at: new Date().toISOString() })
                .eq('id', p.r.id).eq('trang_thai', 'cho');
            if (upErr) { console.error('[reminderJob] Lỗi cập nhật mốc:', upErr.message); continue; }

            if (!p.sends.length) continue;
            let userId = p.r.user_id;
            if (!userId) {
                if (!userCache.has(p.r.ten_agent)) userCache.set(p.r.ten_agent, await svc.resolveUser(supabase, p.r.ten_agent));
                userId = (userCache.get(p.r.ten_agent) || {}).id;
            }
            for (const phase of p.sends) {
                await notify(supabase, userId, phase, p.r, names[p.r.dien_thoai]);
            }
        }
    }

    await morningDigest(supabase, now);
}

// Tổng hợp 8h sáng (giờ VN): "Hôm nay bạn có N khách cần gọi lại"
async function morningDigest(supabase, now) {
    const p = svc.vnParts(new Date(now));
    if (!(p.h === 8 && p.mi < 10)) return;

    for (const k of digestSent) if (!k.startsWith(p.ymd)) digestSent.delete(k);

    const endOfDay = svc.startOfVnDayMs(new Date(now)) + 24 * HOUR;
    const { data: rows, error } = await supabase
        .from('nhac_hen_lai').select('id, ten_agent, user_id, thoi_gian_nhac')
        .eq('trang_thai', 'cho')
        .lt('thoi_gian_nhac', new Date(endOfDay).toISOString())
        .limit(2000);
    if (error || !rows || !rows.length) return;

    const groups = new Map();
    for (const r of rows) {
        const key = r.user_id ? `u${r.user_id}` : `n${r.ten_agent}`;
        if (!groups.has(key)) groups.set(key, { user_id: r.user_id, ten_agent: r.ten_agent, homNay: 0, quaHan: 0 });
        const g = groups.get(key);
        if (Date.parse(r.thoi_gian_nhac) < now) g.quaHan++; else g.homNay++;
    }

    for (const [key, g] of groups) {
        const dedupe = `${p.ymd}:${key}`;
        if (digestSent.has(dedupe)) continue;
        digestSent.add(dedupe);

        let userId = g.user_id;
        if (!userId) userId = ((await svc.resolveUser(supabase, g.ten_agent)) || {}).id;
        if (!userId) continue;

        const parts = [];
        if (g.homNay) parts.push(`hôm nay bạn có ${g.homNay} khách cần gọi lại`);
        if (g.quaHan) parts.push(`${g.quaHan} nhắc hẹn đã quá hạn chưa xử lý`);
        const text = parts.join(', ');
        const noiDung = text.charAt(0).toUpperCase() + text.slice(1) + '.';

        await svc.createNotification(supabase, userId, LOAI_TONG_HOP, noiDung, null);
        await push.sendToUser(supabase, userId, {
            title: 'Lịch chăm sóc khách hôm nay', body: noiDung,
            url: '/agents/calls.html?tab=4', tag: `tonghop-${p.ymd}`, phase: 'tong_hop'
        });
    }
}

function start(supabase, { intervalMs = 60 * 1000 } = {}) {
    if (timer) return;
    if (!supabase) throw new Error('reminderJob.start(supabase): thiếu supabase client');
    const run = async () => {
        if (running) return; // tick trước chưa xong thì bỏ qua
        running = true;
        try { await tick(supabase); }
        catch (e) { console.error('[reminderJob] Lỗi:', e); }
        finally { running = false; }
    };
    timer = setInterval(run, intervalMs);
    setTimeout(run, 5000);
    console.log('[reminderJob] Đã khởi động job nhắc lịch (mỗi ' + Math.round(intervalMs / 1000) + ' giây).');
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, tick, planRow };
