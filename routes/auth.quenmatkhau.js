const express = require('express');
const router = express.Router();

// API xử lý đăng nhập kết nối trực tiếp bảng users
router.post('/login', async (req, res) => {
    try {
        const { ten_dang_nhap, mat_khau } = req.body;

        if (!ten_dang_nhap || !mat_khau) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ tài khoản và mật khẩu!" });
        }

        // Truy vấn bảng users lấy thông tin khớp với tên đăng nhập và mật khẩu
        const { data, error } = await req.supabase
            .from('users')
            .select('*')
            .eq('ten_dang_nhap', ten_dang_nhap)
            .eq('mat_khau', mat_khau)
            .single();

        if (error || !data) {
            return res.status(401).json({ success: false, message: "Sai tên đăng nhập hoặc mật khẩu!" });
        }

        // --- BỔ SUNG: KIỂM TRA TRẠNG THÁI TÀI KHOẢN BỊ KHÓA ---
        if (data.trang_thai === 'Tạm khoá') {
            return res.status(403).json({ 
                success: false, 
                message: "Tài khoản đang tạm khoá, vui lòng liên hệ admin !" 
            });
        }

        // Đăng nhập thành công, trả về thông tin user và phân quyền
        res.json({
            success: true,
            message: "Đăng nhập thành công!",
            user: {
                ho_va_ten: data.ho_va_ten,
                phan_quyen: data.phan_quyen // 'admin', 'leader', 'agent'
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server nội bộ!" });
    }
});

// ==========================================
// KIỂM TRA QUYỀN TRUY CẬP TRANG DATA LEAD (leads.html)
// ==========================================
// GET /api/auth/leads-access/:ten_dang_nhap
// sidebar.js gọi API này ở MỖI LẦN LOAD TRANG (không dùng cache localStorage)
// để đảm bảo agent luôn thấy đúng quyền mới nhất do admin cấp/thu hồi qua users.html,
// không cần phải đăng xuất - đăng nhập lại mới nhận được thay đổi.
router.get('/leads-access/:ten_dang_nhap', async (req, res) => {
    try {
        const { ten_dang_nhap } = req.params;

        const { data, error } = await req.supabase
            .from('users')
            .select('xem_data_leads, phan_quyen, trang_thai')
            .eq('ten_dang_nhap', ten_dang_nhap)
            .single();

        if (error || !data) {
            // Không tìm thấy user -> mặc định KHÔNG cho phép (fail-safe an toàn)
            return res.json({ success: true, xem_data_leads: false });
        }

        // Admin luôn được xem, tài khoản bị khoá thì không cho xem gì hết
        if (data.trang_thai === 'Tạm khoá') {
            return res.json({ success: true, xem_data_leads: false });
        }

        const allowed = data.phan_quyen === 'admin' || data.xem_data_leads === true;
        res.json({ success: true, xem_data_leads: allowed });
    } catch (err) {
        console.error('Lỗi kiểm tra quyền leads-access:', err);
        // Lỗi server -> fail-safe: coi như không có quyền, tránh lộ trang khi có sự cố
        res.json({ success: true, xem_data_leads: false });
    }
});

module.exports = router;