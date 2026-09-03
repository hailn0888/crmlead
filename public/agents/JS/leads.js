// ==========================================
// TÊN FILE: public/agents/js/leads.js
// CHỨC NĂNG: Xử lý logic nghiệp vụ trang Quản lý Data Lead của Agent bám sát cấu trúc cơ sở dữ liệu thực tế 
// (Bảng: lead_assignments, contracts, customers, call_history)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const sourceFileSelect = document.getElementById('source-file-select');
    const lblSoHopDong = document.getElementById('lbl-so-hop-dong');
    const lblHoTen = document.getElementById('lbl-ho-ten');
    const lblGioiTinh = document.getElementById('lbl-gioi-tinh');
    const lblDienThoaiLink = document.getElementById('lbl-dien-thoai-link');
    const lblDienThoaiText = document.getElementById('lbl-dien-thoai-text');
    const lblDienThoaiNone = document.getElementById('lbl-dien-thoai-none');
    const lblCccd = document.getElementById('lbl-cccd');
    const lblNgaySinh = document.getElementById('lbl-ngay-sinh');
    const lblNgayThamGia = document.getElementById('lbl-ngay-tham-gia');
    const lblMenhGia = document.getElementById('lbl-menh-gia');
    const lblDiaChi = document.getElementById('lbl-dia-chi');

    const selectKetQua = document.getElementById('select-ket-qua');
    const txtGhiChu = document.querySelector('textarea');
    const btnLuuTiepTuc = document.querySelector('button.bg-emerald-600');

    let leadList = [];
    let currentIndex = 0;
    let currentLead = null;

    // Lấy tên agent hiện tại từ localStorage (mặc định 'Lê Ngô Hải' nếu test nhanh)
    const currentAgentName = localStorage.getItem('user_name') || localStorage.getItem('ho_va_ten') || 'Lê Ngô Hải';

    async function init() {
        await loadAssignedFiles();
        await loadAssignedLeads();
    }

    async function loadAssignedFiles() {
        try {
            const res = await fetch(`/api/agent/files?agent=${encodeURIComponent(currentAgentName)}`);
            const result = await res.json();
            if (result.success && sourceFileSelect) {
                sourceFileSelect.innerHTML = '<option value="">-- Tất cả file --</option>';
                result.data.forEach(item => {
                    sourceFileSelect.innerHTML += `<option value="${item.file_name}">${item.file_name} (${item.total_records || 0} leads)</option>`;
                });
            }
        } catch (error) {
            console.error("Lỗi tải file phân bổ:", error);
        }
    }

    async function loadAssignedLeads() {
        try {
            const res = await fetch(`/api/agent/leads?agent=${encodeURIComponent(currentAgentName)}`);
            const result = await res.json();
            if (result.success && result.data.length > 0) {
                leadList = result.data;
                currentIndex = 0;
                displayLead(leadList[currentIndex]);
            }
        } catch (error) {
            console.error("Lỗi tải danh sách lead:", error);
        }
    }

    function displayLead(item) {
        if (!item) return;
        currentLead = item;
        
        const contract = item.contracts || {};
        const customer = item.customers || {};

        if (lblSoHopDong) lblSoHopDong.textContent = item.so_hop_dong || '-';
        if (lblHoTen) lblHoTen.textContent = customer.ho && customer.ten ? `${customer.ho} ${customer.ten}` : (customer.ten || '-');
        if (lblGioiTinh) lblGioiTinh.textContent = customer.gioi_tinh || '-';

        const phone = item.dien_thoai || contract.dien_thoai || customer.dien_thoai;
        if (phone) {
            if (lblDienThoaiLink) {
                lblDienThoaiLink.href = `tel:${phone}`;
                lblDienThoaiLink.classList.remove('hidden');
            }
            if (lblDienThoaiText) lblDienThoaiText.textContent = phone;
            if (lblDienThoaiNone) lblDienThoaiNone.classList.add('hidden');
        } else {
            if (lblDienThoaiLink) lblDienThoaiLink.classList.add('hidden');
            if (lblDienThoaiNone) lblDienThoaiNone.classList.remove('hidden');
        }

        if (lblCccd) lblCccd.textContent = customer.cccd || '-';
        if (lblNgaySinh) lblNgaySinh.textContent = customer.ngay_sinh ? `${customer.ngay_sinh} (${customer.tuoi || ''} tuổi)` : '-';
        if (lblNgayThamGia) lblNgayThamGia.textContent = contract.ngay_tham_gia || '-';
        if (lblMenhGia) lblMenhGia.textContent = contract.menh_gia ? Number(contract.menh_gia).toLocaleString('vi-VN') + ' VNĐ' : '-';
        if (lblDiaChi) lblDiaChi.textContent = customer.dia_chi || '-';
    }

    if (btnLuuTiepTuc) {
        btnLuuTiepTuc.addEventListener('click', async () => {
            const ketQua = selectKetQua ? selectKetQua.value : '';
            const ghiChu = txtGhiChu ? txtGhiChu.value : '';

            if (!ketQua) {
                Swal.fire({ icon: 'warning', title: 'Chưa chọn kết quả', text: 'Vui lòng chọn kết quả cuộc gọi trước khi lưu!' });
                return;
            }

            if (!currentLead) {
                Swal.fire({ icon: 'warning', title: 'Không có lead', text: 'Không tìm thấy thông tin lead hiện tại!' });
                return;
            }

            const payload = {
                dien_thoai: currentLead.dien_thoai || currentLead.contracts?.dien_thoai,
                so_hop_dong: currentLead.so_hop_dong,
                ten_agent: currentAgentName,
                ket_qua_cuoc_goi: ketQua,
                ghi_chu: ghiChu,
                thoi_gian_goi: new Date().toISOString()
            };

            try {
                const res = await fetch('/api/agent/calls', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();

                if (result.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Đã lưu kết quả!',
                        timer: 1000,
                        showConfirmButton: false
                    }).then(() => {
                        if (selectKetQua) selectKetQua.value = '';
                        if (txtGhiChu) txtGhiChu.value = 'Gọi lần 1: ';
                        
                        currentIndex++;
                        if (currentIndex < leadList.length) {
                            displayLead(leadList[currentIndex]);
                        } else {
                            Swal.fire({ icon: 'info', title: 'Hoàn thành', text: 'Đã gọi hết danh sách lead trong ngày!' });
                        }
                    });
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                console.error("Lỗi lưu kết quả:", error);
                Swal.fire({ icon: 'error', title: 'Lỗi', text: 'Không thể lưu kết quả cuộc gọi vào hệ thống!' });
            }
        });
    }

    init();
});