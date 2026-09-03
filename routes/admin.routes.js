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

                // Bước 4: Insert bảng contracts kèm file_id
                if (contractRows.length > 0) {
                    const { error: insertErr } = await req.supabase
                        .from('contracts')
                        .insert(contractRows);
                    
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
        const { data, error } = await req.supabase
            .from('contracts')
            .select('*')
            .eq('file_id', req.params.fileId); // Đã lọc chuẩn theo fileId

        if (error) throw error;

        res.json({ success: true, leads: data || [] });
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

        // 1. Xóa các dòng hợp đồng thuộc file_id trong bảng contracts
        const { error: deleteContractsError } = await req.supabase
            .from('contracts')
            .delete()
            .eq('file_id', fileId);

        if (deleteContractsError) {
            throw new Error(`Không thể xóa dữ liệu hợp đồng: ${deleteContractsError.message}`);
        }

        // 2. Xóa thông tin file trong bảng data_files
        const { error: deleteFileError } = await req.supabase
            .from('data_files')
            .delete()
            .eq('id', fileId);

        if (deleteFileError) {
            throw new Error(`Không thể xóa thông tin file: ${deleteFileError.message}`);
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Đã xóa sạch file và toàn bộ dữ liệu liên quan!' 
        });

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