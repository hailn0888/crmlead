// server.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Bắt buộc khi deploy trên Render/Heroku/Nginx...: server nằm sau 1 lớp reverse proxy,
// nếu không bật dòng này thì req.ip sẽ trả về IP nội bộ của proxy chứ KHÔNG PHẢI IP thật
// của nhân viên -> middleware chặn IP văn phòng (xem middleware/officeIp.middleware.js)
// sẽ luôn chặn sai hoặc không chặn được gì cả.
app.set('trust proxy', true);

// Endpoint "còn sống" cho dịch vụ ping (UptimeRobot / cron-job.org): giữ server Render gói Free không bị "ngủ",
// để job nhắc lịch vẫn chạy và gửi thông báo đẩy khi không ai đang mở web. Không trả dữ liệu gì.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use(cors());
app.use(express.json());
// cookie-parser với "chữ ký" (COOKIE_SECRET) để đọc/ghi cookie phiên đăng nhập (session_user)
// - dùng để middleware bên dưới biết CHÍNH XÁC ai đang mở link, kể cả khi họ gõ thẳng URL,
// vì trước đây server hoàn toàn không có cách nào biết ai gửi request (chỉ localStorage phía client).
app.use(cookieParser(process.env.COOKIE_SECRET || 'crm-lead-doi-chuoi-bi-mat-nay-trong-env'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Client RIÊNG cho module Nhắc lịch (job nền + bảng push_subscriptions đã khóa RLS).
// Dùng service_role key: CHỈ để trong .env của server, tuyệt đối không đưa ra frontend.
// Chưa khai báo SUPABASE_SERVICE_ROLE_KEY thì tạm dùng lại client anon ở trên:
// nhắc hẹn + chuông vẫn chạy, nhưng chưa lưu được thiết bị nhận Web Push.
const reminderSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[reminders] Chưa có SUPABASE_SERVICE_ROLE_KEY trong .env -> chưa lưu được thiết bị nhận Web Push.');
}

app.use((req, res, next) => {
    req.supabase = supabase;
    next();
});

// Chặn truy cập trực tiếp bằng link vào các trang cần quyền "xem_data_leads":
// leads.html và calls.html. Middleware này PHẢI đặt TRƯỚC express.static('public'),
// vì express.static là nơi thực sự trả file tĩnh - nếu đặt sau thì file đã bị trả về rồi,
// chặn không còn ý nghĩa. Nếu được phép, middleware gọi next() để express.static xử lý tiếp bình thường.
const checkLeadsAccess = require('./middleware/checkLeadsAccess');
app.get(['/agents/leads.html', '/agents/calls.html'], checkLeadsAccess);

app.use(express.static('public'));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/auth', require('./routes/auth.quenmatkhau')); 
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/leader', require('./routes/leader.routes'));
app.use('/api/agent', require('./routes/agent.routes'));
// Chặn tầng API: toàn bộ /api/calls/* yêu cầu quyền xem_data_leads (giống trang calls.html),
// phòng trường hợp gọi thẳng API mà không qua giao diện (Postman/devtools/script...).
const requireLeadsApiAccess = require('./middleware/requireLeadsApiAccess');
app.use('/api/calls', requireLeadsApiAccess, require('./routes/calls.routes'));
// Nhắc lịch chăm sóc khách hàng (Tab 4 của calls.html): cùng quyền xem_data_leads như /api/calls.
// Middleware giữa ghi đè req.supabase bằng client service_role để lưu thiết bị nhận push.
app.use('/api/reminders', requireLeadsApiAccess, (req, res, next) => {
    req.supabase = reminderSupabase;
    next();
}, require('./routes/reminders.routes'));
app.use('/api/ai', require('./routes/ai.routes'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hệ thống CRM Lead đang chạy mượt mà tại port ${PORT}`);
    // Job nền nhắc lịch gọi lại khách: quét mỗi phút, gửi chuông trong app + Web Push.
    // Chỉ chạy trên 1 tiến trình (không bật nhiều instance) để khỏi gửi trùng thông báo.
    // Bọc try/catch: nếu job nhắc lịch lỗi thì chỉ in lỗi ra log, KHÔNG làm sập cả website.
    try {
        require('./services/reminderJob').start(reminderSupabase);
    } catch (err) {
        console.error('[reminders] Không khởi động được job nhắc lịch:', err);
    }
});
