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
// KIỂM TRA TRẠNG THÁI TÀI KHOẢN (mọi vai trò) + QUYỀN DATA LEAD (riêng agent)
// ==========================================
// GET /api/auth/account-status/:ten_dang_nhap
// sidebar.js gọi API này ở MỖI LẦN LOAD TRANG *VÀ* ĐỊNH KỲ (setInterval) để:
// 1) Phát hiện tài khoản vừa bị admin khoá -> tự động đăng xuất NGAY, không cần đợi
//    user F5 hay tự logout (trước đây tài khoản bị khoá vẫn dùng tiếp tới khi logout).
// 2) Với agent: biết có quyền xem_data_leads để ẩn/hiện menu "Data Lead" đúng thời điểm.
// Thay thế cho route /leads-access/:ten_dang_nhap cũ (đã gộp logic vào đây).
router.get('/account-status/:ten_dang_nhap', async (req, res) => {
    try {
        const { ten_dang_nhap } = req.params;

        const { data, error } = await req.supabase
            .from('users')
            .select('trang_thai, xem_data_leads, phan_quyen')
            .eq('ten_dang_nhap', ten_dang_nhap)
            .single();

        if (error || !data) {
            // Không tìm thấy tài khoản (ví dụ đã bị admin xoá) -> coi như đã khoá để buộc đăng xuất
            return res.json({ success: true, trang_thai: 'Tạm khoá', xem_data_leads: false });
        }

        res.json({
            success: true,
            trang_thai: data.trang_thai || 'Đang hoạt động',
            xem_data_leads: data.phan_quyen === 'admin' || data.xem_data_leads === true,
            phan_quyen: data.phan_quyen
        });
    } catch (err) {
        console.error('Lỗi kiểm tra trạng thái tài khoản:', err);
        // Lỗi server tạm thời -> KHÔNG ép logout (fail-open), tránh văng oan user khi mạng chập chờn
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;