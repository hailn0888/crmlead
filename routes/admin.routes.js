// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const XLSX = require('xlsx');

router.get('/', (req, res) => {
    res.json({ message: "Route đang hoạt động bình thường!" });
});

// 1. QUẢN LÝ USER & GROUPS
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
                    leader_name: u.truong_nhom || (u.phan_quyen === 'leader' ? u.ho_va_ten : 'Chưa có')
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


// 2. QUẢN LÝ DATA FILE & BATCH
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

router.post('/upload-data', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn file tải lên.' });
        }

        const fileName = req.file.originalname;
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const totalRecords = rows.length > 0 ? rows.length : 0;

        const { data: insertedFile, error: fileErr } = await req.supabase
            .from('data_files')
            .insert([{
                file_name: fileName,
                total_records: totalRecords,
                status: 'Chưa phân bổ',
                untouched_count: totalRecords,
                called_count: 0,
                appt_count: 0,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (fileErr) throw fileErr;

        if (rows.length > 1) {
            const headers = rows[0];
            const contractRows = rows.slice(1).map(row => {
                let rowObj = {
                    file_id: insertedFile.id // <--- THÊM DÒNG NÀY VÀO ĐỂ GẮN ID CỦA FILE GỐC
                };
                headers.forEach((h, index) => {
                    if (h) {
                        const keyClean = h.toString().trim();
                        rowObj[keyClean] = row[index] || '';
                    }
                });
                return rowObj;
            });

            const { error: contractErr } = await req.supabase.from('contracts').insert(contractRows);
            if (contractErr) {
                console.warn("Lưu vào bảng contracts:", contractErr.message);
            }
        }

        res.json({ success: true, message: 'Upload và xử lý file thành công!' });
    } catch (error) {
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

router.put('/toggle-lock-file/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const { status } = req.body;
        const { error } = await req.supabase.from('data_files').update({ status }).eq('id', fileId);
        if (error) throw error;
        res.json({ success: true, message: 'Đổi trạng thái file thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/file-leads/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        // Truy vấn lấy dữ liệu từ bảng contracts theo file_id
        const { data, error } = await req.supabase
            .from('contracts')
            .select('*')
            .eq('file_id', fileId);

        if (error) {
            // Nếu lỗi do database chưa có cột file_id, ta fallback trả về toàn bộ contracts tạm thời để không bị sập 500
            console.warn("Lỗi query theo file_id, đang lấy toàn bộ dữ liệu:", error.message);
            const { data: allData, error: allErr } = await req.supabase.from('contracts').select('*');
            if (allErr) throw allErr;
            return res.json({ success: true, leads: allData || [] });
        }

        res.json({ success: true, leads: data || [] });
    } catch (error) {
        console.error("API file-leads error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});


// 3. PHÂN BỔ DATA
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

router.post('/assign-file', async (req, res) => {
    try {
        const { file_id, agent_id } = req.body;
        
        const { error } = await req.supabase
            .from('data_files')
            .update({ 
                status: 'Đang gọi' 
            })
            .eq('id', file_id);

        if (error) throw error;
        res.json({ success: true, message: 'Phân bổ file thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================================================================================
// ===             HÀM XỬ LÝ XOÁ FILE & DỮ LIỆU LIÊN QUAN CHUẨN XÁC                ===
// ==================================================================================
router.delete('/data-files/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const db = req.supabase; // Sử dụng đúng biến db từ req.supabase

        // 1. Kiểm tra xem file có tồn tại không
        const { data: fileData, error: fetchError } = await db
            .from('data_files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (fetchError || !fileData) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy file trong cơ sở dữ liệu!' });
        }

        // 2. Xóa các sự kiện, nhật ký cuộc gọi hoặc lịch sử tương tác liên quan đến file này ở bảng phụ
        await db.from('call_history').delete().eq('file_id', fileId);
        await db.from('lead_assignments').delete().eq('file_id', fileId);

        // 3. Tiến hành xóa chính bản ghi file trong bảng data_files
        const { error: deleteError } = await db
            .from('data_files')
            .delete()
            .eq('id', fileId);

        if (deleteError) {
            throw deleteError;
        }

        return res.json({ 
            success: true, 
            message: 'Đã xóa file và toàn bộ sự kiện, nhật ký cuộc gọi liên quan thành công!' 
        });

    } catch (error) {
        console.error('Lỗi khi xóa file:', error);
        return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

module.exports = router;