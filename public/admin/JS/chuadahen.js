/**
 * public/admin/js/chuadahen.js
 * Thư viện logic xử lý đếm và phân loại Chưa Gọi / Đã Gọi / Đã Hẹn cho Tab 3
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('ChuaDaHen Module Initialized');
});

/**
 * 1. Đếm số lượng bản ghi từ file Excel / Supabase data
 * Quy tắc: Số lượng record = Tổng số hàng có dữ liệu - 1 (trừ dòng header)
 */
function countExcelRecords(sheetRows) {
    if (!Array.isArray(sheetRows) || sheetRows.length <= 1) {
        return 0;
    }
    return sheetRows.length - 1;
}

/**
 * 2. Thống kê tổng hợp số lượng "Chưa gọi", "Đã gọi", "Đã hẹn" dựa trên bảng call_history hoặc lead_assignments
 * @param {Array} dataList - Danh sách các dòng dữ liệu chi tiết của file
 * @returns {Object} Thống kê { chuaGoi, daGoi, daHen, tongCong }
 */
function calculateCallStatistics(dataList) {
    let chuaGoi = 0;
    let daGoi = 0;
    let daHen = 0;

    if (Array.isArray(dataList)) {
        dataList.forEach(item => {
            const status = item.ket_qua_cuoc_goi;
            if (!status || status === '' || status === 'null' || status === null) {
                chuaGoi++;
            } else {
                daGoi++;
                // Kiểm tra kết quả hẹn gặp thành công (chuẩn hóa chuỗi hoặc so sánh trực tiếp)
                if (status === 'Hẹn gặp thành công' || status === 'hen_gap_thanh_cong') {
                    daHen++;
                }
            }
        });
    }

    return {
        chuaGoi,
        daGoi,
        daHen,
        tongCong: dataList ? dataList.length : 0
    };
}

// Export các hàm ra window object để sử dụng global
if (typeof window !== 'undefined') {
    window.countExcelRecords = countExcelRecords;
    window.calculateCallStatistics = calculateCallStatistics;
}