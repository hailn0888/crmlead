// routes/calls.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ==========================================================================
// CẤU HÌNH UPLOAD FILE ĐÍNH KÈM CUỘC HẸN
// ==========================================================================
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

// ==========================================================================
// HÀM PHỤ: Tự động thu hồi các hẹn đã gửi quá 24h mà DMO chưa bấm "Tiếp nhận"
// Được gọi ở ĐẦU mỗi API GET danh sách (tab1/tab2/tab3) để dữ liệu luôn tự
// đồng bộ đúng trạng thái mới nhất trước khi trả về cho frontend.
// ==========================================================================
async function revertExpiredAppointments(supabase) {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Lưu ý: dùng .or() để bắt luôn trường hợp trang_thai_tiep_nhan đang NULL
        // (Postgres: NULL != 'Đã tiếp nhận' trả về NULL chứ không phải true,
        // nên nếu chỉ dùng .neq() sẽ bỏ sót các dòng chưa từng được tiếp nhận)
        const { data: expiredRows, error: findErr } = await supabase
            .from('call_history')
            .select('id')
            .eq('trang_thai_gui', 'Đã gửi')
            .or('trang_thai_tiep_nhan.is.null,trang_thai_tiep_nhan.neq.Đã tiếp nhận')
            .lt('thoi_gian_gui', twentyFourHoursAgo);

        if (findErr) {
            console.error("Lỗi tìm hẹn quá hạn:", findErr);
            return;
        }
        if (!expiredRows || expiredRows.length === 0) return;

        const idsToRevert = expiredRows.map(r => r.id);

        // Quay về "Chưa gửi" để nút "Gửi hẹn" ở Tab 1 được enable lại,
        // đồng thời đánh dấu trang_thai_tiep_nhan = 'Không tiếp nhận' để lưu lịch sử
        await supabase
            .from('call_history')
            .update({ trang_thai_gui: 'Chưa gửi', trang_thai_tiep_nhan: 'Không tiếp nhận' })
            .in('id', idsToRevert);
    } catch (err) {
        console.error("Lỗi thu hồi hẹn quá hạn tự động:", err);
    }
}

// Hàm phụ: tra ten_dang_nhap từ ho_va_ten (vì client chỉ lưu ho_va_ten ở localStorage,
// trong khi cột nguoi_nhan_username trong DB lưu ten_dang_nhap)
async function resolveUsername(supabase, agentDisplayName) {
    const { data, error } = await supabase
        .from('users')
        .select('ten_dang_nhap')
        .or(`ho_va_ten.eq.${agentDisplayName},ten_dang_nhap.eq.${agentDisplayName}`)
        .single();
    if (error || !data) return null;
    return data.ten_dang_nhap;
}

// ==========================================================================
// TAB 1: "Danh sách hẹn gặp thành công"
// Nguồn: tất cả cuộc gọi có kết quả "Hẹn gặp thành công" của CHÍNH agent này
// ==========================================================================
router.get('/successful-appointments', async (req, res) => {
    try {
        const { agent, search, date } = req.query;
        const supabase = req.supabase;

        await revertExpiredAppointments(supabase);

        // FIX: bổ sung đầy đủ các cột trạng thái gửi hẹn / người nhận / file đính kèm
        // (trước đây thiếu hoàn toàn nên Tab 1 luôn hiện "Chưa gửi" dù đã gửi thành công)
        let query = supabase
            .from('call_history')
            .select(`
                id, dien_thoai, ten_agent, ket_qua_cuoc_goi, ghi_chu, ghi_chu_hen,
                thoi_gian_goi, thoi_gian_gui, trang_thai_gui, trang_thai_tiep_nhan,
                nguoi_nhan_id, nguoi_nhan_ten, nguoi_nhan_username,
                loai_hen, thoi_gian_khach_hen, file_dinh_kem, bao_cao_hen,
                customers:dien_thoai (ho, ten, dia_chi, cccd, gioi_tinh, ngay_sinh, tuoi)
            `)
            .eq('ket_qua_cuoc_goi', 'Hẹn gặp thành công')
            .order('thoi_gian_goi', { ascending: false });

        if (agent) query = query.eq('ten_agent', agent);

        if (date) {
            query = query.gte('thoi_gian_goi', `${date}T00:00:00`).lte('thoi_gian_goi', `${date}T23:59:59`);
        }

        const { data, error } = await query;
        if (error) throw error;

        let finalData = data || [];

        // Join thủ công sang bảng contracts theo dien_thoai (contracts có sẵn cột này)
        const phoneList = [...new Set(finalData.map(item => item.dien_thoai).filter(Boolean))];
        if (phoneList.length > 0) {
            const { data: contractsData, error: contractError } = await supabase
                .from('contracts')
                .select('so_hop_dong, dien_thoai, ngay_tham_gia, nam_dao_han, menh_gia, file_id')
                .in('dien_thoai', phoneList);
            if (contractError) throw contractError;

            const contractsMap = new Map();
            (contractsData || []).forEach(c => contractsMap.set(String(c.dien_thoai).trim(), c));

            finalData = finalData.map(item => ({
                ...item,
                contracts: contractsMap.get(String(item.dien_thoai || '').trim()) || {}
            }));
        }

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

// ==========================================================================
// TAB 2: "Hẹn đã gửi" - những hẹn CHÍNH agent này đã gửi cho đồng nghiệp,
// hiện vẫn đang ở trạng thái "Đã gửi" (chưa bị thu hồi/quay về Chưa gửi)
// ==========================================================================
router.get('/sent-appointments', async (req, res) => {
    try {
        const { agent, date } = req.query;
        const supabase = req.supabase;

        await revertExpiredAppointments(supabase);

        let query = supabase
            .from('call_history')
            .select(`
                id, dien_thoai, ten_agent, ghi_chu, ghi_chu_hen, thoi_gian_goi, thoi_gian_gui,
                trang_thai_gui, trang_thai_tiep_nhan, nguoi_nhan_id, nguoi_nhan_ten, nguoi_nhan_username,
                loai_hen, thoi_gian_khach_hen, file_dinh_kem, bao_cao_hen,
                customers:dien_thoai (ho, ten, dia_chi)
            `)
            .eq('trang_thai_gui', 'Đã gửi')
            .order('thoi_gian_gui', { ascending: false });

        if (agent) query = query.eq('ten_agent', agent);

        if (date) {
            query = query.gte('thoi_gian_gui', `${date}T00:00:00`).lte('thoi_gian_gui', `${date}T23:59:59`);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error("Lỗi lấy danh sách hẹn đã gửi:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ', error: error.message });
    }
});

// ==========================================================================
// TAB 3: "Hẹn được gửi" - những hẹn đồng nghiệp KHÁC gửi CHO agent này.
// QUAN TRỌNG: che (mask) toàn bộ dữ liệu nhạy cảm nếu agent CHƯA bấm
// "Tiếp nhận" - việc che này làm ở BACKEND (không phải chỉ ẩn ở giao diện)
// để đảm bảo dữ liệu thật sự không bị lộ qua network tab / DevTools.
// ==========================================================================
router.get('/received-appointments', async (req, res) => {
    try {
        const { agent, date } = req.query;
        const supabase = req.supabase;

        if (!agent) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });
        }

        await revertExpiredAppointments(supabase);

        // cột nguoi_nhan_username lưu ten_dang_nhap, trong khi client chỉ có ho_va_ten
        // -> cần tra cứu users để lấy đúng ten_dang_nhap trước khi lọc
        const username = await resolveUsername(supabase, agent);
        if (!username) {
            return res.json({ success: true, data: [] });
        }

        let query = supabase
            .from('call_history')
            .select(`
                id, dien_thoai, ten_agent, ket_qua_cuoc_goi, ghi_chu, ghi_chu_hen,
                thoi_gian_goi, thoi_gian_gui, trang_thai_gui, trang_thai_tiep_nhan,
                nguoi_nhan_id, nguoi_nhan_ten, nguoi_nhan_username,
                loai_hen, thoi_gian_khach_hen, file_dinh_kem, bao_cao_hen,
                customers:dien_thoai (ho, ten, dia_chi, cccd, gioi_tinh, ngay_sinh, tuoi)
            `)
            .eq('nguoi_nhan_username', username)
            .eq('trang_thai_gui', 'Đã gửi')
            .order('thoi_gian_gui', { ascending: false });

        if (date) {
            query = query.gte('thoi_gian_gui', `${date}T00:00:00`).lte('thoi_gian_gui', `${date}T23:59:59`);
        }

        const { data, error } = await query;
        if (error) throw error;

        let finalData = data || [];

        // Join thủ công sang contracts (giống Tab 1) để popup chi tiết khách hàng
        // hiện đủ Số hợp đồng/Ngày tham gia/Năm đáo hạn/Mệnh giá SAU KHI đã tiếp nhận
        const phoneList = [...new Set(finalData.map(item => item.dien_thoai).filter(Boolean))];
        let contractsMap = new Map();
        if (phoneList.length > 0) {
            const { data: contractsData, error: contractError } = await supabase
                .from('contracts')
                .select('so_hop_dong, dien_thoai, ngay_tham_gia, nam_dao_han, menh_gia, file_id')
                .in('dien_thoai', phoneList);
            if (contractError) throw contractError;
            (contractsData || []).forEach(c => contractsMap.set(String(c.dien_thoai).trim(), c));
        }

        // Che dữ liệu nhạy cảm nếu CHƯA bấm "Tiếp nhận":
        // - Số điện thoại: che giữa (VD 375***092)
        // - File đính kèm: xoá hẳn tên file (chặn tải xuống)
        // - Thông tin khách hàng: chỉ giữ ho, ten, dia_chi - bỏ cccd/gioi_tinh/ngay_sinh/tuoi
        // - Hợp đồng: ẩn hoàn toàn (chỉ hiện sau khi đã tiếp nhận)
        const maskedData = finalData.map(item => {
            const daTiepNhan = item.trang_thai_tiep_nhan === 'Đã tiếp nhận';
            const contract = contractsMap.get(String(item.dien_thoai || '').trim()) || {};

            if (daTiepNhan) {
                return { ...item, contracts: contract };
            }

            const customer = item.customers || {};
            const rawPhone = String(item.dien_thoai || '');
            const maskedPhone = rawPhone.length >= 6
                ? rawPhone.slice(0, 3) + '***' + rawPhone.slice(-3)
                : '***';

            return {
                ...item,
                dien_thoai: maskedPhone,
                file_dinh_kem: null,
                contracts: {},
                customers: {
                    ho: customer.ho,
                    ten: customer.ten,
                    dia_chi: customer.dia_chi
                }
            };
        });

        res.json({ success: true, data: maskedData });
    } catch (error) {
        console.error("Lỗi lấy danh sách hẹn được gửi:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ', error: error.message });
    }
});

// ==========================================================================
// API: Gửi cuộc hẹn cho đồng nghiệp (nút Send ở Tab 1)
// ==========================================================================
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
            // FIX: dùng cột ghi_chu_hen RIÊNG, không ghi đè cột ghi_chu gốc
            // (ghi_chu gốc là ghi chú của cuộc GỌI, không phải ghi chú của cuộc HẸN)
            ghi_chu_hen: ghi_chu || null,
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

// ==========================================================================
// API: Tiếp nhận / Không tiếp nhận (nút bấm ở Tab 3, phía người NHẬN hẹn)
// ==========================================================================
router.post('/:id/accept', async (req, res) => {
    try {
        const supabase = req.supabase;
        const { id } = req.params;
        const { accepted } = req.body;

        // Nếu "Không tiếp nhận": quay trang_thai_gui về 'Chưa gửi' ngay lập tức
        // (giống hệt logic tự động thu hồi khi hết 24h)
        const updatePayload = accepted
            ? { trang_thai_tiep_nhan: 'Đã tiếp nhận' }
            : { trang_thai_tiep_nhan: 'Không tiếp nhận', trang_thai_gui: 'Chưa gửi' };

        const { error } = await supabase.from('call_history').update(updatePayload).eq('id', id);
        if (error) throw error;

        res.json({ success: true, message: accepted ? 'Đã tiếp nhận cuộc hẹn!' : 'Đã từ chối tiếp nhận!' });
    } catch (error) {
        console.error("Lỗi xử lý tiếp nhận hẹn:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
    }
});

// ==========================================================================
// API: Lưu báo cáo cuộc hẹn (nút bấm ở Tab 3, sau khi đã tiếp nhận và đi gặp
// khách xong - kết quả này sẽ hiện lại cho người GỬI xem ở Tab 2)
// ==========================================================================
router.post('/:id/report', async (req, res) => {
    try {
        const supabase = req.supabase;
        const { id } = req.params;
        const { bao_cao_hen } = req.body;

        const { error } = await supabase
            .from('call_history')
            .update({ bao_cao_hen: bao_cao_hen || null })
            .eq('id', id);
        if (error) throw error;

        res.json({ success: true, message: 'Đã lưu báo cáo hẹn!' });
    } catch (error) {
        console.error("Lỗi lưu báo cáo hẹn:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
    }
});

// ==========================================================================
// API: Thu hồi cuộc hẹn đã gửi (nút bấm ở Tab 2, phía người GỬI hẹn)
// ==========================================================================
router.post('/:id/recall', async (req, res) => {
    try {
        const supabase = req.supabase;
        const { id } = req.params;

        const { error } = await supabase
            .from('call_history')
            .update({
                trang_thai_gui: 'Chưa gửi',
                trang_thai_tiep_nhan: null,
                nguoi_nhan_id: null,
                nguoi_nhan_ten: null,
                nguoi_nhan_username: null,
                loai_hen: null,
                thoi_gian_khach_hen: null,
                thoi_gian_gui: null,
                file_dinh_kem: null,
                ghi_chu_hen: null
            })
            .eq('id', id);
        if (error) throw error;

        res.json({ success: true, message: 'Đã thu hồi cuộc hẹn!' });
    } catch (error) {
        console.error("Lỗi thu hồi cuộc hẹn:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
    }
});

module.exports = router;