// public/agents/js/ip-guard.js
//
// Hiện thông báo "Bạn cần đến văn phòng để nhận data lead" khi có API nào đó trả về bị chặn
// IP (xem middleware/officeIp.middleware.js ở backend - middleware trả JSON
// {success:false, blocked:true, message:'...'} kèm status 403 khi user đang bị admin bật
// "Giới hạn IP" mà lại gọi từ ngoài IP văn phòng).
//
// Dùng SweetAlert2 (đã có sẵn trong leads.html) thay vì tự dựng overlay che kín màn hình -
// popup có nút đóng, đóng xong thì trang dùng bình thường (bấm sang menu khác như "Công cụ
// tính FYC" được ngay), không còn bị "giam" trong màn hình chặn như trước nữa.
//
// File này KHÔNG cần biết chính xác leads.js đang gọi API nào để lấy data lead - nó "nghe"
// mọi lệnh gọi fetch() của trang bằng cách bọc lại window.fetch(), nên không cần sửa gì
// trong leads.js cả. Đặt script này ở đầu trang (trước leads.js) để đảm bảo bọc fetch xong
// trước khi leads.js kịp gọi API lấy data.
(function () {
    'use strict';

    let isShowingBlockedAlert = false; // tránh hiện chồng nhiều popup nếu có nhiều request cùng bị chặn 1 lúc

    function showBlockedAlert(message) {
        if (isShowingBlockedAlert) return; // đang hiện rồi thì thôi, không hiện chồng thêm cái nữa

        // Fallback nếu vì lý do gì đó trang không có SweetAlert2 (ví dụ lỡ xoá script CDN) -
        // dùng alert() mặc định của trình duyệt để thông báo vẫn hiện ra, không im lặng bỏ qua.
        if (typeof Swal === 'undefined') {
            alert(message);
            return;
        }

        isShowingBlockedAlert = true;
        Swal.fire({
            icon: 'warning',
            title: 'Không thể tải dữ liệu',
            text: message,
            confirmButtonText: 'Đã hiểu',
            confirmButtonColor: '#dc2626',
            allowOutsideClick: true,   // bấm ra ngoài popup cũng đóng được
            allowEscapeKey: true       // nhấn Esc cũng đóng được
        }).then(function () {
            isShowingBlockedAlert = false;
        });
    }

    // Bọc lại window.fetch: mọi request của trang (kể cả trong leads.js) đều đi qua đây trước
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        // Chỉ xử lý riêng trường hợp bị chặn IP (403 + blocked:true) - các lỗi 403 khác
        // (nếu có, không liên quan middleware IP) sẽ không có field "blocked" nên bị bỏ qua,
        // để leads.js tự xử lý như bình thường, không can thiệp nhầm.
        if (response.status === 403) {
            response.clone().json().then(function (data) {
                if (data && data.blocked) {
                    showBlockedAlert(data.message || 'Bạn cần đến văn phòng để nhận data lead');
                }
            }).catch(function () {
                // Response 403 không phải JSON -> không phải middleware chặn IP, bỏ qua
            });
        }

        return response;
    };
})();