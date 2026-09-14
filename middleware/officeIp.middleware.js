// middleware/officeIp.middleware.js
//
// Middleware chặn truy cập ngoài IP văn phòng - CHỈ áp dụng cho user có cờ ip_limit = true
// trong bảng "users" (được admin bật/tắt qua nút toggle "Giới hạn IP" ở trang quản lý user -
// xem toggleIpLimit() trong users.html và route PATCH /users/:id/toggle-ip-limit trong
// admin.routes.js). Ai KHÔNG bị bật cờ này thì vẫn truy cập bình thường từ bất kỳ đâu.
//
// CÁCH DÙNG: gắn middleware này vào route GET /leads trong agent.routes.js (route thật sự
// trả dữ liệu Hồ Sơ Khách Hàng cho leads.html):
//
//   const checkOfficeIp = require('../middleware/officeIp.middleware');
//   router.get('/leads', checkOfficeIp('agent'), async (req, res) => { ... });
//
// Tham số truyền vào checkOfficeIp(...) là tên field trên req.query (hoặc req.body nếu
// route dùng POST) chứa định danh agent. Cách match user CỐ Ý giống hệt hàm getAgentId()
// đã có sẵn trong agent.routes.js: tìm user có ho_va_ten HOẶC ten_dang_nhap khớp giá trị đó
// (vì leads.js hiện đang gửi lên có lúc là họ tên, có lúc là tên đăng nhập tuỳ trang).

// Danh sách IP văn phòng được phép - thêm IP khác vào mảng này nếu sau này có nhiều điểm
// ra Internet (nhiều chi nhánh, hoặc IP dự phòng).
const OFFICE_IPS = ['14.169.91.226'];

// Lấy đúng IP thật của client. Ứng dụng chạy sau reverse proxy (Render) nên cần
// app.set('trust proxy', true) ở server.js để req.ip tự lấy đúng từ header x-forwarded-for
// thay vì lấy nhầm IP nội bộ của proxy.
function extractClientIp(req) {
    let ip = req.ip || '';
    // IPv4 ánh xạ qua IPv6 thường có dạng "::ffff:1.2.3.4" - cắt tiền tố cho dễ so sánh
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
}

/**
 * @param {string} agentField - tên field trên req.query/req.body chứa định danh agent
 *        (mặc định 'agent', đúng theo cách GET /leads trong agent.routes.js đang nhận).
 */
function checkOfficeIp(agentField) {
    const field = agentField || 'agent';
    return async function (req, res, next) {
        try {
            const agentValue = req.query[field] || (req.body && req.body[field]);

            if (!agentValue) {
                // Không xác định được đang là agent nào -> không đủ căn cứ để chặn, cho qua
                // (fail-open); bản thân route /leads cũng đã tự trả lỗi 400 riêng cho trường
                // hợp thiếu tham số này rồi, middleware không cần lo phần đó.
                return next();
            }

            // Match giống hệt getAgentId() trong agent.routes.js: khớp theo họ tên HOẶC
            // tên đăng nhập, vì client có lúc gửi lên giá trị nào cũng có.
            const { data: user, error } = await req.supabase
                .from('users')
                .select('id, ip_limit')
                .or(`ho_va_ten.eq.${agentValue},ten_dang_nhap.eq.${agentValue}`)
                .maybeSingle();

            if (error || !user || !user.ip_limit) {
                // Không tìm thấy user, hoặc user này KHÔNG bị admin bật Giới hạn IP -> cho qua
                return next();
            }

            const clientIp = extractClientIp(req);
            if (OFFICE_IPS.includes(clientIp)) {
                return next(); // Đúng IP văn phòng -> cho qua bình thường
            }

            // Sai IP văn phòng VÀ user này đang bị bật Giới hạn IP -> chặn.
            // Trả đúng field "blocked: true" để public/agents/js/ip-guard.js ở frontend
            // nhận diện và hiển thị màn hình thông báo (xem file đó để biết cơ chế bắt lỗi).
            return res.status(403).json({
                success: false,
                blocked: true,
                message: 'Bạn cần đến văn phòng để nhận data lead'
            });
        } catch (err) {
            console.error('checkOfficeIp middleware error:', err.message);
            // Lỗi hệ thống (DB lỗi, v.v.) thì fail-open - KHÔNG chặn oan nhân viên vì lỗi kỹ
            // thuật không phải lỗi của họ. Nếu bro muốn ưu tiên an toàn hơn (thà chặn nhầm còn
            // hơn lọt), đổi next() thành res.status(500)... ở dòng dưới, nhưng mặc định để
            // fail-open cho đỡ ảnh hưởng vận hành khi có sự cố ngoài ý muốn.
            return next();
        }
    };
}

module.exports = checkOfficeIp;