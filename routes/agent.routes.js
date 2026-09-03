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
                contractsData.forEach(c => contractsMap.set(c.so_hop_dong, c));
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
                customersData.forEach(cus => customersMap.set(cus.dien_thoai, cus));
            }
        }

        // 4. Ghép nối dữ liệu trả về cho frontend
        const formattedData = assignments.map(item => {
            const contract = contractsMap.get(item.so_hop_dong) || {};
            const customer = customersMap.get(item.dien_thoai || contract.dien_thoai) || {};
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

        const { error: historyError } = await supabase
            .from('call_history')
            .insert([{ dien_thoai, ten_agent, ket_qua_cuoc_goi, ghi_chu, thoi_gian_goi }]);

        if (historyError) throw historyError;

        const { error: updateError } = await supabase
            .from('lead_assignments')
            .update({
                trang_thai: 'Đã gọi',
                ket_qua_moi_nhat: ket_qua_cuoc_goi,
                ghi_chu_moi_nhat: ghi_chu,
                ngay_cap_hat: new Date()
            })
            .eq('dien_thoai', dien_thoai);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Đã lưu kết quả cuộc gọi thành công!' });
    } catch (error) {
        console.error("Lỗi lưu kết quả gọi:", error);
        res.status(500).json({ success: false, message: 'Không thể lưu kết quả gọi' });
    }
});

module.exports = router;