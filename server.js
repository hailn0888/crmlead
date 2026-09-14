// server.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
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
app.use(express.static('public'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use((req, res, next) => {
    req.supabase = supabase;
    next();
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/auth', require('./routes/auth.quenmatkhau')); 
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/leader', require('./routes/leader.routes'));
app.use('/api/agent', require('./routes/agent.routes'));
app.use('/api/calls', require('./routes/calls.routes'));
app.use('/api/ai', require('./routes/ai.routes'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hệ thống CRM Lead đang chạy mượt mà tại port ${PORT}`);
});