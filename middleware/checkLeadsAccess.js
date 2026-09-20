// middleware/checkLeadsAccess.js
// Chặn truy cập trực tiếp bằng link (gõ thẳng URL, share link, bookmark...) vào leads.html
// và calls.html nếu tài khoản chưa được admin cấp quyền "xem_data_leads" (cột "Data Leads"
// trong trang Quản lý User), hoặc tài khoản đang bị khoá / chưa đăng nhập.
//
// Dùng chung logic kiểm tra với middleware/requireLeadsApiAccess.js qua leadsPermission.helper.js.

const { kiemTraQuyenLeads } = require('./leadsPermission.helper');

module.exports = async function checkLeadsAccess(req, res, next) {
    try {
        const tenDangNhap = req.signedCookies ? req.signedCookies.session_user : null;
        const ketQua = await kiemTraQuyenLeads(req.supabase, tenDangNhap);

        if (ketQua.ok) {
            // Được phép -> để express.static (đăng ký ngay sau middleware này trong server.js) trả file bình thường
            return next();
        }

        if (ketQua.reason === 'chua_dang_nhap' || ketQua.reason === 'khong_tim_thay') {
            return res.redirect('/login.html');
        }

        if (ketQua.reason === 'bi_khoa') {
            return res.status(403).send(renderThongBao(
                'Tài khoản của bạn đang bị khoá. Vui lòng liên hệ admin.',
                '/login.html'
            ));
        }

        // reason === 'khong_co_quyen'
        return res.status(403).send(renderThongBao(
            'Bạn chưa được cấp quyền truy cập trang này. Vui lòng liên hệ admin.',
            '/agents/dashboard_agents.html'
        ));
    } catch (err) {
        console.error('Lỗi middleware checkLeadsAccess:', err);
        return res.redirect('/login.html');
    }
};

// Trang thông báo nhỏ gọn, tự hiện Swal rồi điều hướng - không cần tạo thêm file 403.html riêng
function renderThongBao(message, redirectTo) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Không có quyền truy cập</title>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body>
    <script>
        Swal.fire({
            icon: 'warning',
            title: 'Thông báo',
            text: ${JSON.stringify(message)},
            confirmButtonText: 'Đã hiểu'
        }).then(() => {
            window.location.href = ${JSON.stringify(redirectTo)};
        });
    </script>
</body>
</html>`;
}