// routes/calls.routes.js
const express = require('express');
const router = express.Router();

// API lấy danh sách cuộc hẹn thành công cho tab "Danh sách hẹn gặp thành công"
router.get('/successful-appointments', async (req, res) => {
    try {
        const { agent, search, status, date } = req.query;
        
        // Lấy supabase client từ request (được gán ở middleware của server.js)
        const supabase = req.supabase;

        // Query bảng call_history lọc đúng kết quả "Hẹn gặp thành công"
        // FIX: bổ sung đủ các cột customers cần cho popup chi tiết hồ sơ
        // (trước đây chỉ có ho, ten, dia_chi -> thiếu cccd/gioi_tinh/ngay_sinh/tuoi)
        let query = supabase
            .from('call_history')
            .select(`
                id,
                dien_thoai,
                ten_agent,
                ket_qua_cuoc_goi,
                ghi_chu,
                thoi_gian_goi,
                customers:dien_thoai (ho, ten, dia_chi, cccd, gioi_tinh, ngay_sinh, tuoi)
            `)
            .eq('ket_qua_cuoc_goi', 'Hẹn gặp thành công')
            .order('thoi_gian_goi', { ascending: false });

        // Lọc theo tên agent nếu có truyền lên
        if (agent) {
            query = query.eq('ten_agent', agent);
        }

        // Lọc theo ngày nếu có (format: YYYY-MM-DD)
        if (date) {
            const startDate = `${date}T00:00:00`;
            const endDate = `${date}T23:59:59`;
            query = query.gte('thoi_gian_goi', startDate).lte('thoi_gian_goi', endDate);
        }

        const { data, error } = await query;
        if (error) throw error;

        let finalData = data || [];

        // FIX: call_history không có cột so_hop_dong nên không thể join contracts
        // ngay trong câu select ở trên. Bảng contracts lại có sẵn cột dien_thoai,
        // nên ở đây query riêng contracts theo danh sách số điện thoại rồi gắn
        // thủ công vào từng item (giống cách agent.routes.js đang làm ở /leads).
        const phoneList = [...new Set(finalData.map(item => item.dien_thoai).filter(Boolean))];

        if (phoneList.length > 0) {
            const { data: contractsData, error: contractError } = await supabase
                .from('contracts')
                .select('so_hop_dong, dien_thoai, ngay_tham_gia, nam_dao_han, menh_gia, file_id')
                .in('dien_thoai', phoneList);

            if (contractError) throw contractError;

            const contractsMap = new Map();
            (contractsData || []).forEach(c => {
                contractsMap.set(String(c.dien_thoai).trim(), c);
            });

            finalData = finalData.map(item => ({
                ...item,
                contracts: contractsMap.get(String(item.dien_thoai || '').trim()) || {}
            }));
        }

        // Xử lý lọc theo từ khóa tìm kiếm (tên khách hàng hoặc số điện thoại)
        if (search) {
            const keyword = search.toLowerCase();
            finalData = finalData.filter(item => {
                const cus = item.customers || {};
                const fullName = `${cus.ho || ''} ${cus.ten || ''}`.toLowerCase();
                const phone = String(item.dien_thoai || '');
                return fullName.includes(keyword) || phone.includes(keyword);
            });
        }

        res.json({ success: true, data: finalData });
    } catch (error) {
        console.error("Lỗi lấy danh sách hẹn gặp thành công:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ', error: error.message });
    }
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Thư mục lưu file đính kèm cuộc hẹn
// GIẢ ĐỊNH: static server đang serve "public/uploads" ra URL "/uploads"
// (khớp với favicon href="/uploads/favicon.png" đang dùng). Nếu server.js
// của bạn cấu hình static folder khác, báo mình sửa lại đường dẫn này.
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'appointments');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `hen-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const allowedExt = ['.jpg', '.jpeg', '.png', '.pdf', '.xls', '.xlsx'];
const uploadAppointmentFile = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExt.includes(ext)) cb(null, true);
        else cb(new Error('Chỉ chấp nhận file ảnh (jpg/png), Excel (xls/xlsx) hoặc PDF!'));
    }
});

// API: Gửi cuộc hẹn cho đồng nghiệp (DMO)
router.post('/:id/send', uploadAppointmentFile.single('file'), async (req, res) => {
    try {
        const supabase = req.supabase;
        const { id } = req.params;
        const { nguoi_nhan_id, nguoi_nhan_ten, nguoi_nhan_username, loai_hen, thoi_gian_khach_hen, ghi_chu } = req.body;

        if (!nguoi_nhan_id || !loai_hen) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin người nhận hoặc loại hẹn!' });
        }

        const updatePayload = {
            trang_thai_gui: 'Đã gửi',
            nguoi_nhan_id: Number(nguoi_nhan_id),
            nguoi_nhan_ten: nguoi_nhan_ten || null,
            nguoi_nhan_username: nguoi_nhan_username || null,
            loai_hen,
            thoi_gian_khach_hen: (loai_hen === 'Khách hẹn' && thoi_gian_khach_hen) ? thoi_gian_khach_hen : null,
            ghi_chu: ghi_chu || null,
            thoi_gian_gui: new Date().toISOString(),
            trang_thai_tiep_nhan: 'Chờ tiếp nhận'
        };

        if (req.file) {
            updatePayload.file_dinh_kem = `appointments/${req.file.filename}`;
        }

        const { error } = await supabase
            .from('call_history')
            .update(updatePayload)
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Đã gửi cuộc hẹn thành công!' });
    } catch (error) {
        console.error("Lỗi gửi cuộc hẹn:", error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server nội bộ' });
    }
});

module.exports = router;