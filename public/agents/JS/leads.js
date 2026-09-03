// ==========================================
// TÊN FILE: public/agents/js/leads.js
// CHỨC NĂNG: Xử lý hiển thị thông tin Lead, Hợp đồng, Định dạng Ngày, Tiền tệ Mệnh giá
// ==========================================

// --- CÁC HÀM TIỆN ÍCH GLOBAL (ĐẶT Ở NGOÀI ĐỂ TRÁNH LỖI SCOPE) ---

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

// --- BIẾN DỮ LIỆU GLOBAL ---
// FIX: Trước đây các biến này bị khai báo bằng "let" BÊN TRONG
// document.addEventListener("DOMContentLoaded", ...) nên hàm showLeadDetailModal()
// (chạy ở scope global, gọi qua onclick trong HTML) không thể truy cập được,
// khiến nó luôn fallback về dữ liệu thô (thiếu contracts + thiếu nhiều field customers).
// Nay đưa ra ngoài để toàn bộ file dùng chung 1 nguồn dữ liệu duy nhất.
let leadList = [];
let originalLeadList = [];
let currentIndex = 0;
let currentLead = null;

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

    const currentAgentName = localStorage.getItem('userNsame') || localStorage.getItem('ho_va_ten') || 'Lê Ngô Hải';

    // --- KHỞI TẠO VÀ TẢI DỮ LIỆU ---
    async function init() {
        await loadAssignedFiles();

        if (sourceFileSelect && sourceFileSelect.options.length > 1) {
            if (!sourceFileSelect.value) {
                sourceFileSelect.selectedIndex = 1;
            }
        }

        await loadLeadsBySelectedFile();
        await loadCallHistory();

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

            const soHopDongUI = lblSoHopDong ? lblSoHopDong.textContent.trim() : '';
            const dienThoaiUI = lblDienThoaiText ? lblDienThoaiText.textContent.trim() : '';

            const payload = {
                dien_thoai: currentLead.dien_thoai || currentLead.contracts?.dien_thoai || (dienThoaiUI !== '-' ? dienThoaiUI : ''),
                so_hop_dong: currentLead.so_hop_dong || currentLead.contracts?.so_hop_dong || (soHopDongUI !== '-' ? soHopDongUI : ''),
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

// --- XỬ LÝ NHẬT KÝ CUỘC GỌI ---
async function loadCallHistory() {
    const tbody = document.getElementById('nhat-ky-tbody');
    const filterDateEl = document.getElementById('filter-date');
    if (!tbody) return;

    try {
        const agentName = localStorage.getItem('user_name') || localStorage.getItem('ho_va_ten') || 'Lê Ngô Hải';

        const res = await fetch(`/api/agent/calls?agent=${encodeURIComponent(agentName)}`);
        const result = await res.json();

        if (result.success && result.data) {
            let calls = result.data;

            const selectedDate = filterDateEl ? filterDateEl.value : '';
            if (selectedDate) {
                calls = calls.filter(item => {
                    if (!item.thoi_gian_goi) return false;
                    const callDate = item.thoi_gian_goi.split('T')[0];
                    return callDate === selectedDate;
                });
            }

            if (calls.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 opacity-50">Không có lịch sử gọi trong ngày này</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            calls.forEach((item, index) => {
                const cus = item.customers || {};
                const hoTen = (cus.ho || cus.ten) ? `${cus.ho || ''} ${cus.ten || ''}`.trim() : 'Khách lẻ';
                const dienThoai = item.dien_thoai || '-';
                const diaChi = cus.dia_chi || '-';
                const ketQua = item.ket_qua_cuoc_goi || '-';
                const ghiChu = item.ghi_chu || '-';

                const row = document.createElement('tr');
                row.className = 'border-b hover:bg-emerald-50/50 transition';
                row.innerHTML = `
                    <td class="p-2 font-medium">${index + 1}</td>
                    <td class="p-2 font-semibold">${hoTen}</td>
                    <td class="p-2">
                        <div class="font-medium text-emerald-600">${dienThoai}</div>
                        <div class="opacity-75 text-[11px] truncate max-w-[180px]" title="${diaChi}">${diaChi}</div>
                    </td>
                    <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">${ketQua}</span></td>
                    <td class="p-2 opacity-90 break-words max-w-xs" id="note-text-${item.id}">${ghiChu}</td>
                    <td class="p-2 text-center whitespace-nowrap">
                        <button onclick="editCallNote('${item.id}', \`${encodeURIComponent(ghiChu)}\`)" class="p-1 hover:text-emerald-600 transition mr-1" title="Chỉnh sửa ghi chú">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5 inline"></i>
                        </button>
                        <button onclick='showLeadDetailModal(${JSON.stringify(item)})' class="p-1 hover:text-emerald-600 transition" title="Xem chi tiết hồ sơ">
                            <i data-lucide="eye" class="w-3.5 h-3.5 inline"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    } catch (error) {
        console.error("Lỗi tải nhật ký cuộc gọi:", error);
    }
}

// Hàm chỉnh sửa ghi chú với tiền tố cố định không cho xoá
async function editCallNote(callId, encodedOldNote) {
    const oldNote = decodeURIComponent(encodedOldNote);

    let prefix = "Gọi lần 1: ";
    let contentOnly = oldNote;

    if (oldNote.includes(":")) {
        const parts = oldNote.split(":");
        prefix = parts[0] + ": ";
        contentOnly = parts.slice(1).join(":").trim();
    }

    const { value: newContent } = await Swal.fire({
        title: 'Chỉnh sửa ghi chú',
        html: `
            <div style="text-align: left; margin-bottom: 5px; font-size: 12px; opacity: 0.8;">Tiền tố cố định (không thể sửa):</div>
            <input type="text" id="swal-prefix" class="swal2-input" value="${prefix}" readonly style="background: #f3f4f6; color: #6b7280; cursor: not-allowed; margin-top: 0;">
            <div style="text-align: left; margin-top: 10px; margin-bottom: 5px; font-size: 12px;">Nội dung ghi chú mới:</div>
            <textarea id="swal-content" class="swal2-textarea" placeholder="Nhập nội dung ghi chú...">${contentOnly}</textarea>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        cancelButtonText: 'Huỷ',
        preConfirm: () => {
            const content = document.getElementById('swal-content').value;
            return prefix + content;
        }
    });

    if (newContent) {
        try {
            const res = await fetch(`/api/agent/calls/${callId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ghi_chu: newContent })
            });
            const result = await res.json();
            if (result.success) {
                Swal.fire({ icon: 'success', title: 'Đã cập nhật ghi chú!', timer: 1000, showConfirmButton: false });
                loadCallHistory();
            } else {
                throw new Error(result.message);
            }
        } catch (err) {
            console.error("Lỗi cập nhật ghi chú:", err);
            document.getElementById(`note-text-${callId}`).textContent = newContent;
            Swal.fire({ icon: 'success', title: 'Đã cập nhật giao diện!', timer: 1000, showConfirmButton: false });
        }
    }
}

// --- HIỂN THỊ POPUP CHI TIẾT HỒ SƠ KHÁCH HÀNG (JOIN THEO KHÓA dien_thoai) ---
function showLeadDetailModal(item) {
    // 1. Lấy khóa ngoại từ bảng call_history: row: dien_thoai
    const phoneKey = item.dien_thoai || item.contracts?.dien_thoai || item.customers?.dien_thoai;

    let targetData = null;
    // FIX: originalLeadList / leadList giờ là biến global thật sự (khai báo ở đầu file)
    // nên masterList sẽ luôn lấy được đúng danh sách lead đầy đủ contracts + customers.
    const masterList = (originalLeadList && originalLeadList.length > 0) ? originalLeadList : (leadList || []);

    // 2. Thực hiện "JOIN" tìm trong danh sách lead theo đúng key dien_thoai để lấy dữ liệu từ bảng contracts và customers
    if (phoneKey && masterList.length > 0) {
        targetData = masterList.find(l => {
            const lPhone = String(l.dien_thoai || l.contracts?.dien_thoai || l.customers?.dien_thoai || '').trim();
            return lPhone === String(phoneKey).trim();
        });
    }

    // Nếu không thấy trong list, check currentLead
    if (!targetData && currentLead) {
        const cPhone = String(currentLead.dien_thoai || currentLead.contracts?.dien_thoai || '').trim();
        if (cPhone === String(phoneKey).trim()) {
            targetData = currentLead;
        }
    }

    // Fallback nếu item truyền vào đã có sẵn cấu trúc
    if (!targetData) {
        targetData = item;
    }

    // Trích xuất dữ liệu từ 2 bảng chính theo schema: contracts & customers
    const contract = targetData.contracts || {};
    const customer = targetData.customers || {};

    // 3. Map dữ liệu chuẩn các row theo yêu cầu:
    // Số hợp đồng: ưu tiên contracts trước, sau đó đến targetData
    const soHopDongVal = contract.so_hop_dong || targetData.so_hop_dong || '-';

    // Họ và Tên: ưu tiên customers trước
    const hoVal = customer.ho || '';
    const tenVal = customer.ten || targetData.ho_ten || '-';
    const hoTenVal = (hoVal && tenVal) ? `${hoVal} ${tenVal}` : tenVal;

    // Giới tính
    let gioiTinhVal = '-';
    const rawGender = String(customer.gioi_tinh || '').trim().toUpperCase();
    if (rawGender === 'M' || rawGender === 'NAM') gioiTinhVal = 'Nam';
    else if (rawGender === 'F' || rawGender === 'NỮ') gioiTinhVal = 'Nữ';
    else if (rawGender) gioiTinhVal = rawGender;

    // CCCD / CMND
    const cccdVal = customer.cccd || '-';

    // Ngày sinh: table: customers -> row: ngay_sinh
    let ngaySinhVal = '-';
    if (customer.ngay_sinh) {
        const formattedDob = formatDateVN(customer.ngay_sinh);
        const tuoival = customer.tuoi || '';
        ngaySinhVal = tuoival ? `${formattedDob} (${tuoival} tuổi)` : formattedDob;
    }

    // Ngày tham gia: table: contracts -> row: ngay_tham_gia (Sửa lỗi khoảng trắng)
    let ngayThamGiaVal = '-';
    const ngayThamGiaRaw = contract.ngay_tham_gia;
    if (ngayThamGiaRaw) {
        const formattedJoinDate = formatDateVN(ngayThamGiaRaw);
        ngayThamGiaVal = formattedJoinDate;
    }

    // Năm đáo hạn: table: contracts -> row: nam_dao_han
    const namDaoHanVal = contract.nam_dao_han || '-';

    // Mệnh giá bảo hiểm: table: contracts -> row: menh_gia
    let menhGiaVal = '-';
    if (contract.menh_gia !== undefined && contract.menh_gia !== null && contract.menh_gia !== '') {
        menhGiaVal = `${formatCurrency(contract.menh_gia)} VND`;
    }

    // - Địa chỉ đăng ký: table: customers -> row: dia_chi
    const diaChiVal = customer.dia_chi || targetData.dia_chi || '-';
    const finalPhoneVal = phoneKey || targetData.dien_thoai || '-';

    // 4. Render Popup
    Swal.fire({
        title: '<div class="text-lg font-bold">Chi Tiết Hồ Sơ Khách Hàng</div>',
        html: `
            <div class="theme-card border rounded-xl p-4 text-left text-xs space-y-3 shadow-sm">
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Số hợp đồng:</span>
                    <span class="font-bold">${soHopDongVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Họ và tên:</span>
                    <span class="font-bold">${hoTenVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Giới tính:</span>
                    <span>${gioiTinhVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Điện thoại:</span>
                    <span class="font-semibold text-emerald-600">${finalPhoneVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">CCCD / CMND:</span>
                    <span>${cccdVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Ngày sinh (Tuổi):</span>
                    <span>${ngaySinhVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Ngày tham gia:</span>
                    <span>${ngayThamGiaVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Năm đáo hạn:</span>
                    <span>${namDaoHanVal}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="opacity-75 font-medium">Mệnh giá bảo hiểm:</span>
                    <span>${menhGiaVal}</span>
                </div>
                <div class="flex flex-col space-y-1">
                    <span class="opacity-75 font-medium">Địa chỉ đăng ký:</span>
                    <span class="p-2 rounded border opacity-90">${diaChiVal}</span>
                </div>
            </div>
        `,
        confirmButtonText: 'Đóng',
        width: '580px',
        customClass: {
            confirmButton: 'theme-btn px-4 py-2 rounded-lg font-medium transition'
        }
    });
}