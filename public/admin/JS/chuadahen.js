/**
 * public/admin/js/chuadahen.js
 * Quản lý & Điều khiển logic Dữ liệu Chưa Đã Hẹn (Chữa / Đã hẹn)
 */

document.addEventListener('DOMContentLoaded', () => {
    initChuaDaHenModule();
});

function initChuaDaHenModule() {
    console.log('ChuaDaHen Module Initialized');
}

/**
 * 1. Đếm số lượng data từ file Excel (Excel template upload)
 * Quy tắc: Số lượng record = Tổng số hàng có dữ liệu - 1 (trừ hàng tiêu đề Header)
 * @param {Array} sheetRows - Mảng dữ liệu các dòng đọc được từ XLSX / XLSX library
 * @returns {number} Số lượng bản ghi hợp lệ
 */
function countExcelRecords(sheetRows) {
    if (!Array.isArray(sheetRows) || sheetRows.length <= 1) {
        return 0;
    }
    // Trừ 1 cho dòng tiêu đề header
    return sheetRows.length - 1;
}

/**
 * 2. Xác định trạng thái gọi dựa trên ket_qua_cuoc_goi
 * @param {string|null} ketQuaCuocGoi 
 * @returns {string} Trang thai ('chua_goi' | 'da_goi' | 'hen_gap_thanh_cong')
 */
function getCallStatusCategory(ketQuaCuocGoi) {
    if (!ketQuaCuocGoi || ketQuaCuocGoi.trim() === '' || ketQuaCuocGoi === 'null') {
        return 'chua_goi';
    }
    if (ketQuaCuocGoi === 'hen_gap_thanh_cong') {
        return 'hen_gap_thanh_cong'; // Hoặc bao gồm trong 'da_goi' & phân loại riêng 'đã hẹn'
    }
    return 'da_goi';
}

/**
 * 3. Thống kê tổng hợp số lượng "Chưa gọi", "Đã gọi", "Đã hẹn"
 * @param {Array} leadList - Danh sách các Lead / Dữ liệu khách hàng
 * @returns {Object} Thống kê { chuaGoi, daGoi, daHen, tongCong }
 */
function calculateCallStatistics(leadList) {
    let chuaGoi = 0;
    let daGoi = 0;
    let daHen = 0;

    if (Array.isArray(leadList)) {
        leadList.forEach(lead => {
            const status = lead.ket_qua_cuoc_goi;
            if (!status || status.trim() === '' || status === 'null') {
                chuaGoi++;
            } else {
                daGoi++; // Tất cả trường hợp không null đều tính là "Đã gọi"
                if (status === 'hen_gap_thanh_cong') {
                    daHen++; // Riêng kết quả 'hen_gap_thanh_cong' tính thêm là "Đã hẹn"
                }
            }
        });
    }

    return {
        chuaGoi,
        daGoi,
        daHen,
        tongCong: leadList ? leadList.length : 0
    };
}

/**
 * 4. Xử lý lưu báo cáo cuộc gọi bắt buộc trước khi chuyển Lead tiếp theo
 * @param {Object} params - { leadId, userId, ketQuaCuocGoi, ghiChu }
 * @param {Function} onNextLeadCallback - Hàm Callback được gọi để chuyển sang Lead tiếp theo sau khi lưu thành công
 */
async function submitCallReportAndNextLead(params, onNextLeadCallback) {
    const { leadId, userId, ketQuaCuocGoi, ghiChu } = params;

    // Bắt buộc phải chọn kết quả cuộc gọi
    if (!ketQuaCuocGoi || ketQuaCuocGoi.trim() === '') {
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                title: 'Chưa chọn báo cáo!',
                text: 'Vui lòng chọn kết quả cuộc gọi trước khi chuyển sang Lead tiếp theo!',
                icon: 'warning',
                confirmButtonText: 'Đã hiểu'
            });
        } else {
            alert('Vui lòng chọn kết quả cuộc gọi trước khi chuyển sang Lead tiếp theo!');
        }
        return false;
    }

    try {
        // Lưu thông tin vào bảng call_history & cập nhật trạng thái lead
        const response = await fetch('/api/leads/call-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lead_id: leadId,
                user_id: userId,
                ket_qua_cuoc_goi: ketQuaCuocGoi,
                ghi_chu: ghiChu || '',
                created_at: new Date().toISOString()
            })
        });

        const data = await response.json();

        if (data.success) {
            if (typeof Swal !== 'undefined') {
                await Swal.fire({
                    title: 'Thành công!',
                    text: 'Đã lưu báo cáo cuộc gọi!',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }

            // Chuyển sang lead tiếp theo sau khi đã lưu báo cáo thành công
            if (typeof onNextLeadCallback === 'function') {
                onNextLeadCallback(data.nextLead || null);
            }
            return true;
        } else {
            throw new Error(data.message || 'Lỗi lưu báo cáo cuộc gọi');
        }
    } catch (error) {
        console.error('Lỗi khi submit call report:', error);
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                title: 'Thất bại!',
                text: error.message || 'Không thể lưu báo cáo cuộc gọi!',
                icon: 'error',
                confirmButtonText: 'Đóng'
            });
        }
        return false;
    }
}

// Export functions nếu sử dụng dạng module hoặc gán vào window object
if (typeof window !== 'undefined') {
    window.countExcelRecords = countExcelRecords;
    window.getCallStatusCategory = getCallStatusCategory;
    window.calculateCallStatistics = calculateCallStatistics;
    window.submitCallReportAndNextLead = submitCallReportAndNextLead;
}
