const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase'); // Đảm bảo đường dẫn đến file cấu hình supabase của bạn là chính xác

// 1. API: Lấy danh sách file được phân bổ cho Agent
router.get('/files', async (req, res) => {
    try {
        const agentName = req.query.agent;
        if (!agentName) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin tên Agent!' });
        }

        const { data, error } = await supabase
            .from('lead_assignments')
            .select('so_hop_dong, dien_thoai, nguoi_phu_trach, trang_thai_lead')
            .eq('nguoi_phu_trach', agentName);

        if (error) throw error;

        // Trả về danh sách file mô phỏng hoặc gom nhóm từ dữ liệu thật
        const mockFiles = [
            { file_name: "Datatest 2.xlsx", total_records: data.length || 93 }
        ];

        res.json({ success: true, data: mockFiles });
    } catch (error) {
        console.error("Lỗi lấy danh sách file:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
    }
});

// 2. API: Lấy danh sách lead chi tiết của agent
router.get('/leads', async (req, res) => {
    try {
        const agentName = req.query.agent;
        
        const { data, error } = await supabase
            .from('lead_assignments')
            .select(`
                *,
                contracts (*),
                customers (*)
            `)
            .eq('nguoi_phu_trach', agentName);

        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error("Lỗi lấy danh sách lead:", error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// 3. API: Lưu kết quả cuộc gọi
router.post('/calls', async (req, res) => {
    try {
        const { dien_thoai, so_hop_dong, ten_agent, ket_qua_cuoc_goi, ghi_chu, thoi_gian_goi } = req.body;

        if (!dien_thoai || !ket_qua_cuoc_goi) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bắt buộc!' });
        }

        const { error: historyError } = await supabase
            .from('call_history')
            .insert([{ dien_thoai, ten_agent, ket_qua_cuoc_goi, ghi_chu, thoi_gian_goi }]);

        if (historyError) throw historyError;

        const { error: updateError } = await supabase
            .from('lead_assignments')
            .update({
                trang_thai_lead: 'Đã gọi',
                ket_qua_moi_nhat: ket_qua_cuoc_goi,
                ghi_chu_moi_nhat: ghi_chu,
                ngay_cap_hat: new Date()
            })
            .eq('dien_thoai', dien_thoai);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Đã lưu kết quả cuộc gọi thành công!' });
    } catch (error) {
        console.error("Lỗi lưu kết quả gọi:", error);
        res.status(500).json({ success: false, message: 'Không thể lưu kết quả cuộc gọi' });
    }
});

module.exports = router;