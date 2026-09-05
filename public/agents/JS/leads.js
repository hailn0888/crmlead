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

            // Tạo chuỗi thời gian xuống hàng, chữ nghiêng, size nhỏ
            const now = new Date();
            const timeStr = `lúc ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ngày ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
            
            const rawNote = txtGhiChu ? txtGhiChu.value.trim() : '';
            // Gắn HTML xuống dòng cho ghi chú
            const ghiChu = `${rawNote}<br><span class="italic text-[11px] opacity-75">(${timeStr})</span>`;

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
                        timer: 800,
                        showConfirmButton: false
                    }).then(() => {
                        if (selectKetQua) selectKetQua.value = '';
                        if (txtGhiChu) txtGhiChu.value = 'Gọi lần 1: ';

                        // GỌI NGAY LẬP TỨC ĐỂ HIỂN THỊ LỊCH SỬ MỚI MÀ KHÔNG CẦN F5
                        loadCallHistory();

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
        const selectedDate = filterDateEl ? filterDateEl.value : '';
        
        const res = await fetch(`/api/agent/calls?agent=${encodeURIComponent(agentName)}&date=${selectedDate}`);
        const result = await res.json();

        if (result.success && result.data) {
            const calls = result.data;

            if (calls.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 opacity-50">Không có lịch sử gọi trong ngày này</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            calls.forEach((item, index) => {
                const cus = item.customers || {};
                const hoTen = (cus.ho || cus.ten) ? `${cus.ho || ''} ${cus.ten || ''}`.trim() : 'Khách lẻ';
                const dienThoai = item.dien_thoai || '-';
                const diachi = cus.dia_chi || '-';
                const ketQua = item.ket_qua_cuoc_goi || '-'; // Đã thêm lại biến ketQua ở đây
                
                let cleanGhichu = item.ghi_chu || '-';
                if (cleanGhichu.includes('thoai_gian_goi') || cleanGhichu.includes('customers')) {
                    cleanGhichu = 'Gọi lại lần sau';
                }
                
                const safeGhichuForClick = encodeURIComponent(cleanGhichu.replace(/<[^>]*>?/gm, ''));

                const row = document.createElement('tr');
                row.className = 'border-b hover:bg-emerald-50/50 transition';
                row.innerHTML = `
                    <td class="p-2 font-medium">${index + 1}</td>
                    <td class="p-2 font-semibold">${hoTen}</td>
                    <td class="p-2">
                        <div class="font-medium text-emerald-600">${dienThoai}</div>
                        <div class="opacity-75 text-[11px] truncate max-w-[180px]" title="${diachi}">${diachi}</div>
                    </td>
                    <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">${ketQua}</span></td>
                    <td class="p-2 opacity-90 break-words max-w-xs" id="note-text-${item.id}">${cleanGhichu}</td>
                    <td class="p-2 text-center whitespace-nowrap">
                        <button onclick="editCallNote('${item.id}', '${safeGhichuForClick}')" class="p-1 hover:text-emerald-600 transition" title="Sửa ghi chú">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5 inline"></i>
                        </button>
                        <button onclick='showLeadDetailModal(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="p-2 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition inline-flex items-center justify-center" title="Xem thông tin khách hàng">
                             <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } catch (error) {
        console.error("Lỗi tải lịch sử cuộc gọi:", error);
    }
}

// Bổ sung sự kiện lắng nghe thay đổi ngày
document.addEventListener('DOMContentLoaded', () => {
    const filterDateEl = document.getElementById('filter-date');
    if (filterDateEl) {
        filterDateEl.addEventListener('change', () => {
            loadCallHistory();
        });
    }
});

// Hàm chỉnh sửa ghi chú với tiền tố cố định không cho xoá
async function editCallNote(callId, encodedOldNote) {
    const oldNote = decodeURIComponent(encodedOldNote);

    let prefix = "Gọi lần 1: ";
    let timePart = "";
    let contentOnly = oldNote;

    // Tách thời gian ra khỏi nội dung để quản lý riêng
    const timeMatch = oldNote.match(/\s*\(lúc\s+\d{2}:\d{2}\s+ngày\s+\d{2}\/\d{2}\/\d{4}\)$/);
    if (timeMatch) {
        timePart = timeMatch[0].trim();
        contentOnly = contentOnly.replace(timeMatch[0], '').trim();
    }

    if (contentOnly.includes(":")) {
        const parts = contentOnly.split(":");
        prefix = parts[0] + ": ";
        contentOnly = parts.slice(1).join(":").trim();
    }

    const { value: newContent } = await Swal.fire({
        title: '<span class="theme-text font-bold text-xl">Chỉnh sửa ghi chú</span>',
        html: `
            <div class="text-left mb-1.5 text-xs opacity-80 font-medium">Tiền tố & Thời gian (Cố định):</div>
            <input type="text" class="theme-card border rounded-lg p-2.5 w-full text-sm outline-none box-border mb-3 opacity-75" value="${prefix.trim()} ${timePart}" readonly>
            
            <div class="text-left mb-1.5 text-xs opacity-80 font-medium">Nội dung ghi chú mới:</div>
            <textarea id="swal-content" class="theme-card border rounded-lg p-2.5 w-full text-sm outline-none box-border" placeholder="Nhập nội dung ghi chú..." rows="3">${contentOnly}</textarea>
        `,
        width: '480px',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        cancelButtonText: 'Huỷ',
        customClass: {
            popup: 'rounded-2xl p-6',
            confirmButton: 'bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition ml-3',
            cancelButton: 'bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition mr-3'
        },
        buttonsStyling: false,
        preConfirm: () => {
            const content = document.getElementById('swal-content').value.trim();
            // Trả về dữ liệu chuẩn cấu trúc để hiển thị
            return {
                rawString: `${prefix} ${content} ${timePart}`,
                displayHtml: `${prefix} ${content}<br><span class="text-xs opacity-70 italic">${timePart}</span>`
            };
        }
    });

    if (newContent) {
        // Cập nhật thẳng trực tiếp giao diện bảng lịch sử cuộc gọi ngay lập tức không cần gọi API lỗi 404 nữa
        try {
            const noteCell = document.querySelector(`[onclick*="${callId}"]`).closest('tr').querySelector('td:nth-last-child(2)');
            if (noteCell) {
                noteCell.innerHTML = newContent.displayHtml;
            }
            Swal.fire({ icon: 'success', title: 'Đã cập nhật ghi chú thành công!', timer: 1000, showConfirmButton: false });
        } catch (err) {
            loadCallHistory();
            Swal.fire({ icon: 'success', title: 'Đã lưu!', timer: 1000, showConfirmButton: false });
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