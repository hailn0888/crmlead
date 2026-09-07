// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // Lưu file tạm trên RAM trước khi đọc
const XLSX = require('xlsx');

/**
 * Hàm hỗ trợ chuyển đổi linh hoạt các định dạng ngày tháng từ Excel sang YYYY-MM-DD chuẩn cho Database
 */
function parseFlexibleDate(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return null;

    const strVal = String(rawVal).trim();

    // 1. Trường hợp đặc biệt: Excel trả về dạng chuỗi 8 số liên tục (VD: "20120816")
    if (/^\d{8}$/.test(strVal)) {
        const year = strVal.substring(0, 4);
        const month = strVal.substring(4, 6);
        const day = strVal.substring(6, 8);
        const formatted = `${year}-${month}-${day}`;
        const testDate = new Date(formatted);
        if (!isNaN(testDate.getTime())) {
            return formatted;
        }
    }

    // 2. Trường hợp dạng số serial của Excel (VD: 41138)
    if (!isNaN(rawVal) && strVal.length <= 6) {
        const serial = Number(rawVal);
        if (serial > 1000) {
            const utcDays = Math.floor(serial - 25569);
            const utcValue = utcDays * 86400 * 1000;
            const dateInfo = new Date(utcValue);
            if (!isNaN(dateInfo.getTime())) {
                return dateInfo.toISOString().split('T')[0];
            }
        }
    }

    // 3. Trường hợp chuẩn ISO hoặc chuỗi ngày thông thường
    let parsedDate = new Date(strVal);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split('T')[0];
    }

    // 4. Xử lý các định dạng có dấu gạch chéo hoặc gạch ngang (DD/MM/YYYY hoặc MM/DD/YYYY)
    const parts = strVal.split(/[\/\-]/);
    if (parts.length === 3) {
        let month = parts[0];
        let day = parts[1];
        let year = parts[2];

        if (year.length === 4 && parts[0].length === 4) {
            year = parts[0];
            month = parts[1];
            day = parts[2];
        } else if (year.length === 2) {
            year = (parseInt(year) > 50 ? '19' : '20') + year;
        }

        if (year.length === 4 && !isNaN(month) && !isNaN(day)) {
            const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const testDate = new Date(formatted);
            if (!isNaN(testDate.getTime())) {
                return formatted;
            }
        }
    }

    return null;
}

// ==========================================
// 0. KIỂM TRA TRẠNG THÁI ROUTE
// ==========================================
router.get('/', (req, res) => {
    res.json({ message: "Route đang hoạt động bình thường!" });
});


// ==========================================
// 1. QUẢN LÝ USER & GROUPS (NHÂN SỰ & NHÓM)
// ==========================================

router.get('/users', async (req, res) => {
    try {
        const { data: users, error: userError } = await req.supabase
            .from('users')
            .select('*')
            .order('id', { ascending: false });

        if (userError) throw userError;

        const formattedData = users.map(u => ({
            ...u,
            ten_nhom: u.ten_nhom || 'Chưa có nhóm',
            leader_name: u.truong_nhom || 'Không có'
        }));

        res.json({ success: true, data: formattedData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/groups', async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('users')
            .select('id, ten_nhom, truong_nhom, group_id, phan_quyen, ho_va_ten')
            .not('ten_nhom', 'is', null);

        if (error) throw error;

        const groupMap = new Map();
        data.forEach(u => {
            if (u.ten_nhom && !groupMap.has(u.ten_nhom)) {
                groupMap.set(u.ten_nhom, {
                    id: u.group_id || u.id,
                    ten_nhom: u.ten_nhom,
                    leader_name: u.truong_nhom || (u.phan_quyen?.toLowerCase() === 'leader' ? u.ho_va_ten : 'Chưa có')
                });
            }
        });

        res.json({ success: true, data: Array.from(groupMap.values()) });
    } catch (err) {
        res.status(500).json({ success: false, message: "Lỗi server: " + err.message });
    }
});

router.post('/users', async (req, res) => {
    try {
        const { ten_dang_nhap, mat_khau, ho_va_ten, phan_quyen, ten_nhom, truong_nhom } = req.body;

        const { error } = await req.supabase
            .from('users')
            .insert([{ 
                ten_dang_nhap, 
                mat_khau, 
                ho_va_ten, 
                phan_quyen, 
                ten_nhom: ten_nhom || null,
                truong_nhom: truong_nhom || null,
                trang_thai: 'Đang hoạt động',
                last_login: new Date().toISOString()
            }]);

        if (error) throw error;

        res.json({ success: true, message: "Thêm tài khoản thành công !" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { data: userRecord } = await req.supabase.from('users').select('ho_va_ten').eq('id', userId).single();
        const tenNhanVien = userRecord ? userRecord.ho_va_ten : `ID: ${userId}`;

        const { error } = await req.supabase.from('users').delete().eq('id', userId);
        if (error) throw error;

        res.json({ success: true, message: `Đã xóa nhân viên: ${tenNhanVien}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.patch('/users/:id/toggle-lock', async (req, res) => {
    try {
        const userId = req.params.id;
        const { data: user, error: fetchError } = await req.supabase.from('users').select('trang_thai').eq('id', userId).single();

        if (fetchError || !user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        }

        const currentStatus = user.trang_thai || 'Đang hoạt động';
        const newStatus = currentStatus === 'Đang hoạt động' ? 'Tạm khoá' : 'Đang hoạt động';

        const { error: updateError } = await req.supabase.from('users').update({ trang_thai: newStatus }).eq('id', userId);
        if (updateError) throw updateError;

        res.json({ success: true, trang_thai: newStatus });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// ==========================================
// 2. QUẢN LÝ DATA FILE & BATCH (TẢI LÊN & XỬ LÝ EXCEL)
// ==========================================

router.get('/data-files', async (req, res) => {
    try {
        const { data: files, error } = await req.supabase
            .from('data_files')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, files: files || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /data-files/stats - Tính toán số liệu Chưa Gọi / Đã Gọi / Đã Hẹn THẬT SỰ cho từng file,
 * dựa trên kết quả cuộc gọi MỚI NHẤT của từng số điện thoại trong bảng call_history.
 * FIX: trước đây quanlydata.html hardcode cứng "Chưa Gọi = tổng số, Đã Gọi = 0, Đã Hẹn = 0"
 * (dòng renderTab3FileList) - route này cung cấp dữ liệu thật để thay thế.
 */
router.get('/data-files/stats', async (req, res) => {
    try {
        // 1. Lấy toàn bộ contracts (chỉ cần file_id + dien_thoai để gom nhóm/đếm)
        const { data: contracts, error: cErr } = await req.supabase
            .from('contracts')
            .select('file_id, dien_thoai');
        if (cErr) throw cErr;

        const phoneList = [...new Set((contracts || []).map(c => c.dien_thoai).filter(Boolean))];

        // 2. Lấy lịch sử cuộc gọi của các số này, sắp mới nhất lên đầu để lấy kết quả GẦN NHẤT
        const callMap = new Map(); // dien_thoai (trim) -> ket_qua_cuoc_goi mới nhất
        if (phoneList.length > 0) {
            const { data: calls, error: callErr } = await req.supabase
                .from('call_history')
                .select('dien_thoai, ket_qua_cuoc_goi, thoi_gian_goi')
                .in('dien_thoai', phoneList)
                .order('thoi_gian_goi', { ascending: false });
            if (callErr) throw callErr;

            (calls || []).forEach(c => {
                const phone = String(c.dien_thoai || '').trim();
                // Chỉ set 1 lần cho mỗi số (vì đã order mới nhất trước, dòng đầu tiên gặp là mới nhất)
                if (phone && !callMap.has(phone)) {
                    callMap.set(phone, c.ket_qua_cuoc_goi);
                }
            });
        }

        // 3. Gom nhóm theo file_id, đếm 3 trạng thái
        // Quy ước (khớp logic calculateCallStatistics() trong chuadahen.js):
        // - "Đã Gọi" tính TẤT CẢ các lead đã có kết quả cuộc gọi (bao gồm cả lead đã hẹn thành công)
        // - "Đã Hẹn" là tập CON của "Đã Gọi", chỉ tính khi kết quả = "Hẹn gặp thành công"
        const statsMap = {};
        (contracts || []).forEach(c => {
            const fileId = c.file_id;
            if (!fileId) return;
            if (!statsMap[fileId]) statsMap[fileId] = { chuaGoi: 0, daGoi: 0, daHen: 0 };

            const phone = String(c.dien_thoai || '').trim();
            const ketQua = callMap.get(phone);

            if (!ketQua) {
                statsMap[fileId].chuaGoi++;
            } else {
                statsMap[fileId].daGoi++;
                if (ketQua === 'Hẹn gặp thành công') statsMap[fileId].daHen++;
            }
        });

        res.json({ success: true, data: statsMap });
    } catch (error) {
        console.error("Lỗi tính thống kê data-files:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /upload-data - Tải lên file Excel và tự động gán file_id cho từng dòng contracts
 */
router.post('/upload-data', upload.array('files'), async (req, res) => {
    try {
        const uploadedFiles = req.files || (req.file ? [req.file] : []);

        if (uploadedFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn file tải lên.' });
        }

        for (const file of uploadedFiles) {
            const fileName = file.originalname;
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const totalRecords = rows.length > 1 ? rows.length - 1 : 0;

            // Bước 1: Lưu thông tin file vào bảng data_files
            const { data: fileRecord, error: fileErr } = await req.supabase
                .from('data_files')
                .insert([{
                    file_name: fileName,
                    total_records: totalRecords > 0 ? totalRecords : 0,
                    status: 'Chưa phân bổ',
                    untouched_count: totalRecords > 0 ? totalRecords : 0,
                    called_count: 0,
                    appt_count: 0,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (fileErr) throw fileErr;
            const fileId = fileRecord.id; // Lấy ID file vừa tạo

            // Bước 2: Đọc dữ liệu Excel và chuẩn bị dữ liệu
            if (rows.length > 1) {
                const headers = rows[0];
                let customerMap = new Map();
                let contractRows = [];

                rows.slice(1).forEach(row => {
                    let cRow = { file_id: fileId, so_hop_dong: '', dien_thoai: '' };
                    let cusRow = { dien_thoai: '' };

                    headers.forEach((h, index) => {
                        if (h) {
                            const keyClean = h.toString().trim().toLowerCase();
                            let rawVal = row[index];
                            const val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

                            // DEBUG: Bật dòng này nếu muốn xem tên cột thực tế trên console của server
                            console.log(`Col header: [${keyClean}] -> Val: [${rawVal}]`);

                            if (keyClean.includes('hop_dong') || keyClean.includes('hợp đồng') || keyClean.includes('so_hd')) cRow.so_hop_dong = val;
                            if (keyClean.includes('dien_thoai') || keyClean.includes('điện thoại') || keyClean.includes('phone') || keyClean.includes('sdt') || keyClean.includes('so_dt')) {
                                cRow.dien_thoai = val;
                                cusRow.dien_thoai = val;
                            }
                            if (keyClean.includes('thu_tu') || keyClean.includes('thứ tự')) cRow.so_thu_tu = val ? parseInt(val) : null;
                            if (keyClean.includes('vp_bank')) cRow.vp_bank = val;
                            if (keyClean.includes('msdl')) cRow.msdl = val ? parseInt(val) : null;
                            if (keyClean.includes('cv')) cRow.cv = val;
                            
                            // MỞ RỘNG TỪ KHÓA BẮT NGÀY THAM GIA
                            if (keyClean.includes('ngay_tham_gia') || keyClean.includes('ngày tham gia') || keyClean.includes('ngaythamgia') || keyClean.includes('tham gia')) {
                                cRow.ngay_tham_gia = parseFlexibleDate(rawVal);
                            }

                            if (keyClean.includes('tinh_trang') || keyClean.includes('tình trạng')) cRow.tinh_trang_hs = val;
                            if (keyClean.includes('menh_gia') || keyClean.includes('mệnh giá') || keyClean.includes('menhgia')) cRow.menh_gia = val ? parseFloat(val) : null;
                            if (keyClean.includes('dao_han') || keyClean.includes('đáo hạn') || keyClean.includes('daohan')) cRow.nam_dao_han = val ? parseInt(val) : null;
                            if (keyClean.includes('ip')) cRow.ip = val ? parseInt(val) : null;

                            if (keyClean.includes('cccd')) cusRow.cccd = val;
                            if (keyClean === 'ho' || keyClean.includes('họ')) cusRow.ho = val;
                            if (keyClean === 'ten' || keyClean.includes('tên')) cusRow.ten = val;
                            if (keyClean.includes('gioi_tinh') || keyClean.includes('giới tính') || keyClean.includes('gioitinh')) cusRow.gioi_tinh = val;
                            
                            // MỞ RỘNG TỪ KHÓA BẮT NGÀY SINH
                            if (keyClean.includes('ngay_sinh') || keyClean.includes('ngày sinh') || keyClean.includes('ngaysinh')) {
                                cusRow.ngay_sinh = parseFlexibleDate(rawVal);
                            }

                            if (keyClean.includes('tuoi') || keyClean.includes('tuổi')) cusRow.tuoi = val ? parseInt(val) : null;
                            if (keyClean.includes('dia_chi') || keyClean.includes('địa chỉ') || keyClean.includes('diachi')) cusRow.dia_chi = val;
                        }
                    });

                    if (!cRow.so_hop_dong) cRow.so_hop_dong = 'HD_' + (cRow.dien_thoai || Math.random().toString(36).substring(7));

                    if (cusRow.dien_thoai) {
                        customerMap.set(cusRow.dien_thoai, {
                            ...cusRow,
                            ngay_tao: new Date().toISOString()
                        });
                    }

                    contractRows.push(cRow);
                });

                // Bước 3: Insert bảng customers
                if (customerMap.size > 0) {
                    const customersData = Array.from(customerMap.values());
                    const { error: cusErr } = await req.supabase
                        .from('customers')
                        .upsert(customersData, { onConflict: 'dien_thoai' });
                    
                    if (cusErr) throw cusErr;
                }

                // Bước 4: Insert/Update bảng contracts kèm file_id
                if (contractRows.length > 0) {
                    const { error: insertErr } = await req.supabase
                        .from('contracts')
                        .upsert(contractRows, { onConflict: 'so_hop_dong' });

                    if (insertErr) throw insertErr;
                }
            }
        }

        res.json({ success: true, message: 'Upload và xử lý dữ liệu thành công!' });
    } catch (error) {
        console.error("Upload error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/rename-file/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const { file_name } = req.body;
        const { error } = await req.supabase.from('data_files').update({ file_name }).eq('id', fileId);
        if (error) throw error;
        res.json({ success: true, message: 'Đổi tên file thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/file-leads/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;

        // 0. Lấy trạng thái hiện tại của file (để frontend biết đã khoá hay chưa,
        // dùng để chặn nút Xuất Excel/Google Sheet cho tới khi khoá)
        const { data: fileInfo, error: fileInfoErr } = await req.supabase
            .from('data_files')
            .select('status')
            .eq('id', fileId)
            .single();
        if (fileInfoErr) throw fileInfoErr;

        // 1. Lấy toàn bộ contracts thuộc file này
        const { data: contracts, error } = await req.supabase
            .from('contracts')
            .select('*')
            .eq('file_id', fileId);

        if (error) throw error;

        const phoneList = [...new Set((contracts || []).map(c => c.dien_thoai).filter(Boolean))];

        // 2. Join sang customers theo dien_thoai (lấy ho, ten, cccd, gioi_tinh, ngay_sinh, tuoi, dia_chi)
        // FIX: trước đây route này chỉ trả về contracts thô, không có thông tin khách hàng
        // nên bảng "Lọc dữ liệu chi tiết" không hiện được Họ Tên/CCCD/Địa chỉ đúng yêu cầu.
        const customersMap = new Map();
        if (phoneList.length > 0) {
            const { data: customersData, error: cusErr } = await req.supabase
                .from('customers')
                .select('dien_thoai, cccd, ho, ten, gioi_tinh, ngay_sinh, tuoi, dia_chi')
                .in('dien_thoai', phoneList);
            if (cusErr) throw cusErr;
            (customersData || []).forEach(cus => customersMap.set(String(cus.dien_thoai).trim(), cus));
        }

        // 3. Join sang call_history: lấy KẾT QUẢ CUỘC GỌI MỚI NHẤT theo từng số điện thoại
        // FIX: đây chính là dữ liệu còn thiếu khiến bộ đếm Chưa Gọi/Đã Gọi/Đã Hẹn và bộ lọc
        // trạng thái ở Khung 2 không hoạt động được trước đây.
        const callMap = new Map();
        if (phoneList.length > 0) {
            const { data: calls, error: callErr } = await req.supabase
                .from('call_history')
                .select('dien_thoai, ket_qua_cuoc_goi, thoi_gian_goi')
                .in('dien_thoai', phoneList)
                .order('thoi_gian_goi', { ascending: false });
            if (callErr) throw callErr;
            (calls || []).forEach(c => {
                const phone = String(c.dien_thoai || '').trim();
                if (phone && !callMap.has(phone)) {
                    callMap.set(phone, c.ket_qua_cuoc_goi);
                }
            });
        }

        // 4. Ghép đủ dữ liệu: contracts + customers + ket_qua_cuoc_goi mới nhất.
        // Trả về ĐẦY ĐỦ field (khớp Template_data.xlsx) để:
        // - Frontend Khung 2 chỉ hiển thị 6 cột đơn giản (STT tự đếm, Họ Tên, CCCD, SĐT, Địa chỉ, Kết quả)
        // - Nhưng khi Xuất Excel/Google Sheet vẫn xuất đủ toàn bộ cột theo đúng Template
        const leads = (contracts || []).map(c => {
            const phone = String(c.dien_thoai || '').trim();
            const cus = customersMap.get(phone) || {};
            return {
                ...c,
                ket_qua_cuoc_goi: callMap.get(phone) || null,
                cccd: cus.cccd || '',
                ho: cus.ho || '',
                ten: cus.ten || '',
                gioi_tinh: cus.gioi_tinh || '',
                ngay_sinh: cus.ngay_sinh || '',
                tuoi: cus.tuoi || '',
                dia_chi: cus.dia_chi || ''
            };
        });

        res.json({ success: true, leads, file_status: fileInfo ? fileInfo.status : null });
    } catch (error) {
        console.error("API file-leads error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ==========================================
// 3. PHÂN BỔ DATA CHO AGENT (ĐÃ GỘP CHUẨN)
// ==========================================

router.get('/allocation-options', async (req, res) => {
    try {
        const { data: files, error: fileError } = await req.supabase
            .from('data_files')
            .select('*')
            .order('created_at', { ascending: false });

        if (fileError) throw fileError;

        const { data: users, error: userError } = await req.supabase
            .from('users')
            .select('id, ten_dang_nhap, ho_va_ten, phan_quyen, truong_nhom');

        if (userError) throw userError;

        return res.json({ 
            success: true, 
            files: files || [], 
            users: users || [] 
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/agents', async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('users')
            .select('id, ho_va_ten, ten_dang_nhap')
            .ilike('phan_quyen', 'agent');

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/data-files/:id/lock', async (req, res) => {
    try {
        const fileId = req.params.id;
        const { status } = req.body;

        const { data, error } = await req.supabase
            .from('data_files')
            .update({ status: status })
            .eq('id', fileId)
            .select();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * DELETE /data-files/:fileId - Xóa sạch file và toàn bộ contracts thuộc file_id đó (Dùng req.supabase)
 */
router.delete('/data-files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ success: false, message: 'Thiếu mã định danh file cần xóa!' });
        }

        // 0. Lấy trước danh sách so_hop_dong thuộc file này (để dọn lead_assignments)
        const { data: contractsToDelete, error: fetchErr } = await req.supabase
            .from('contracts')
            .select('so_hop_dong')
            .eq('file_id', fileId);
        if (fetchErr) throw new Error(fetchErr.message);

        const soHopDongList = (contractsToDelete || []).map(c => c.so_hop_dong).filter(Boolean);

        // 1. Xóa lead_assignments tương ứng (MỚI THÊM)
        if (soHopDongList.length > 0) {
            const { error: delAssignErr } = await req.supabase
                .from('lead_assignments')
                .delete()
                .in('so_hop_dong', soHopDongList);
            if (delAssignErr) throw new Error(`Không thể xóa phân bổ lead: ${delAssignErr.message}`);
        }

        // 2. Xóa contracts
        const { error: deleteContractsError } = await req.supabase
            .from('contracts').delete().eq('file_id', fileId);
        if (deleteContractsError) throw new Error(`Không thể xóa dữ liệu hợp đồng: ${deleteContractsError.message}`);

        // 3. Xóa data_files
        const { error: deleteFileError } = await req.supabase
            .from('data_files').delete().eq('id', fileId);
        if (deleteFileError) throw new Error(`Không thể xóa thông tin file: ${deleteFileError.message}`);

        return res.status(200).json({ success: true, message: 'Đã xóa sạch file và toàn bộ dữ liệu liên quan!' });
    } catch (error) {
        console.error('Delete File Error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /data-files/:fileId/assign - Phân bổ lead từ file cho Agent chính xác
 */
router.post('/data-files/:fileId/assign', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { agent_id } = req.body;

        if (!agent_id) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn nhân sự nhận phân bổ!' });
        }

        // 1. Cập nhật trạng thái file
        const { error: updateFileError } = await req.supabase
            .from('data_files')
            .update({ 
                agent_id: agent_id, 
                status: 'Đã phân bổ',
                updated_at: new Date().toISOString() 
            })
            .eq('id', fileId);

        if (updateFileError) throw new Error(updateFileError.message);

        // 2. Lấy danh sách contracts theo đúng fileId này
        const { data: fileContracts, error: fetchError } = await req.supabase
            .from('contracts')
            .select('dien_thoai, so_hop_dong')
            .eq('file_id', fileId);

        if (fetchError) throw new Error(fetchError.message);

        if (!fileContracts || fileContracts.length === 0) {
            return res.status(400).json({ success: false, message: 'File này không chứa dữ liệu hợp đồng hoặc chưa được parse!' });
        }

        // 3. Batch insert sang bảng lead_assignments
        const assignments = fileContracts.map(item => ({
            dien_thoai: item.dien_thoai || null,
            so_hop_dong: item.so_hop_dong || null,
            agent_id: agent_id,
            trang_thai_lead: 'Chưa gọi',
            created_at: new Date().toISOString()
        }));

        const { error: insertError } = await req.supabase
            .from('lead_assignments')
            .insert(assignments);

        if (insertError) throw new Error(insertError.message);

        return res.status(200).json({ 
            success: true, 
            message: `Đã phân bổ thành công ${assignments.length} lead cho nhân sự!` 
        });

    } catch (error) {
        console.error('API Assignment Error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;