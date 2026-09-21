// routes/reminders.routes.js
// Mount trong server.js:  app.use('/api/reminders', require('./routes/reminders.routes'));
// (đặt SAU middleware gắn req.supabase, giống các route khác)
//
// Quy ước nhận diện người dùng: giống các route hiện có, client gửi `agent` (= ho_va_ten lưu
// ở localStorage 'userName'). Mọi thao tác sửa/xóa đều kiểm tra nhắc hẹn thuộc đúng agent đó.
const express = require('express');
const router = express.Router();
const svc = require('../services/reminderService');
const push = require('../services/pushService');

const MIN = svc.MIN;
const agentOf = (req) => (req.query && req.query.agent) || (req.body && req.body.agent) || '';

async function loadOwned(supabase, id, agent) {
    const { data, error } = await supabase.from('nhac_hen_lai').select('*').eq('id', id).eq('ten_agent', agent).limit(1);
    if (error) throw error;
    return data && data.length ? data[0] : null;
}

function fail(res, err, ctx) {
    console.error(`[reminders] ${ctx}:`, err);
    res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
}

// ==========================================================================
// WEB PUSH: đăng ký thiết bị
// ==========================================================================
router.get('/push/public-key', (req, res) => {
    res.json({ success: true, enabled: push.isEnabled(), publicKey: push.getPublicKey() });
});

router.post('/push/subscribe', async (req, res) => {
    try {
        const { subscription, thiet_bi } = req.body || {};
        const agent = agentOf(req);
        if (!agent) return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });
        if (!push.isEnabled()) return res.status(503).json({ success: false, message: 'Máy chủ chưa bật Web Push.' });

        const user = await svc.resolveUser(req.supabase, agent);
        if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });

        await push.saveSubscription(req.supabase, user.id, subscription, thiet_bi);
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'push/subscribe');
    }
});

router.post('/push/unsubscribe', async (req, res) => {
    try {
        await push.removeSubscription(req.supabase, (req.body || {}).endpoint);
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'push/unsubscribe');
    }
});

// Gửi thử 1 thông báo tới mọi thiết bị của chính agent này (nút "Gửi thử" ở Tab 4).
// body.delay (0-30 giây): gửi sau X giây để kịp thoát ra màn hình chính / khóa máy rồi xem thông báo có tới không.
router.post('/push/test', async (req, res) => {
    try {
        const agent = agentOf(req);
        if (!agent) return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });
        const user = await svc.resolveUser(req.supabase, agent);
        if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });

        const payload = {
            title: 'Thông báo thử', body: 'Thiết bị này đã nhận được thông báo nhắc lịch.',
            url: '/agents/calls.html?tab=4', tag: 'push-test', phase: 'test'
        };
        const delay = Math.min(Math.max(Number((req.body || {}).delay) || 0, 0), 30);
        if (delay > 0) {
            setTimeout(() => { push.sendToUser(req.supabase, user.id, payload).catch(() => {}); }, delay * 1000);
            return res.json({ success: true, enabled: push.isEnabled(), scheduled: true, delay });
        }
        const r = await push.sendToUser(req.supabase, user.id, payload);
        res.json({ success: true, enabled: push.isEnabled(), ...r });
    } catch (err) {
        fail(res, err, 'push/test');
    }
});

// Danh sách "kết quả cuộc gọi" cho popup "Đã gọi" (nguồn duy nhất: services/reminderService.js)
router.get('/results', (req, res) => {
    res.json({ success: true, results: svc.CALL_RESULTS });
});

// ==========================================================================
// TRẠNG THÁI NHẸ để poll mỗi 30 giây: số liệu huy hiệu + danh sách mốc cần báo
// ==========================================================================
router.get('/due', async (req, res) => {
    try {
        const supabase = req.supabase;
        const agent = agentOf(req);
        if (!agent) return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });

        const { data: rows, error } = await supabase
            .from('nhac_hen_lai')
            .select('id, dien_thoai, thoi_gian_nhac, ghi_chu, nhac_truoc_phut')
            .eq('ten_agent', agent).eq('trang_thai', 'cho')
            .order('thoi_gian_nhac', { ascending: true }).limit(500);
        if (error) throw error;

        const now = Date.now();
        const endOfDay = svc.startOfVnDayMs(new Date(now)) + 24 * 60 * MIN;
        const counts = { qua_han: 0, sap_dung_gio: 0, hom_nay: 0, tong: (rows || []).length };
        const due = [];

        for (const r of rows || []) {
            const phase = svc.phaseOf(r, now);
            const t = Date.parse(r.thoi_gian_nhac);
            if (phase === 'qua_han') counts.qua_han++;
            else if (phase === 'dung_gio' || phase === 'sap') counts.sap_dung_gio++;
            else if (t < endOfDay) counts.hom_nay++;

            const stale = phase === 'qua_han' && now - t > 6 * 60 * MIN;
            if (phase !== 'chua_den' && !stale) due.push({ ...r, phase });
        }

        const names = await svc.customerNames(supabase, due.map(d => d.dien_thoai));
        due.forEach(d => { d.ho_ten = names[d.dien_thoai] || ''; });

        res.json({ success: true, counts, due, server_time: new Date(now).toISOString() });
    } catch (err) {
        fail(res, err, 'due');
    }
});

// ==========================================================================
// DANH SÁCH cho Tab 4: ?view=open (mặc định) | all (thêm các nhắc đã gọi trong 7 ngày)
// ==========================================================================
router.get('/', async (req, res) => {
    try {
        const supabase = req.supabase;
        const agent = agentOf(req);
        if (!agent) return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });

        const { data: open, error } = await supabase
            .from('nhac_hen_lai').select('*')
            .eq('ten_agent', agent).eq('trang_thai', 'cho')
            .order('thoi_gian_nhac', { ascending: true }).limit(500);
        if (error) throw error;

        let done = [];
        if (req.query.view === 'all') {
            const since = new Date(Date.now() - 7 * 24 * 60 * MIN).toISOString();
            const { data, error: dErr } = await supabase
                .from('nhac_hen_lai').select('*')
                .eq('ten_agent', agent).eq('trang_thai', 'da_goi').gte('da_goi_luc', since)
                .order('da_goi_luc', { ascending: false }).limit(100);
            if (dErr) throw dErr;
            done = data || [];
        }

        const rows = [...(open || []), ...done];
        const phones = [...new Set(rows.map(r => r.dien_thoai).filter(Boolean))];

        // Bổ sung: tên khách, lần gọi gần nhất, đánh giá AI đã lưu
        const [names, callsRes, insRes] = await Promise.all([
            svc.customerNames(supabase, phones),
            phones.length
                ? supabase.from('call_history')
                    .select('dien_thoai, ket_qua_cuoc_goi, ghi_chu, thoi_gian_goi')
                    .in('dien_thoai', phones).eq('ten_agent', agent)
                    .order('thoi_gian_goi', { ascending: false }).limit(phones.length * 6)
                : { data: [] },
            phones.length
                ? supabase.from('ai_insights').select('dien_thoai, insight').in('dien_thoai', phones)
                : { data: [] }
        ]);

        const lastCall = {};
        (callsRes.data || []).forEach(c => { if (!lastCall[c.dien_thoai]) lastCall[c.dien_thoai] = c; });
        const insight = {};
        (insRes.data || []).forEach(i => { insight[i.dien_thoai] = i.insight; });

        const now = Date.now();
        const data = rows.map(r => ({
            id: r.id,
            dien_thoai: r.dien_thoai,
            ho_ten: names[r.dien_thoai] || '',
            thoi_gian_nhac: r.thoi_gian_nhac,
            ghi_chu: r.ghi_chu,
            trang_thai: r.trang_thai,
            so_lan_hoan: r.so_lan_hoan || 0,
            call_history_id: r.call_history_id,
            da_goi_luc: r.da_goi_luc,
            ket_qua_goi: r.ket_qua_goi || null,
            ghi_chu_goi: r.ghi_chu_goi || null,
            phase: r.trang_thai === 'cho' ? svc.phaseOf(r, now) : 'da_goi',
            last_call: lastCall[r.dien_thoai] || null,
            ai_insight: insight[r.dien_thoai] || ''
        }));

        res.json({ success: true, data, server_time: new Date(now).toISOString() });
    } catch (err) {
        fail(res, err, 'list');
    }
});

// ==========================================================================
// ĐÃ GỌI: ghi KẾT QUẢ cuộc gọi
//   body: { agent, ket_qua, ghi_chu?, next_thoi_gian_nhac?, next_ghi_chu? }
//   1) đóng nhắc hẹn hiện tại (lưu kết quả + ghi chú lên chính nhắc hẹn)
//   2) tạo 1 dòng call_history (nếu LOG_TO_CALL_HISTORY) -> lịch sử cuộc gọi / Tab 1 / Tab 5 / AI Insights thấy được
//   3) đặt nhắc hẹn gọi lại tiếp theo nếu có
// ==========================================================================
router.post('/:id/done', async (req, res) => {
    try {
        const supabase = req.supabase;
        const agent = agentOf(req);
        const row = await loadOwned(supabase, req.params.id, agent);
        if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy nhắc hẹn!' });
        if (row.trang_thai !== 'cho') return res.status(409).json({ success: false, message: 'Nhắc hẹn này đã được xử lý rồi.' });

        const { ket_qua, ghi_chu, next_thoi_gian_nhac, next_ghi_chu } = req.body || {};
        const opt = svc.findResult(ket_qua);
        if (!opt) return res.status(400).json({ success: false, message: 'Vui lòng chọn kết quả cuộc gọi!' });

        let next = null;
        if (next_thoi_gian_nhac) {
            next = svc.validateRemindTime(next_thoi_gian_nhac);
            if (!next.ok) return res.status(400).json({ success: false, message: next.message });
        } else if (opt.next === 'bat_buoc') {
            return res.status(400).json({ success: false, message: `Kết quả "${opt.value}" cần đặt thời gian gọi lại!` });
        }

        const note = String(ghi_chu || '').trim().slice(0, 2000) || null;
        const now = new Date().toISOString();

        // Giữ chỗ: chỉ 1 request "thắng" (bấm đúp / 2 thiết bị cùng bấm sẽ không tạo trùng)
        const { data: claimed, error: claimErr } = await supabase.from('nhac_hen_lai')
            .update({ trang_thai: 'da_goi', da_goi_luc: now, da_nhac: true, ket_qua_goi: opt.value, ghi_chu_goi: note, updated_at: now })
            .eq('id', row.id).eq('trang_thai', 'cho').select('id');
        if (claimErr) throw claimErr;
        if (!claimed || !claimed.length) return res.status(409).json({ success: false, message: 'Nhắc hẹn này đã được xử lý rồi.' });

        let callId = null;
        if (svc.LOG_TO_CALL_HISTORY) {
            try {
                // thoi_gian_goi là timestamp không múi giờ, giao diện hiểu là UTC -> ghi ISO/UTC giống các nơi khác
                const callRow = {
                    dien_thoai: row.dien_thoai, ten_agent: row.ten_agent,
                    ket_qua_cuoc_goi: opt.value, ghi_chu: note, thoi_gian_goi: now
                };
                if (opt.logAsAppointment) callRow.trang_thai_gui = 'Chưa gửi';
                const { data: ins, error: insErr } = await supabase.from('call_history').insert([callRow]).select('id').single();
                if (insErr) throw insErr;
                callId = ins.id;
                await supabase.from('nhac_hen_lai').update({ ket_qua_call_history_id: callId }).eq('id', row.id);
            } catch (e) {
                // Không ghi được lịch sử cuộc gọi -> trả nhắc hẹn về trạng thái chờ để không mất dữ liệu
                await supabase.from('nhac_hen_lai').update({ trang_thai: 'cho', da_goi_luc: null, ket_qua_goi: null, ghi_chu_goi: null, updated_at: now }).eq('id', row.id);
                throw e;
            }
        }

        if (next) {
            await svc.upsertReminder(supabase, {
                dien_thoai: row.dien_thoai, ten_agent: row.ten_agent, user_id: row.user_id,
                thoi_gian_nhac: next.iso, ghi_chu: next_ghi_chu, call_history_id: callId || row.call_history_id
            });
        }

        let message = `Đã ghi nhận kết quả: ${opt.value}.`;
        if (opt.logAsAppointment && callId) message += ' Khách đã được đưa vào "Danh sách hẹn gặp thành công".';
        if (next) message += ' Đã đặt nhắc hẹn gọi lại.';
        res.json({ success: true, message, call_history_id: callId });
    } catch (err) {
        fail(res, err, 'done');
    }
});

// ==========================================================================
// HOÃN  body: { agent, minutes? , thoi_gian_nhac? }
// ==========================================================================
router.post('/:id/snooze', async (req, res) => {
    try {
        const supabase = req.supabase;
        const agent = agentOf(req);
        const row = await loadOwned(supabase, req.params.id, agent);
        if (!row || row.trang_thai !== 'cho') return res.status(404).json({ success: false, message: 'Không tìm thấy nhắc hẹn đang chờ!' });

        const { minutes, thoi_gian_nhac } = req.body || {};
        let target = thoi_gian_nhac;
        if (!target && Number(minutes) > 0) target = new Date(Date.now() + Number(minutes) * MIN).toISOString();
        const v = svc.validateRemindTime(target);
        if (!v.ok) return res.status(400).json({ success: false, message: v.message });

        const { error } = await supabase.from('nhac_hen_lai').update({
            thoi_gian_nhac: v.iso,
            so_lan_hoan: (row.so_lan_hoan || 0) + 1,
            updated_at: new Date().toISOString(),
            ...svc.RESET_MARKERS
        }).eq('id', row.id);
        if (error) throw error;

        res.json({ success: true, message: 'Đã hoãn nhắc hẹn.', thoi_gian_nhac: v.iso });
    } catch (err) {
        fail(res, err, 'snooze');
    }
});

// ==========================================================================
// SỬA giờ / ghi chú  body: { agent, thoi_gian_nhac?, ghi_chu? }
// ==========================================================================
router.post('/:id/update', async (req, res) => {
    try {
        const supabase = req.supabase;
        const agent = agentOf(req);
        const row = await loadOwned(supabase, req.params.id, agent);
        if (!row || row.trang_thai !== 'cho') return res.status(404).json({ success: false, message: 'Không tìm thấy nhắc hẹn đang chờ!' });

        const patch = { updated_at: new Date().toISOString() };
        const body = req.body || {};
        if (body.thoi_gian_nhac) {
            const v = svc.validateRemindTime(body.thoi_gian_nhac);
            if (!v.ok) return res.status(400).json({ success: false, message: v.message });
            if (v.iso !== new Date(row.thoi_gian_nhac).toISOString()) Object.assign(patch, { thoi_gian_nhac: v.iso }, svc.RESET_MARKERS);
        }
        if (typeof body.ghi_chu === 'string') patch.ghi_chu = body.ghi_chu.trim() || null;

        const { error } = await supabase.from('nhac_hen_lai').update(patch).eq('id', row.id);
        if (error) throw error;
        res.json({ success: true, message: 'Đã cập nhật nhắc hẹn.' });
    } catch (err) {
        fail(res, err, 'update');
    }
});

// ==========================================================================
// HỦY nhắc hẹn  body: { agent }
// ==========================================================================
router.post('/:id/cancel', async (req, res) => {
    try {
        const supabase = req.supabase;
        const agent = agentOf(req);
        const row = await loadOwned(supabase, req.params.id, agent);
        if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy nhắc hẹn!' });

        const { error } = await supabase.from('nhac_hen_lai')
            .update({ trang_thai: 'huy', updated_at: new Date().toISOString() }).eq('id', row.id);
        if (error) throw error;
        res.json({ success: true, message: 'Đã hủy nhắc hẹn.' });
    } catch (err) {
        fail(res, err, 'cancel');
    }
});

module.exports = router;
