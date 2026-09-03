// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // Lưu file tạm trên RAM trước khi đọc
const XLSX = require('xlsx');

// ==========================================
// 0. KIỂM TRA TRẠNG THÁI ROUTE
// ==========================================
/**
 * Route kiểm tra kết nối cơ bản
 * Endpoint: GET /admin/
 */
router.get('/', (req, res) => {
    res.json({ message: "Route đang hoạt động bình thường!" });
});


// ==========================================
// 1. QUẢN LÝ USER & GROUPS (NHÂN SỰ & NHÓM)
// ==========================================

/**
 * Lấy danh sách toàn bộ người dùng/nhân sự
 * Endpoint: GET /admin/users
 */
router.get('/users', async (req, res) => {
    try {
        const { data: users, error: userError } = await req.supabase
            .from('users')
            .select('*')
            .order('id', { ascending: false });

        if (userError) throw userError;

        // Chuẩn hóa dữ liệu hiển thị (nếu chưa có nhóm hay trưởng nhóm)
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

/**
 * Lấy danh sách các nhóm làm việc (Gom nhóm từ bảng users)
 * Endpoint: GET /admin/groups
 */
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

/**
 * Thêm mới một tài khoản nhân sự vào hệ thống
 * Endpoint: POST /admin/users
 */
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

/**
 * Xóa tài khoản nhân sự theo ID
 * Endpoint: DELETE /admin/users/:id
 */
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

/**
 * Khóa hoặc Mở khóa tài khoản nhân sự
 * Endpoint: PATCH /admin/users/:id/toggle-lock
 */
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

/**
 * Lấy danh sách các file dữ liệu đã tải lên
 * Endpoint: GET /admin/data-files
 */
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
 * Tải lên file Excel, đọc dữ liệu và lưu vào data_files & contracts
 * Endpoint: POST /admin/upload-data
 */
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
        const totalRecords = rows.length > 1 ? rows.length - 1 : 0;

        // 1. Lưu thông tin tổng quan của file vào bảng data_files
        const { error: fileErr } = await req.supabase
            .from('data_files')
            .insert([{
                file_name: fileName,
                total_records: totalRecords > 0 ? totalRecords : 0,
                status: 'Chưa phân bổ',
                untouched_count: totalRecords > 0 ? totalRecords : 0,
                called_count: 0,
                appt_count: 0,
                created_at: new Date().toISOString()
            }]);

        if (fileErr) throw fileErr;

        // 2. Đọc từng dòng dữ liệu Excel và lưu vào bảng contracts
        if (rows.length > 1) {
            const headers = rows[0];
            const contractRows = rows.slice(1).map(row => {
                let rowObj = {};
                headers.forEach((h, index) => {
                    if (h) {
                        const keyClean = h.toString().trim();
                        if (keyClean === 'so_hop_dong' || keyClean === 'Số hợp đồng') rowObj.so_hop_dong = row[index] || '';
                        if (keyClean === 'dien_thoai' || keyClean === 'Điện thoại') rowObj.dien_thoai = row[index] || '';
                    }
                });
                return rowObj;
            }).filter(r => r.so_hop_dong || r.dien_thoai);

            if (contractRows.length > 0) {
                await req.supabase.from('contracts').insert(contractRows);
            }
        }

        res.json({ success: true, message: 'Upload và xử lý file thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Đổi tên file dữ liệu theo ID
 * Endpoint: PUT /admin/rename-file/:id
 */
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

/**
 * Lấy danh sách leads/contracts chi tiết hiển thị cho Khung 2
 * Endpoint: GET /admin/file-leads/:fileId
 */
router.get('/file-leads/:fileId', async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('contracts')
            .select('*');

        if (error) throw error;

        res.json({ success: true, leads: data || [] });
    } catch (error) {
        console.error("API file-leads error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ==========================================
// 3. PHÂN BỔ DATA CHO AGENT
// ==========================================

/**
 * Lấy dữ liệu cấu hình tuỳ chọn phân bổ (danh sách file và danh sách user)
 * Endpoint: GET /admin/allocation-options
 */
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

/**
 * Lấy danh sách nhân viên có phân quyền là agent
 * Endpoint: GET /admin/agents
 */
router.get('/agents', async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('users')
            .select('id, ho_va_ten, ten_dang_nhap')
            .eq('phan_quyen', 'agent');

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Khóa hoặc mở khóa trạng thái xử lý của file
 * Endpoint: PUT /admin/data-files/:id/lock
 */
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
 * Xóa một file dữ liệu cùng các thông tin liên quan theo ID
 * Endpoint: DELETE /admin/data-files/:id
 */
router.delete('/data-files/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const db = req.supabase;

        const { error: deleteError } = await db
            .from('data_files')
            .delete()
            .eq('id', fileId);

        if (deleteError) throw deleteError;

        return res.json({ 
            success: true, 
            message: 'Đã xóa file thành công!' 
        });

    } catch (error) {
        console.error('Lỗi khi xóa file:', error);
        return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

/**
 * Phân bổ data file cho Agent cụ thể:
 * - Cập nhật trạng thái file thành 'Đã phân bổ'
 * - Đồng bộ danh sách hợp đồng sang bảng `lead_assignments` để Agent có thể gọi điện trên workspace.
 * Endpoint: POST /admin/data-files/:id/assign
 */
router.post('/data-files/:id/assign', async (req, res) => {
    try {
        const fileId = req.params.id;
        const { agent_id } = req.body;

        // Bước 1: Lấy tên file gốc từ bảng data_files dựa vào fileId
        const { data: fileData, error: fileErr } = await req.supabase
            .from('data_files')
            .select('file_name')
            .eq('id', fileId)
            .single();

        if (fileErr || !fileData) throw new Error('Không tìm thấy thông tin file!');
        const fileName = fileData.file_name;

        // Bước 2: Truy vấn thông tin Agent từ bảng users để lấy họ tên đầy đủ
        const { data: agentData, error: agentErr } = await req.supabase
            .from('users')
            .select('ho_va_ten')
            .eq('id', agent_id)
            .single();

        if (agentErr || !agentData) throw new Error('Không tìm thấy thông tin Agent!');
        const agentName = agentData.ho_va_ten;

        // Bước 3: Cập nhật trạng thái file trong bảng data_files thành 'Đã phân bổ'
        const { error: updateFileErr } = await req.supabase
            .from('data_files')
            .update({ 
                agent_id: agent_id, 
                status: 'Đã phân bổ' 
            })
            .eq('id', fileId);

        if (updateFileErr) throw updateFileErr;

        // Bước 4: Lấy danh sách toàn bộ hợp đồng hiện có để chuẩn bị phân phối
        const { data: contracts, error: contractErr } = await req.supabase
            .from('contracts')
            .select('so_hop_dong, dien_thoai');

        if (contractErr) throw contractErr;

        // Bước 5: Map dữ liệu và insert vào bảng lead_assignments dành riêng cho Agent gọi điện
        if (contracts && contracts.length > 0) {
            const assignments = contracts.map(item => ({
                so_hop_dong: item.so_hop_dong,
                dien_thoai: item.dien_thoai,
                nguoi_phu_trach: agentName, // Lưu tên đầy đủ của agent phụ trách
                trang_thai_lead: 'Chưa gọi'   // Trạng thái mặc định ban đầu
            }));

            const { error: insertErr } = await req.supabase
                .from('lead_assignments')
                .insert(assignments);

            if (insertErr) throw insertErr;
        }

        res.json({ success: true, message: 'Phân bổ lead và đồng bộ vào workspace thành công!' });
    } catch (err) {
        console.error("Lỗi phân bổ:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;