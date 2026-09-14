// public/agents/js/ip-guard.js
//
// Hiển thị màn hình chặn "Bạn cần đến văn phòng để nhận data lead" khi có API nào đó trả về
// bị chặn IP (xem middleware/officeIp.middleware.js ở backend - middleware trả JSON
// {success:false, blocked:true, message:'...'} kèm status 403 khi user đang bị admin bật
// "Giới hạn IP" mà lại gọi từ ngoài IP văn phòng).
//
// File này KHÔNG cần biết chính xác leads.js đang gọi API nào để lấy data lead - nó "nghe"
// mọi lệnh gọi fetch() của trang bằng cách bọc lại window.fetch(), nên không cần sửa gì
// trong leads.js cả. Đặt script này ở đầu trang (trước leads.js) để đảm bảo bọc fetch xong
// trước khi leads.js kịp gọi API lấy data.
(function () {
    'use strict';

    // Dựng và hiện overlay che kín màn hình kèm thông báo
    function showBlockedOverlay(message) {
        if (document.getElementById('ip-guard-overlay')) return; // đã hiện rồi thì không tạo lại

        const overlay = document.createElement('div');
        overlay.id = 'ip-guard-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:1000000',
            'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
            'gap:12px', 'background:rgba(15,15,15,0.96)', 'color:#fff',
            'text-align:center', 'padding:24px', 'font-family:Arial, sans-serif'
        ].join(';');
        overlay.innerHTML =
            '<div style="font-size:42px;">🔒</div>' +
            '<div style="font-size:18px; font-weight:700; max-width:480px; line-height:1.5;">' +
                escapeHtml(message) +
            '</div>';
        document.body.appendChild(overlay);
    }

    // Tránh lỗi XSS nếu message từ server lỡ chứa ký tự HTML đặc biệt
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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
                    showBlockedOverlay(data.message || 'Bạn cần đến văn phòng để nhận data lead');
                }
            }).catch(function () {
                // Response 403 không phải JSON -> không phải middleware chặn IP, bỏ qua
            });
        }

        return response;
    };
})();