const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Hàm phụ: Lấy ID của agent từ tên hoặc tên đăng nhập
async function getAgentId(agentName) {
    if (!agentName) return null;
    const { data, error } = await supabase
        .from('users')
        .select('id')
        .or(`ho_va_ten.eq.${agentName},ten_dang_nhap.eq.${agentName}`)
        .single();
    if (error || !data) return null;
    return data.id;
}

// 1. API: Lấy danh sách file được phân bổ cho Agent (Truy vấn độc lập chống lỗi quan hệ)
router.get('/files', async (req, res) => {
    try {
        const agentName = req.query.agent;
        if (!agentName) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin tên Agent!' });
        }

        const agentId = await getAgentId(agentName);
        if (!agentId) {
            return res.json({ success: true, data: [] });
        }

        // Lấy danh sách số hợp đồng mà agent này được phân bổ
        const { data: assignments, error: assignError } = await supabase
            .from('lead_assignments')
            .select('so_hop_dong')
            .eq('agent_id', agentId);

        if (assignError) throw assignError;
        if (!assignments || assignments.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const contractNos = assignments.map(a => a.so_hop_dong).filter(Boolean);

        // Bước 1: Lấy thông tin contracts trước
        const { data: contracts, error: contractError } = await supabase
            .from('contracts')
            .select('file_id, so_hop_dong')
            .in('so_hop_dong', contractNos);

        if (contractError) throw contractError;
        if (!contracts || contracts.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const fileIds = [...new Set(contracts.map(c => c.file_id).filter(Boolean))];

        // Bước 2: Lấy thông tin data_files dựa vào danh sách file_id độc lập
        let fileMap = {};
        if (fileIds.length > 0) {
            const { data: filesData, error: fileErr } = await supabase
                .from('data_files')
                .select('id, file_name')
                .in('id', fileIds);

            if (fileErr) throw fileErr;
            if (filesData) {
                filesData.forEach(f => {
                    fileMap[f.id] = f.file_name;
                });
            }
        }

        // Bước 3: Gom nhóm và đếm số lượng bản ghi theo file
        const fileCountMap = {};
        contracts.forEach(item => {
            const fileId = item.file_id;
            const fileName = fileMap[fileId];
            if (fileId && fileName) {
                if (!fileCountMap[fileId]) {
                    fileCountMap[fileId] = {
                        file_id: fileId,
                        file_name: fileName,
                        total_records: 0
                    };
                }
                fileCountMap[fileId].total_records++;
            }
        });

        res.json({ success: true, data: Object.values(fileCountMap) });
    } catch (error) {
        console.error("Lỗi lấy danh sách file:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
    }
});

// 2. API: Lấy danh sách lead chi tiết của agent
router.get('/leads', async (req, res) => {
    try {
        const agentName = req.query.agent;
        if (!agentName) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });
        }

        const agentId = await getAgentId(agentName);
        if (!agentId) {
            return res.json({ success: true, data: [] });
        }

        // 1. Lấy danh sách lead_assignments của agent
        const { data: assignments, error: assignError } = await supabase
            .from('lead_assignments')
            .select('*')
            .eq('agent_id', agentId);

        if (assignError) throw assignError;
        if (!assignments || assignments.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const soHopDongs = assignments.map(item => item.so_hop_dong).filter(Boolean);
        const dienThoais = assignments.map(item => item.dien_thoai).filter(Boolean);

        // 2. Lấy dữ liệu từ bảng contracts
        let contractsMap = new Map();
        if (soHopDongs.length > 0) {
            const { data: contractsData } = await supabase
                .from('contracts')
                .select('*')
                .in('so_hop_dong', soHopDongs);
            
            if (contractsData) {
                contractsData.forEach(c => contractsMap.set(String(c.so_hop_dong).trim(), c));
            }
        }

        // 3. Lấy dữ liệu từ bảng customers
        let customersMap = new Map();
        if (dienThoais.length > 0) {
            const { data: customersData } = await supabase
                .from('customers')
                .select('*')
                .in('dien_thoai', dienThoais);
            
            if (customersData) {
                customersData.forEach(cus => customersMap.set(String(cus.dien_thoai).trim(), cus));
            }
        }

        // 4. Ghép nối dữ liệu trả về cho frontend
        const formattedData = assignments.map(item => {
            const contractKey = item.so_hop_dong ? String(item.so_hop_dong).trim() : '';
            const phoneKey = item.dien_thoai ? String(item.dien_thoai).trim() : '';

            const contract = contractsMap.get(contractKey) || {};
            const customer = customersMap.get(phoneKey || String(contract.dien_thoai || '').trim()) || {};
            
            return {
                ...item,
                contracts: contract,
                customers: customer
            };
        });

        res.json({ success: true, data: formattedData });
    } catch (error) {
        console.error("Lỗi lấy danh sách lead:", error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// 3. API: Lưu kết quả cuộc gọi
router.post('/calls', async (req, res) => {
    try {
        const { dien_thoai, so_hop_dong, ten_agent, ket_qua_cuoc_goi, ghi_chu, thoi_gian_goi } = req.body;

        if (!dien_thoai || !ket_qua_cuoc_goi) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bắt buộc!' });
        }

        // 1. Lưu vào bảng call_history (BỎ HOÀN TOÀN so_hop_dong ra vì bảng này không có cột đó)
        const { error: historyError } = await supabase
            .from('call_history')
            .insert([{ 
                dien_thoai, 
                ten_agent, 
                ket_qua_cuoc_goi, 
                ghi_chu, 
                thoi_gian_goi: thoi_gian_goi || new Date() 
            }]);

        if (historyError) throw historyError;

        // 2. Cập nhật trạng thái mới nhất vào lead_assignments (Dùng so_hop_dong hoặc dien_thoai để định danh)
        const updatePayload = {
            trang_thai_lead: 'Đã gọi',
            ket_qua_moi_nhat: ket_qua_cuoc_goi,
            ghi_chu_moi_nhat: ghi_chu
        };

        let query = supabase
            .from('lead_assignments')
            .update(updatePayload);

        if (so_hop_dong) {
            query = query.eq('so_hop_dong', so_hop_dong);
        } else {
            query = query.eq('dien_thoai', dien_thoai);
        }

        const { error: updateError } = await query;
        if (updateError) throw updateError;

        res.json({ success: true, message: 'Đã lưu kết quả cuộc gọi thành công!' });
    } catch (error) {
        console.error("Lỗi lưu kết quả gọi:", error);
        res.status(500).json({ success: false, message: 'Không thể lưu kết quả gọi' });
    }
});

// API: Lấy lịch sử cuộc gọi kèm thông tin khách hàng (Đã fix lọc theo ngày)
router.get('/calls', async (req, res) => {
    try {
        const { agent, date } = req.query;
        
        let query = supabase
            .from('call_history')
            .select(`
                id,
                dien_thoai,
                ten_agent,
                ket_qua_cuoc_goi,
                ghi_chu,
                thoi_gian_goi,
                customers:dien_thoai (ho, ten, dia_chi)
            `)
            .order('thoi_gian_goi', { ascending: false });

        if (agent) {
            query = query.eq('ten_agent', agent);
        }

        // Bổ sung logic lọc theo khoảng thời gian của ngày được chọn
        if (date) {
            const startDate = `${date}T00:00:00`;
            const endDate = `${date}T23:59:59`;
            query = query.gte('thoi_gian_goi', startDate).lte('thoi_gian_goi', endDate);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error("Lỗi lấy lịch sử cuộc gọi:", error);
        res.status(500).json({ success: false, message: 'Không thể lấy lịch sử cuộc gọi' });
    }
});

// API: Lấy danh sách đồng nghiệp (Agent) để chọn gửi hẹn
router.get('/colleagues', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, ho_va_ten, ten_dang_nhap')
            .ilike('phan_quyen', 'agent');

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
module.exports = router;