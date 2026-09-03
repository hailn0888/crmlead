/** CÁC TRANG KHÁC KHI GỌI CHỨC NĂNG TÌM KIẾM: nhứng file searchHelper.js vào thẻ <head> rồi dùng hàm khởi tạo:
     document.addEventListener('DOMContentLoaded', () => {
     Gọi hàm dùng chung: 
     - Ô tìm kiếm ID là 'searchInput'
     - Dropdown lọc ID là 'roleFilter'
     - Bảng dữ liệu ID là 'userTableBody'
     - Quét tìm kiếm ở Cột 1 (Họ tên) và Cột 2 (Email) -> Truyền [1, 2]
     - Lọc phân quyền ở Cột 3 -> Truyền 3
     initTableSearch('searchInput', 'roleFilter', 'userTableBody', [1, 2], 3);
     });
     ==================================================================================================================================
     document.addEventListener('DOMContentLoaded', () => {
        Quét tìm kiếm trên Cột 1, 2, 3 (Tên, Số HĐ, SĐT) và lọc trạng thái ở Cột 4
        initTableSearch('searchInput', 'statusFilter', 'contractTableBody', [1, 2, 3], 4);
        });
*/ 

/**
 * Hàm tìm kiếm và lọc dữ liệu dùng chung cho toàn bộ dự án
 * @param {string} inputId - ID của ô input tìm kiếm (VD: 'searchInput')
 * @param {string} selectId - ID của dropdown lọc (nếu có, VD: 'roleFilter')
 * @param {string} tableBodyId - ID của thẻ tbody chứa dữ liệu bảng (VD: 'userTableBody')
 * @param {Array} searchColumns - Mảng các vị trí cột (index tính từ 1) muốn quét tìm kiếm. VD: [1, 2, 3] nghĩa là quét cột 1, 2 và 3.
 * @param {number} [filterColumnIndex] - Vị trí cột (tính từ 1) dùng để lọc theo giá trị của dropdown (nếu có).
 */

function initTableSearch(inputId, selectId, tableBodyId, searchColumns = [], filterColumnIndex = null) {
    const searchInput = document.getElementById(inputId);
    const selectFilter = document.getElementById(selectId);
    const tableBody = document.getElementById(tableBodyId);

    if (!tableBody) return;

    function executeFilter() {
        const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const filterValue = selectFilter ? selectFilter.value.toLowerCase().trim() : '';
        
        const rows = tableBody.querySelectorAll('tr');

        rows.forEach(row => {
            let matchKeyword = true;
            let matchSelect = true;

            // 1. Xử lý tìm kiếm từ khóa trên các cột được chỉ định
            if (keyword) {
                matchKeyword = searchColumns.some(colIndex => {
                    const cell = row.querySelector(`td:nth-child(${colIndex})`);
                    if (cell) {
                        return cell.innerText.toLowerCase().includes(keyword);
                    }
                    return false;
                });
            }

            // 2. Xử lý lọc theo dropdown (nếu có cấu hình)
            if (filterValue && filterValue !== 'all' && filterColumnIndex) {
                const filterCell = row.querySelector(`td:nth-child(${filterColumnIndex})`);
                if (filterCell) {
                    const cellText = filterCell.innerText.toLowerCase();
                    matchSelect = cellText.includes(filterValue);
                } else {
                    matchSelect = false;
                }
            }

            // Hiển thị hoặc ẩn dòng dựa vào kết quả lọc
            if (matchKeyword && matchSelect) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', executeFilter);
    }
    if (selectFilter) {
        selectFilter.addEventListener('change', executeFilter);
    }
}