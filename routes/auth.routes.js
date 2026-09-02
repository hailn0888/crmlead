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

module.exports = router;