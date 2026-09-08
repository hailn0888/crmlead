/*
  Tên file: routes/ai.routes.js
  Chức năng: Các API liên quan đến AI dùng chung cho toàn hệ thống.

  Hiện có:
  - POST /api/ai/analyze-lead : phân tích chân dung khách hàng + gợi ý 3 kịch bản gọi
    (dùng cho nút "AI Assistant" ở trang Data Lead - leads.html)

  QUAN TRỌNG: file này nằm ở backend (routes/), KHÔNG nằm trong thư mục public/ -> an toàn
  để dùng GROQ_API_KEY (đọc gián tiếp qua services/groqService.js, không hardcode ở đây).
*/

const express = require('express');
const router = express.Router();
const { generateLeadPersonaAndScripts } = require('../services/groqService');

// POST /api/ai/analyze-lead
// Body: { profile: { so_hop_dong, ho_ten, gioi_tinh, dien_thoai, cccd, ngay_sinh,
//                     ngay_tham_gia, nam_dao_han, menh_gia, dia_chi } }
router.post('/analyze-lead', async (req, res) => {
    try {
        const { profile } = req.body || {};
        if (!profile || (!profile.ho_ten && !profile.so_hop_dong)) {
            return res.status(400).json({ success: false, message: 'Chưa có thông tin khách hàng để phân tích.' });
        }

        const result = await generateLeadPersonaAndScripts(profile);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('Lỗi POST /api/ai/analyze-lead:', err);
        res.status(500).json({ success: false, message: err.message || 'Không thể phân tích khách hàng.' });
    }
});

module.exports = router;