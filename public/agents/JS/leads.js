// ==========================================
// TÊN FILE: public/agents/js/leads.js
// CHỨC NĂNG: Xử lý hiển thị thông tin Lead, Hợp đồng, Định dạng Ngày, Tiền tệ Mệnh giá
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
    const lblNamDaoHan = document.getElementById('lbl-nam-dao-han');
    const lblMenhGia = document.getElementById('lbl-menh-gia');
    const lblDiaChi = document.getElementById('lbl-dia-chi');

    const selectKetQua = document.getElementById('select-ket-qua');
    const txtGhiChu = document.querySelector('textarea');
    const btnLuuTiepTuc = document.querySelector('button.bg-emerald-600');

    let leadList = [];
    let originalLeadList = [];
    let currentIndex = 0;
    let currentLead = null;

    const currentAgentName = localStorage.getItem('user_name') || localStorage.getItem('ho_va_ten') || 'Lê Ngô Hải';

    // --- CÁC HÀM TIỆN ÍCH FORMAT DỮ LIỆU ---

    function formatDateVN(dateStr) {
        if (!dateStr) return '-';
        const cleanStr = String(dateStr).replace(/\D/g, '');
        if (cleanStr.length === 8) {
            const year = cleanStr.substring(0, 4);
            const month = cleanStr.substring(4, 6);
            const day = cleanStr.substring(6, 8);
            return `${day}/${month}/${year}`;
        }
        return dateStr;
    }

    function formatGender(genderCode) {
        if (!genderCode) return '-';
        const code = String(genderCode).trim().toUpperCase();
        if (code === 'M') return 'Nam';
        if (code === 'F') return 'Nữ';
        return 'Khác';
    }

    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '-';
        const num = Number(String(amount).replace(/\D/g, ''));
        if (isNaN(num)) return amount;
        return num.toLocaleString('vi-VN');
    }

    function calculateActiveYears(ngayThamGiaStr) {
        if (!ngayThamGiaStr) return null;
        const cleanStr = String(ngayThamGiaStr).replace(/\D/g, '');
        if (cleanStr.length < 4) return null;
        
        const joinYear = parseInt(cleanStr.substring(0, 4), 10);
        const currentYear = new Date().getFullYear();
        const diffYears = currentYear - joinYear;
        return diffYears >= 0 ? diffYears : 0;
    }

    // --- KHỞI TẠO VÀ TẢI DỮ LIỆU ---
    async function init() {
        // 1. Tải danh sách file để đổ vào dropdown trước
        await loadAssignedFiles();

        // 2. Mặc định chọn file đầu tiên nếu dropdown chưa có giá trị
        if (sourceFileSelect && sourceFileSelect.options.length > 1) {
            if (!sourceFileSelect.value) {
                sourceFileSelect.selectedIndex = 1;
            }
        }

        // 3. Tải danh sách lead dựa theo file đang chọn
        await loadLeadsBySelectedFile();

        // 4. Lắng nghe sự kiện thay đổi dropdown nguồn file
        if (sourceFileSelect) {
            sourceFileSelect.addEventListener('change', () => {
                loadLeadsBySelectedFile();
            });
        }
    }

    async function loadAssignedFiles() {
        try {
            const res = await fetch(`/api/agent/files?agent=${encodeURIComponent(currentAgentName)}`);
            const result = await res.json();
            if (result.success && sourceFileSelect) {
                sourceFileSelect.innerHTML = '<option value="">-- Tất cả file --</option>';
                result.data.forEach(item => {
                    sourceFileSelect.innerHTML += `<option value="${item.file_id}">${item.file_name} (${item.total_records || 0} leads)</option>`;
                });
            }
        } catch (error) {
            console.error("Lỗi tải file phân bổ:", error);
        }
    }

    async function loadLeadsBySelectedFile() {
        try {
            const selectedFileId = sourceFileSelect ? sourceFileSelect.value : '';
            const res = await fetch(`/api/agent/leads?agent=${encodeURIComponent(currentAgentName)}`);
            const result = await res.json();
            
            if (result.success && result.data) {
                originalLeadList = result.data;

                // Lọc danh sách lead theo file_id của hợp đồng nếu có chọn file cụ thể
                if (selectedFileId) {
                    leadList = originalLeadList.filter(item => {
                        const fileId = item.contracts?.file_id;
                        return String(fileId) === String(selectedFileId);
                    });
                } else {
                    leadList = [...originalLeadList];
                }

                currentIndex = 0;
                if (leadList.length > 0) {
                    displayLead(leadList[currentIndex]);
                } else {
                    clearDisplay();
                }
            }
        } catch (error) {
            console.error("Lỗi tải danh sách lead:", error);
        }
    }

    // --- HIỂN THỊ LÊN GIAO DIỆN ---

    function displayLead(item) {
        if (!item) return;
        currentLead = item;
        
        const contract = item.contracts || {};
        const customer = item.customers || {};

        if (lblSoHopDong) lblSoHopDong.textContent = item.so_hop_dong || contract.so_hop_dong || '-';
        if (lblHoTen) lblHoTen.textContent = customer.ho && customer.ten ? `${customer.ho} ${customer.ten}` : (customer.ten || '-');
        if (lblGioiTinh) lblGioiTinh.textContent = formatGender(customer.gioi_tinh);

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
        
        const formattedDob = formatDateVN(customer.ngay_sinh);
        if (lblNgaySinh) {
            lblNgaySinh.textContent = customer.ngay_sinh ? `${formattedDob} (${customer.tuoi || ''} tuổi)` : '-';
        }

        const ngayThamGiaRaw = contract.ngay_tham_gia;
        const formattedJoinDate = formatDateVN(ngayThamGiaRaw);
        const activeYears = calculateActiveYears(ngayThamGiaRaw);

        if (lblNgayThamGia) {
            if (ngayThamGiaRaw) {
                const yearInfoText = activeYears !== null ? ` (Hiện tại: ${activeYears} năm)` : '';
                lblNgayThamGia.textContent = `${formattedJoinDate}${yearInfoText}`;
            } else {
                lblNgayThamGia.textContent = '-';
            }
        }

        if (lblNamDaoHan) {
            lblNamDaoHan.textContent = contract.nam_dao_han || '-';
        }

        if (lblMenhGia) {
            lblMenhGia.textContent = contract.menh_gia ? `${formatCurrency(contract.menh_gia)} VNĐ` : '-';
        }

        if (lblDiaChi) lblDiaChi.textContent = customer.dia_chi || '-';
    }

    function clearDisplay() {
        if (lblSoHopDong) lblSoHopDong.textContent = '-';
        if (lblHoTen) lblHoTen.textContent = '-';
        if (lblGioiTinh) lblGioiTinh.textContent = '-';
        if (lblDienThoaiLink) lblDienThoaiLink.classList.add('hidden');
        if (lblDienThoaiNone) lblDienThoaiNone.classList.remove('hidden');
        if (lblCccd) lblCccd.textContent = '-';
        if (lblNgaySinh) lblNgaySinh.textContent = '-';
        if (lblNgayThamGia) lblNgayThamGia.textContent = '-';
        if (lblNamDaoHan) lblNamDaoHan.textContent = '-';
        if (lblMenhGia) lblMenhGia.textContent = '-';
        if (lblDiaChi) lblDiaChi.textContent = '-';
    }

    // --- SỰ KIỆN LƯU KẾT QUẢ CUỘC GỌI ---

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