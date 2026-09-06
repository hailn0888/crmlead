const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// API Gửi mã OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { ten_dang_nhap } = req.body;

        const { data: users, error } = await req.supabase
            .from('users')
            .select('*')
            .or(`ten_dang_nhap.eq.${ten_dang_nhap},email.eq.${ten_dang_nhap}`);

        if (error || !users || users.length === 0 || !users[0].email) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy tài khoản hoặc email này trong hệ thống!" 
            });
        }

        const user = users[0];
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiryTime = Date.now() + 10 * 60 * 1000; // Lưu dạng số nguyên

        await req.supabase
            .from('users')
            .update({ otp_code: otp, otp_expiry: expiryTime.toString() })
            .eq('id', user.id);

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Mã OTP khôi phục mật khẩu Quản trị viên (Admin)',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #2563eb;">Yêu cầu khôi phục mật khẩu</h2>
                    <p>Mã OTP của bạn là:</p>
                    <h1 style="background: #f1f5f9; padding: 10px 20px; display: inline-block; letter-spacing: 5px; color: #1e293b;">${otp}</h1>
                    <p style="color: #64748b; font-size: 14px;">Mã này có hiệu lực trong vòng <b>10 phút</b>.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Mã OTP đã được gửi về email của bạn!" });

    } catch (err) {
        console.error("Lỗi gửi mail:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi gửi mail!" });
    }
});

// API Xác thực OTP và Đổi mật khẩu mới (Khớp chính xác 100% payload từ login.html)
router.post('/reset-password', async (req, res) => {
    try {
        const { ten_dang_nhap, otp_code, mat_khau_moi } = req.body;

        if (!ten_dang_nhap || !otp_code || !mat_khau_moi) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin đầu vào!" });
        }

        const { data: users, error } = await req.supabase
            .from('users')
            .select('*')
            .or(`ten_dang_nhap.eq.${ten_dang_nhap},email.eq.${ten_dang_nhap}`);

        if (error || !users || users.length === 0) {
            return res.status(404).json({ success: false, message: "Tài khoản không tồn tại trong CSDL!" });
        }

        const user = users[0];

        // So khớp mã OTP
        if (!user.otp_code || String(user.otp_code).trim() !== String(otp_code).trim()) {
            return res.status(400).json({ success: false, message: "Mã OTP không chính xác!" });
        }

        // Kiểm tra hạn 10 phút
        if (user.otp_expiry) {
            const expiryNumber = parseInt(user.otp_expiry);
            if (!isNaN(expiryNumber) && Date.now() > expiryNumber) {
                return res.status(400).json({ success: false, message: "Mã OTP đã hết hiệu lực sau 10 phút!" });
            }
        }
        
        // Cập nhật mật khẩu mới và xóa sạch mã OTP
        const { error: updateError } = await req.supabase
            .from('users')
            .update({ 
                mat_khau: mat_khau_moi, 
                otp_code: null, 
                otp_expiry: null 
            })
            .eq('id', user.id);

        if (updateError) {
            return res.status(500).json({ success: false, message: "Không thể cập nhật mật khẩu mới!" });
        }

        res.json({ success: true, message: "Đổi mật khẩu thành công! Vui lòng đăng nhập lại." });

    } catch (err) {
        console.error("Lỗi server reset-password:", err);
        res.status(500).json({ success: false, message: "Lỗi server nội bộ!" });
    }
});

// ==========================================================================
// API: Đổi mật khẩu tự thân (dành cho Agent và Leader), khác với luồng quên
// mật khẩu qua OTP email ở trên (luồng đó chỉ dành cho Admin theo comment gốc).
// LƯU Ý BẢO MẬT: hệ thống hiện đang lưu mat_khau dạng văn bản thô (plain text) -
// xem API reset-password phía trên cũng gán thẳng "mat_khau: mat_khau_moi" không
// hash. Để nhất quán và không phá vỡ luồng đăng nhập hiện tại, API này cũng so
// sánh/lưu trực tiếp. Đây là điểm nên nâng cấp lên bcrypt trong một đợt cập nhật
// riêng có kiểm thử kỹ (vì sẽ ảnh hưởng cả login lẫn 2 API phía trên).
// ==========================================================================
router.post('/change-password', async (req, res) => {
    try {
        const { ten_dang_nhap, mat_khau_cu, mat_khau_moi } = req.body;

        if (!ten_dang_nhap || !mat_khau_cu || !mat_khau_moi) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin đầu vào!" });
        }

        if (String(mat_khau_moi).length < 6) {
            return res.status(400).json({ success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự!" });
        }

        // ten_dang_nhap ở đây có thể là ten_dang_nhap thật hoặc ho_va_ten (vì
        // frontend hiện chỉ lưu ho_va_ten ở localStorage sau khi đăng nhập)
        const { data: users, error } = await req.supabase
            .from('users')
            .select('*')
            .or(`ten_dang_nhap.eq.${ten_dang_nhap},ho_va_ten.eq.${ten_dang_nhap}`);

        if (error || !users || users.length === 0) {
            return res.status(404).json({ success: false, message: "Tài khoản không tồn tại trong CSDL!" });
        }

        const user = users[0];

        // Chỉ Agent và Leader được dùng chức năng này (Admin dùng luồng OTP email)
        const role = String(user.phan_quyen || '').trim().toLowerCase();
        if (role !== 'agent' && role !== 'leader') {
            return res.status(403).json({ success: false, message: "Chức năng này chỉ áp dụng cho tài khoản Agent hoặc Leader!" });
        }

        if (String(user.mat_khau) !== String(mat_khau_cu)) {
            return res.status(400).json({ success: false, message: "Mật khẩu hiện tại không đúng!" });
        }

        const { error: updateError } = await req.supabase
            .from('users')
            .update({ mat_khau: mat_khau_moi })
            .eq('id', user.id);

        if (updateError) {
            return res.status(500).json({ success: false, message: "Không thể cập nhật mật khẩu mới!" });
        }

        res.json({ success: true, message: "Đổi mật khẩu thành công!" });
    } catch (err) {
        console.error("Lỗi đổi mật khẩu:", err);
        res.status(500).json({ success: false, message: "Lỗi server nội bộ!" });
    }
});

module.exports = router;