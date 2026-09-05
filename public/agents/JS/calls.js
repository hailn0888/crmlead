// ==========================================
// TÊN FILE: public/agents/js/calls.js
// CHỨC NĂNG: Chỉ cung cấp các hàm dùng chung mà khối <script> nội tuyến
// trong calls.html cần tới (formatDateVN, formatCurrency, showLeadDetailModal).
//
// LƯU Ý QUAN TRỌNG:
// Việc fetch dữ liệu (fetchData) và render bảng (renderTab1/2/3) của cả 4 tab
// ĐÃ được xử lý đầy đủ bởi khối <script> viết ngay trong calls.html.
// KHÔNG được thêm lại loadSuccessfulAppointments()/renderAppointmentsTable()/
// listener DOMContentLoaded tự fetch ở file này nữa — nếu thêm lại sẽ tạo ra
// 2 luồng fetch + render cùng lúc vào chung 1 tbody, gây race condition
// (dữ liệu lúc hiện đúng lúc hiện sai/thiếu cột tuỳ request nào trả về sau).
// ==========================================

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

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    const num = Number(String(amount).replace(/\D/g, ''));
    if (isNaN(num)) return amount;
    return num.toLocaleString('vi-VN');
}

// --- HIỂN THỊ POPUP CHI TIẾT HỒ SƠ KHÁCH HÀNG ---
// Được gọi từ nút mắt trong renderTab1() (calls.html, dòng ~297):
// onclick='showLeadDetailModal(${JSON.stringify(item)...})'
// "item" truyền vào đã có sẵn item.customers và item.contracts do API
// /api/calls/successful-appointments trả về (đã fix ở calls.routes.js).
function showLeadDetailModal(item) {
    const contract = item.contracts || {};
    const customer = item.customers || {};

    // Số hợp đồng: ưu tiên contracts trước, sau đó đến item
    const soHopDongVal = contract.so_hop_dong || item.so_hop_dong || '-';

    // Họ và Tên: ưu tiên customers trước
    const hoVal = customer.ho || '';
    const tenVal = customer.ten || item.ho_ten || '-';
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

    // Ngày tham gia: table: contracts -> row: ngay_tham_gia
    let ngayThamGiaVal = '-';
    const ngayThamGiaRaw = contract.ngay_tham_gia;
    if (ngayThamGiaRaw) {
        ngayThamGiaVal = formatDateVN(ngayThamGiaRaw);
    }

    // Năm đáo hạn: table: contracts -> row: nam_dao_han
    const namDaoHanVal = contract.nam_dao_han || '-';

    // Mệnh giá bảo hiểm: table: contracts -> row: menh_gia
    let menhGiaVal = '-';
    if (contract.menh_gia !== undefined && contract.menh_gia !== null && contract.menh_gia !== '') {
        menhGiaVal = `${formatCurrency(contract.menh_gia)} VND`;
    }

    // Địa chỉ đăng ký: table: customers -> row: dia_chi
    const diaChiVal = customer.dia_chi || item.dia_chi || '-';
    const finalPhoneVal = item.dien_thoai || contract.dien_thoai || customer.dien_thoai || '-';

    // Render Popup
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