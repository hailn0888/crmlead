// routes/callsReport.routes.js
// API cho trang public/admin/rplead_personal.html (Báo cáo Lead cá nhân).
// Được gắn vào calls.routes.js bằng: router.use('/report', require('./callsReport.routes'));
// => đường dẫn cuối cùng: /api/calls/report/agents và /api/calls/report/logs
// và tự động nằm sau middleware requireLeadsApiAccess giống các API /api/calls khác.
//
// Nguồn dữ liệu:
//   call_history  : mỗi dòng = 1 cuộc gọi (ten_agent, ket_qua_cuoc_goi, thoi_gian_goi, ghi_chu, dien_thoai)
//   nhac_hen_lai  : lịch nhắc gọi lại (dien_thoai, ten_agent, thoi_gian_nhac, call_history_id, da_nhac)
//   customers     : họ tên khách theo số điện thoại
const express = require('express');
const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;      // Supabase chỉ trả tối đa 1000 dòng / lần -> phải lấy theo trang
const MAX_ROWS = 50000;      // trần an toàn cho 1 lần báo cáo
const PHONE_CHUNK = 150;     // số điện thoại tối đa mỗi lần tra bảng nhac_hen_lai

const cleanResult = v => String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim();

// 'Ghi chú chăm sóc' là ghi chú thủ công, không phải cuộc gọi thật (giống tab Nhật ký cuộc gọi)
function isRealCall(row) {
    const kq = cleanResult(row.ket_qua_cuoc_goi).toLowerCase();
    return !!kq && kq !== 'ghi chú chăm sóc' && !!row.thoi_gian_goi;
}

// Lấy hết dữ liệu theo từng trang 1000 dòng. buildQuery phải có order ổn định.
async function fetchAllPages(buildQuery, maxRows = MAX_ROWS) {
    const all = [];
    let truncated = false;
    for (let start = 0; start < maxRows; start += PAGE_SIZE) {
        const { data, error } = await buildQuery().range(start, start + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data || [];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) return { rows: all, truncated: false };
    }
    truncated = true;
    return { rows: all, truncated };
}

// --------------------------------------------------------------------------
// GET /api/calls/report/agents -> danh sách nhân viên đã có cuộc gọi
// --------------------------------------------------------------------------
router.get('/agents', async (req, res) => {
    try {
        const supabase = req.supabase;
        const { rows } = await fetchAllPages(() => supabase
            .from('call_history')
            .select('ten_agent')
            .not('ten_agent', 'is', null)
            .order('thoi_gian_goi', { ascending: false })
            .order('id', { ascending: false }), 5000);

        const names = [...new Set(rows.map(r => String(r.ten_agent || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'vi'));
        res.json({ success: true, data: names.map(n => ({ id: n, name: n })) });
    } catch (error) {
        console.error('Lỗi lấy danh sách nhân viên báo cáo:', error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ', error: error.message });
    }
});

// --------------------------------------------------------------------------
// GET /api/calls/report/logs?from=YYYY-MM-DD&to=YYYY-MM-DD[&agent_id=Tên nhân viên]
// Trả từng cuộc gọi trong khoảng ngày (giờ Việt Nam, tính trọn ngày from..to),
// kèm giờ gọi lại (callback_at) lấy từ bảng nhac_hen_lai.
// --------------------------------------------------------------------------
router.get('/logs', async (req, res) => {
    try {
        const supabase = req.supabase;
        const { from, to } = req.query;
        const agent = String(req.query.agent_id || req.query.agent || '').trim();

        if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
            return res.status(400).json({ success: false, message: 'Thiếu hoặc sai định dạng from/to (YYYY-MM-DD).' });
        }
        if (from > to) {
            return res.status(400).json({ success: false, message: 'from phải trước hoặc bằng to.' });
        }

        const startIso = `${from}T00:00:00+07:00`;
        const endIso = `${to}T23:59:59.999+07:00`;

        const { rows: rawCalls, truncated } = await fetchAllPages(() => {
            let q = supabase
                .from('call_history')
                .select('id, dien_thoai, ten_agent, ket_qua_cuoc_goi, ghi_chu, thoi_gian_goi, customers:dien_thoai (ho, ten)')
                .gte('thoi_gian_goi', startIso)
                .lte('thoi_gian_goi', endIso)
                .order('thoi_gian_goi', { ascending: false })
                .order('id', { ascending: false });
            if (agent) q = q.eq('ten_agent', agent);
            return q;
        });
        const calls = rawCalls.filter(isRealCall);

        // ---- Giờ gọi lại: tra bảng nhac_hen_lai theo số điện thoại ----
        const phones = [...new Set(calls.map(r => String(r.dien_thoai || '').trim()).filter(Boolean))];
        const reminders = [];
        let callbackWarning = false;
        for (let i = 0; i < phones.length; i += PHONE_CHUNK) {
            let q = supabase.from('nhac_hen_lai').select('*').in('dien_thoai', phones.slice(i, i + PHONE_CHUNK));
            if (agent) q = q.eq('ten_agent', agent);
            const { data, error } = await q;
            if (error) {
                // Không làm hỏng cả báo cáo nếu chỉ phần giờ gọi lại bị lỗi
                console.error('Lỗi lấy lịch nhắc gọi lại cho báo cáo:', error);
                callbackWarning = true;
                break;
            }
            reminders.push(...(data || []));
        }

        const remTime = r => r.thoi_gian_nhac || null;
        const byCallId = new Map();
        const byPhoneAgent = new Map();
        reminders.forEach(r => {
            if (r.call_history_id != null) byCallId.set(String(r.call_history_id), r);
            const key = `${String(r.dien_thoai || '').trim()}|${String(r.ten_agent || '').trim()}`;
            const old = byPhoneAgent.get(key);
            if (!old || new Date(remTime(r)) > new Date(remTime(old))) byPhoneAgent.set(key, r);
        });

        // Lịch nhắc gắn trực tiếp theo call_history_id; nếu không có thì gắn cho lần gọi MỚI NHẤT
        // của khách đó (do cùng nhân viên) vì mỗi khách chỉ có 1 nhắc hẹn đang chờ.
        const seen = new Set();
        const data = calls.map(r => {
            const phone = String(r.dien_thoai || '').trim();
            const key = `${phone}|${String(r.ten_agent || '').trim()}`;
            const isLatest = !seen.has(key);
            seen.add(key);
            const rem = byCallId.get(String(r.id)) || (isLatest ? byPhoneAgent.get(key) : null);
            const cust = r.customers || {};
            return {
                id: r.id,
                agent_id: r.ten_agent,
                agent_name: r.ten_agent,
                customer_name: `${cust.ho || ''} ${cust.ten || ''}`.trim(),
                phone,
                called_at: r.thoi_gian_goi,
                result: cleanResult(r.ket_qua_cuoc_goi),
                callback_at: rem ? remTime(rem) : null,
                callback_done: rem ? !!rem.da_nhac : null,
                duration: 0, // call_history chưa lưu thời lượng cuộc gọi
                note: r.ghi_chu || ''
            };
        });

        res.json({ success: true, data, truncated, callback_warning: callbackWarning });
    } catch (error) {
        console.error('Lỗi lấy dữ liệu báo cáo cuộc gọi:', error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ', error: error.message });
    }
});

module.exports = router;