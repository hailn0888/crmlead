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
        // FIX: bổ sung lấy thêm cột "status" để loại bỏ file đã bị Admin khoá
        // ("Đã khóa") ra khỏi dropdown "Nguồn" - agent không nên tiếp tục thấy/chọn
        // file đã khoá để gọi tiếp, dù lịch sử cuộc gọi cũ vẫn được giữ nguyên.
        let fileMap = {};
        if (fileIds.length > 0) {
            const { data: filesData, error: fileErr } = await supabase
                .from('data_files')
                .select('id, file_name, status')
                .in('id', fileIds);

            if (fileErr) throw fileErr;
            if (filesData) {
                filesData.forEach(f => {
                    if (f.status !== 'Đã khóa') {
                        fileMap[f.id] = f.file_name;
                    }
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

// API: Lấy danh sách đồng nghiệp (Agent) để chọn gửi hẹn (dùng cho popup Gửi Cuộc Hẹn)
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

        // 2.5. FIX: Loại bỏ các lead thuộc file_id đã bị Admin khoá ("Đã khóa").
        // Yêu cầu: khi khoá file, agent không được thấy tiếp lead của file đó trong
        // Leads nữa, NHƯNG lịch sử/nhật ký cuộc gọi (bảng call_history) không bị
        // đụng tới - việc này tự động đảm bảo vì call_history không có cột file_id,
        // chỉ có bảng contracts/lead_assignments mới bị lọc ở đây.
        const fileIdsInvolved = [...new Set(
            Array.from(contractsMap.values()).map(c => c.file_id).filter(Boolean)
        )];
        let lockedFileIds = new Set();
        if (fileIdsInvolved.length > 0) {
            const { data: filesData } = await supabase
                .from('data_files')
                .select('id, status')
                .in('id', fileIdsInvolved);
            (filesData || []).forEach(f => {
                if (f.status === 'Đã khóa') lockedFileIds.add(f.id);
            });
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

        // 4. Ghép nối dữ liệu trả về cho frontend (bỏ qua các lead thuộc file đã khoá)
        const formattedData = assignments
            .map(item => {
                const contractKey = item.so_hop_dong ? String(item.so_hop_dong).trim() : '';
                const phoneKey = item.dien_thoai ? String(item.dien_thoai).trim() : '';

                const contract = contractsMap.get(contractKey) || {};
                const customer = customersMap.get(phoneKey || String(contract.dien_thoai || '').trim()) || {};

                return {
                    ...item,
                    contracts: contract,
                    customers: customer
                };
            })
            .filter(item => !item.contracts.file_id || !lockedFileIds.has(item.contracts.file_id));

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

// =====================================================================
// 4. API DOANH SỐ CÁ NHÂN (FYC / Hợp đồng) - dùng cho fyc.html & sales.html
// Trước đây 2 trang này gọi thẳng Supabase từ trình duyệt và lưu tạm vào
// localStorage -> mất dữ liệu khi đổi máy/xoá cache/đăng nhập lại.
// Từ nay mọi thao tác đọc/ghi đều đi qua route này (giống hệt pattern
// /files, /leads ở trên) để Database là nơi lưu trữ DUY NHẤT.
// =====================================================================

// Hàm phụ: sinh lịch các kỳ đóng phí (Năm/Nửa năm/Quý) kèm số FYC mỗi kỳ.
// Kỳ 1 mặc định coi như đã đóng ngay tại ngày phát hành hợp đồng.
function buildInstallmentSchedule(dinhKy, ngayPhatHanh, hoaHongFyc) {
    const divisor = dinhKy === 'Nửa năm' ? 2 : (dinhKy === 'Quý' ? 4 : 1);
    const fycPerPeriod = (Number(hoaHongFyc) || 0) / divisor;
    const schedule = [];
    for (let i = 1; i <= divisor; i++) {
        schedule.push({
            ky_thu_may: i,
            ngay_den_han: ngayPhatHanh || null,
            ngay_da_dong: i === 1 ? ngayPhatHanh : null,
            trang_thai: i === 1 ? 'paid' : 'unpaid',
            so_tien_fyc: fycPerPeriod
        });
    }
    return schedule;
}

// GET: Lấy toàn bộ danh sách doanh số (hợp đồng + lịch đóng phí) của 1 agent
router.get('/sales', async (req, res) => {
    try {
        const agentName = req.query.agent;
        if (!agentName) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });
        }

        const agentId = await getAgentId(agentName);
        if (!agentId) {
            return res.json({ success: true, data: [] });
        }

        // Chỉ lấy đúng hợp đồng của agent này (lọc theo agent_id, không lọc
        // theo tên chuỗi ten_dang_nhap để tránh trùng tên và chắc chắn agent
        // khác không xem được doanh số của nhau)
        const { data: contracts, error: contractError } = await supabase
            .from('danh_sach_hop_dong')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });

        if (contractError) throw contractError;
        if (!contracts || contracts.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const soHopDongs = contracts.map(c => c.so_hop_dong);
        const { data: installments, error: instError } = await supabase
            .from('ky_dong_phi')
            .select('*')
            .in('so_hop_dong', soHopDongs)
            .order('ky_thu_may', { ascending: true });

        if (instError) throw instError;

        const instMap = {};
        (installments || []).forEach(inst => {
            if (!instMap[inst.so_hop_dong]) instMap[inst.so_hop_dong] = [];
            instMap[inst.so_hop_dong].push({
                periodIndex: inst.ky_thu_may,
                dueDate: inst.ngay_den_han,
                paidDate: inst.ngay_da_dong,
                status: inst.trang_thai,
                fycAmount: Number(inst.so_tien_fyc) || 0
            });
        });

        // Trả dữ liệu đúng format mà giao diện sales.html đang dùng để hạn chế
        // sửa đổi phần hiển thị/tính toán ở frontend
        const formatted = contracts.map(c => {
            let riders = [];
            if (c.ghi_chu) {
                try {
                    const parsed = typeof c.ghi_chu === 'string' ? JSON.parse(c.ghi_chu) : c.ghi_chu;
                    riders = parsed.riders || [];
                } catch (e) { /* ghi_chu không phải JSON hợp lệ thì bỏ qua */ }
            }
            return {
                contractNumber: c.so_hop_dong,
                issueDate: c.ngay_phat_hanh,
                policyHolder: c.ben_mua_bao_hiem,
                lifeInsured: c.nguoi_duoc_bao_hiem || c.ben_mua_bao_hiem,
                mainProduct: c.ten_san_pham_chinh || c.ma_san_pham_chinh,
                totalAnnualPremium: Number(c.tong_phi_thuc_thu) || 0,
                paymentMode: c.dinh_ky_dong_phi === 'Nửa năm' ? 'HALF' : (c.dinh_ky_dong_phi === 'Quý' ? 'QUARTER' : 'YEAR'),
                splitRate: Number(c.ty_le_hoa_hong) || 100,
                fyc: { fullY1: Number(c.hoa_hong_fyc) || 0, y1: Number(c.hoa_hong_fyc) || 0 },
                riders,
                installments: instMap[c.so_hop_dong] || []
            };
        });

        res.json({ success: true, data: formatted });
    } catch (error) {
        console.error("Lỗi lấy danh sách doanh số:", error);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
    }
});

// POST: Lưu (thêm mới hoặc cập nhật) 1 hợp đồng doanh số từ công cụ tính FYC
router.post('/sales', async (req, res) => {
    try {
        const { agent, ...payload } = req.body;
        if (!agent || !payload.so_hop_dong) {
            return res.status(400).json({ success: false, message: 'Thiếu Agent hoặc Số hợp đồng!' });
        }

        const agentId = await getAgentId(agent);
        if (!agentId) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy Agent, vui lòng đăng nhập lại!' });
        }

        const record = { ...payload, agent_id: agentId, updated_at: new Date() };

        // Upsert theo so_hop_dong -> bắt buộc cột so_hop_dong phải có ràng buộc
        // UNIQUE trong database (xem file migration.sql), nếu không "onConflict"
        // sẽ báo lỗi 42P10 "no unique or exclusion constraint"
        const { error: upsertError } = await supabase
            .from('danh_sach_hop_dong')
            .upsert(record, { onConflict: 'so_hop_dong' });

        if (upsertError) throw upsertError;

        // Sinh lại lịch đóng phí cho hợp đồng này: xoá lịch cũ (nếu là sửa hợp
        // đồng đã có) rồi tạo lại theo định kỳ đóng phí mới nhất
        await supabase.from('ky_dong_phi').delete().eq('so_hop_dong', payload.so_hop_dong);

        const schedule = buildInstallmentSchedule(payload.dinh_ky_dong_phi, payload.ngay_phat_hanh, payload.hoa_hong_fyc)
            .map(item => ({ ...item, so_hop_dong: payload.so_hop_dong }));

        const { error: instError } = await supabase.from('ky_dong_phi').insert(schedule);
        if (instError) throw instError;

        res.json({ success: true, message: 'Đã lưu doanh số vào Database thành công!' });
    } catch (error) {
        console.error("Lỗi lưu doanh số:", error);
        res.status(500).json({ success: false, message: error.message || 'Không thể lưu doanh số' });
    }
});

// PUT: Xác nhận đã đóng phí cho 1 kỳ cụ thể của 1 hợp đồng
router.put('/sales/installment', async (req, res) => {
    try {
        const { so_hop_dong, ky_thu_may, ngay_da_dong } = req.body;
        if (!so_hop_dong || !ky_thu_may || !ngay_da_dong) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu xác nhận đóng phí!' });
        }

        const { error } = await supabase
            .from('ky_dong_phi')
            .update({ trang_thai: 'paid', ngay_da_dong })
            .eq('so_hop_dong', so_hop_dong)
            .eq('ky_thu_may', ky_thu_may);

        if (error) throw error;
        res.json({ success: true, message: 'Đã xác nhận đóng phí!' });
    } catch (error) {
        console.error("Lỗi xác nhận đóng phí:", error);
        res.status(500).json({ success: false, message: 'Không thể xác nhận đóng phí' });
    }
});

// PATCH: Sửa thông tin cơ bản của 1 hợp đồng (Số HĐ / BMBH / NĐBH)
router.patch('/sales/:so_hop_dong', async (req, res) => {
    try {
        const { so_hop_dong } = req.params;
        // Chỉ cho phép sửa các trường này qua nút "Chỉnh sửa thông tin" ở giao diện
        const allowedFields = ['so_hop_dong', 'ben_mua_bao_hiem', 'nguoi_duoc_bao_hiem'];
        const updates = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'Không có dữ liệu để cập nhật!' });
        }
        updates.updated_at = new Date();

        const { error } = await supabase
            .from('danh_sach_hop_dong')
            .update(updates)
            .eq('so_hop_dong', so_hop_dong);

        // Nếu đổi số hợp đồng: bảng ky_dong_phi có FK ON UPDATE CASCADE (xem
        // migration_doanh_so.sql) nên các kỳ đóng phí sẽ tự động cập nhật theo
        if (error) throw error;
        res.json({ success: true, message: 'Đã cập nhật hợp đồng!' });
    } catch (error) {
        console.error("Lỗi cập nhật hợp đồng:", error);
        res.status(500).json({ success: false, message: error.message || 'Không thể cập nhật hợp đồng' });
    }
});

// DELETE: Xoá 1 hợp đồng doanh số (lịch đóng phí bị xoá kèm theo nhờ ON DELETE CASCADE)
router.delete('/sales/:so_hop_dong', async (req, res) => {
    try {
        const { so_hop_dong } = req.params;
        const { error } = await supabase.from('danh_sach_hop_dong').delete().eq('so_hop_dong', so_hop_dong);
        if (error) throw error;
        res.json({ success: true, message: 'Đã xoá hợp đồng!' });
    } catch (error) {
        console.error("Lỗi xoá hợp đồng:", error);
        res.status(500).json({ success: false, message: 'Không thể xoá hợp đồng' });
    }
});

// DELETE: Xoá toàn bộ doanh số của 1 agent (nút "Xóa tất cả dữ liệu")
router.delete('/sales', async (req, res) => {
    try {
        const agentName = req.query.agent;
        if (!agentName) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin Agent!' });
        }
        const agentId = await getAgentId(agentName);
        if (!agentId) {
            return res.json({ success: true, message: 'Không có dữ liệu để xoá.' });
        }
        const { error } = await supabase.from('danh_sach_hop_dong').delete().eq('agent_id', agentId);
        if (error) throw error;
        res.json({ success: true, message: 'Đã xoá toàn bộ doanh số!' });
    } catch (error) {
        console.error("Lỗi xoá toàn bộ doanh số:", error);
        res.status(500).json({ success: false, message: 'Không thể xoá dữ liệu' });
    }
});

module.exports = router;