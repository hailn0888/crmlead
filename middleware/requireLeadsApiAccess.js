// middleware/requireLeadsApiAccess.js
// Chặn tầng API (không chỉ chặn trang HTML) cho các route cần quyền "xem_data_leads",
// ví dụ /api/calls/*. Phòng trường hợp ai đó không mở qua giao diện mà gọi thẳng API
// (Postman, devtools, script...). Trả về JSON vì đây là API cho fetch() gọi, không phải
// trang HTML để redirect như middleware/checkLeadsAccess.js.

const { kiemTraQuyenLeads } = require('./leadsPermission.helper');

const THONG_BAO = {
    chua_dang_nhap: { status: 401, message: 'Bạn cần đăng nhập lại.' },
    khong_tim_thay: { status: 401, message: 'Không xác định được tài khoản, vui lòng đăng nhập lại.' },
    bi_khoa: { status: 403, message: 'Tài khoản của bạn đang bị khoá.' },
    khong_co_quyen: { status: 403, message: 'Bạn chưa được cấp quyền sử dụng chức năng này. Vui lòng liên hệ admin.' }
};

module.exports = async function requireLeadsApiAccess(req, res, next) {
    try {
        const tenDangNhap = req.signedCookies ? req.signedCookies.session_user : null;
        const ketQua = await kiemTraQuyenLeads(req.supabase, tenDangNhap);

        if (!ketQua.ok) {
            const tb = THONG_BAO[ketQua.reason] || { status: 403, message: 'Không có quyền truy cập.' };
            return res.status(tb.status).json({ success: false, message: tb.message });
        }

        next();
    } catch (err) {
        console.error('Lỗi middleware requireLeadsApiAccess:', err);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ.' });
    }
};