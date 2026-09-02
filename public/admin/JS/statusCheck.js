// public/admin/js/statusCheck.js
const supabase = require('../config/supabaseClient'); // Đường dẫn tới file khởi tạo Supabase client

/**
 * Kiểm tra trạng thái tài khoản và tự động khoá nếu quá 15 ngày không đăng nhập
 * @param {number|string} userId - ID của user cần kiểm tra
 * @returns {Object} { allowed: boolean, message: string }
 */
async function checkAndUpdateUserStatus(userId) {
    try {
        // 1. Lấy thông tin user từ Supabase
        const { data: user, error } = await supabase
            .from('users')
            .select('id, trang_thai, last_login')
            .eq('id', userId)
            .single();

        if (error || !user) {
            return { allowed: false, message: 'Không tìm thấy thông tin tài khoản.' };
        }

        // 2. Nếu admin đã chủ động tạm khoá thủ công
        if (user.trang_thai === 'Tạm khoá') {
            return { allowed: false, message: 'Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ Admin.' };
        }

        // 3. Kiểm tra thời gian không đăng nhập (quá 15 ngày)
        if (user.last_login) {
            const lastLoginDate = new Date(user.last_login);
            const now = new Date();
            const diffTime = Math.abs(now - lastLoginDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 15) {
                // Tự động chuyển trạng thái thành 'Tạm khoá' trong DB
                await supabase
                    .from('users')
                    .update({ trang_thai: 'Tạm khoá' })
                    .eq('id', userId);

                return { 
                    allowed: false, 
                    message: 'Tài khoản đã bị tạm khóa do không hoạt động trong vòng 15 ngày qua.' 
                };
            }
        }

        // 4. Hợp lệ: Cập nhật lại mốc thời gian đăng nhập mới nhất
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userId);

        return { allowed: true, message: 'Đăng nhập thành công.' };

    } catch (err) {
        console.error('Lỗi kiểm tra trạng thái user:', err);
        return { allowed: false, message: 'Lỗi hệ thống khi kiểm tra trạng thái.' };
    }
}

module.exports = { checkAndUpdateUserStatus };