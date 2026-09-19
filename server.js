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

app.use(cors());
app.use(express.json());
// cookie-parser với "chữ ký" (COOKIE_SECRET) để đọc/ghi cookie phiên đăng nhập (session_user)
// - dùng để middleware bên dưới biết CHÍNH XÁC ai đang mở link, kể cả khi họ gõ thẳng URL,
// vì trước đây server hoàn toàn không có cách nào biết ai gửi request (chỉ localStorage phía client).
app.use(cookieParser(process.env.COOKIE_SECRET || 'crm-lead-doi-chuoi-bi-mat-nay-trong-env'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
app.use('/api/ai', require('./routes/ai.routes'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hệ thống CRM Lead đang chạy mượt mà tại port ${PORT}`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hệ thống CRM Lead đang chạy mượt mà tại port ${PORT}`);
});