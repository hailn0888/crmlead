/**
 * public/js/security.js
 * Bảo mật nội dung cho các trang chứa dữ liệu khách hàng nhạy cảm (ví dụ leads.html).
 * Cách dùng: thêm 1 dòng vào cuối trang cần bảo vệ:
 *   <script src="/js/security.js"></script>
 *
 * File này làm 3 việc:
 *   1) Vô hiệu hoá copy / bôi đen dữ liệu bằng chuột và phím tắt.
 *   2) Phát hiện các tổ hợp phím hay dùng để chụp màn hình -> làm mờ (blur) toàn trang.
 *   3) Watermark (họ tên + tên đăng nhập) phủ mờ khắp trang để răn đe/truy vết khi ai đó
 *      dùng điện thoại chụp lại màn hình.
 *
 * ==================== LƯU Ý QUAN TRỌNG - GIỚI HẠN THỰC TẾ ====================
 * JavaScript chạy trong trình duyệt KHÔNG có quyền ngăn chặn hệ điều hành chụp màn hình.
 * Với phím PrintScreen hoặc tổ hợp Windows + Shift + S (Snipping Tool), Windows/macOS xử lý
 * việc chụp ảnh ở tầng hệ điều hành - có thể xảy ra trước hoặc độc lập với việc trình duyệt
 * nhận được sự kiện bàn phím, nên trang web không thể "chặn đứng" hành động chụp đó.
 * Việc làm mờ toàn trang ở đây chỉ có 2 tác dụng thật sự:
 *   - Với các tổ hợp KHÔNG PHẢI phím tắt hệ thống (Ctrl+Alt, Ctrl+Shift, Ctrl+Shift+Alt):
 *     trình duyệt luôn nhận được sự kiện trước, nên làm mờ ngay lập tức là hiệu quả.
 *   - Với PrintScreen / Win+Shift+S: chỉ là "chữa cháy" - làm mờ ngay khi phát hiện được,
 *     phòng trường hợp người dùng giữ phím lâu hoặc chụp nhiều lần liên tiếp.
 *   - Việc chụp ảnh màn hình bằng ĐIỆN THOẠI thì JS hoàn toàn không phát hiện được.
 *     Đây là lý do watermark (mục 3) mới là lớp bảo vệ thực sự đáng tin cậy cho trường hợp này -
 *     mục tiêu là RĂN ĐE và TRUY VẾT (biết ảnh chụp bị lộ từ tài khoản nào), không phải "chặn".
 * ===============================================================================
 */
(function () {
    'use strict';

    // ==================== CẤU HÌNH CHUNG ====================
    const CONFIG = {
        blurDuration: 2500, // (ms) thời gian giữ hiệu ứng mờ sau khi phát hiện thao tác nghi chụp màn hình
        watermark: {
            // Độ đậm/màu khác nhau theo theme - nền sáng (light) cần chữ SẪM hơn mới thấy rõ,
            // nền tối (dark) cần chữ SÁNG hơn mới thấy rõ. Nếu 1 màu cố định thì y hệt bug cũ:
            // xám nhạt trên nền tối gần như vô hình.
            colorLight: 'rgba(60,60,60,0.13)',   // chữ xám đậm, dùng khi theme = light
            colorDark: 'rgba(255,255,255,0.14)', // chữ trắng mờ, dùng khi theme = dark
            fontSize: 16,       // px
            angle: -28,         // độ nghiêng của chữ watermark
            tileWidth: 260,     // kích thước 1 ô lặp (px) - lặp lại (repeat) để phủ kín vùng
            tileHeight: 180,
            // CSS selector của khung cần watermark (ví dụ chỉ khung "Hồ Sơ Khách Hàng").
            // Nếu để rỗng '' hoặc không tìm thấy phần tử nào khớp selector này trên trang,
            // sẽ tự động watermark TOÀN TRANG như mặc định cũ (không bị lỗi/mất tác dụng).
            targetSelector: '#customer-profile-card'
        },
        // Tên các key trong localStorage có thể đang lưu thông tin người dùng đăng nhập.
        // Nếu login.js của bạn dùng tên key khác, sửa lại danh sách bên dưới cho khớp,
        // hoặc gọi CRMSecurity.setWatermarkUser(hoVaTen, tenDangNhap) từ trang của bạn
        // ngay sau khi lấy được thông tin user thật (xem hướng dẫn ở cuối file).
        localStorageKeys: {
            hoVaTen: ['ho_va_ten', 'full_name', 'ten_nhan_vien'],
            tenDangNhap: ['ten_dang_nhap', 'username', 'user_name']
        }
    };

    // ==================== 1. VÔ HIỆU HOÁ COPY / BÔI ĐEN DỮ LIỆU ====================
    function disableCopy() {
        // Chặn phím tắt Ctrl/Cmd + C (copy), + X (cut), + A (bôi đen toàn bộ trang).
        // Không chặn Ctrl+V (paste) vì người dùng vẫn cần dán dữ liệu vào các ô nhập liệu.
        document.addEventListener('keydown', function (e) {
            const key = (e.key || '').toLowerCase();
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            if (isCtrlOrCmd && (key === 'c' || key === 'x' || key === 'a')) {
                e.preventDefault();
            }
        });

        // Chặn thẳng sự kiện copy/cut ở tầng trình duyệt - bắt được cả trường hợp copy
        // qua menu chuột phải (nếu trình duyệt vẫn cho hiện menu) chứ không chỉ phím tắt.
        document.addEventListener('copy', function (e) { e.preventDefault(); });
        document.addEventListener('cut', function (e) { e.preventDefault(); });

        // Chặn menu chuột phải (right-click) toàn trang để không thể chọn "Copy" / "Kiểm tra"
        // (Inspect) từ menu ngữ cảnh. LƯU Ý: điều này cũng chặn luôn các thao tác chuột phải
        // hợp lệ khác (ví dụ mở link ở tab mới) - cân nhắc nếu trang có nhiều link cần thao tác đó.
        document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

        // Chặn hành vi bắt đầu bôi đen bằng chuột (phòng khi trình duyệt không tôn trọng CSS
        // user-select bên dưới). Vẫn CHO PHÉP bôi đen bình thường trong ô input/textarea
        // để không ảnh hưởng đến việc nhập/sửa dữ liệu của nhân viên.
        document.addEventListener('selectstart', function (e) {
            const tag = (e.target && e.target.tagName || '').toLowerCase();
            const isEditable = tag === 'input' || tag === 'textarea' ||
                (e.target && e.target.isContentEditable);
            if (!isEditable) {
                e.preventDefault();
            }
        });

        // CSS vô hiệu hoá bôi đen bằng chuột trên toàn trang, trừ các ô đang nhập liệu.
        const style = document.createElement('style');
        style.textContent = [
            'body, body * {',
            '  -webkit-user-select: none;',
            '  -moz-user-select: none;',
            '  -ms-user-select: none;',
            '  user-select: none;',
            '}',
            'input, textarea, [contenteditable="true"] {',
            '  -webkit-user-select: text;',
            '  -moz-user-select: text;',
            '  -ms-user-select: text;',
            '  user-select: text;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // ==================== 2. PHÁT HIỆN TỔ HỢP PHÍM CHỤP MÀN HÌNH -> LÀM MỜ TOÀN TRANG ====================
    let blurTimer = null;

    // Chèn CSS cho hiệu ứng mờ + banner cảnh báo (chỉ chèn 1 lần khi khởi tạo)
    function injectBlurStyle() {
        const style = document.createElement('style');
        style.textContent = [
            // Làm mờ + tối toàn bộ nội dung trang khi có class crm-security-blur trên <html>
            'html.crm-security-blur body {',
            '  filter: blur(22px) brightness(0.6);',
            '  transition: filter 0.12s ease-out;',
            '}',
            // Banner nhỏ cảnh báo hiển thị phía trên cùng, không bị mờ theo
            '#crm-security-toast {',
            '  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);',
            '  background: #b91c1c; color: #fff; padding: 10px 18px; border-radius: 8px;',
            '  font-size: 13px; font-weight: 600; z-index: 999999;',
            '  box-shadow: 0 4px 14px rgba(0,0,0,.35); pointer-events: none;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // Hiện banner cảnh báo tạm thời cho người dùng biết vì sao màn hình bị mờ
    function showWarningToast() {
        let toast = document.getElementById('crm-security-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'crm-security-toast';
            toast.textContent = 'Đã phát hiện thao tác nghi chụp màn hình - nội dung tạm thời được làm mờ.';
            document.body.appendChild(toast);
        }
        toast.style.display = 'block';
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(function () {
            toast.style.display = 'none';
        }, CONFIG.blurDuration);
    }

    // Làm mờ toàn trang ngay lập tức, tự động bỏ mờ sau CONFIG.blurDuration mili-giây
    function triggerBlur() {
        document.documentElement.classList.add('crm-security-blur');
        showWarningToast();
        if (blurTimer) clearTimeout(blurTimer);
        blurTimer = setTimeout(function () {
            document.documentElement.classList.remove('crm-security-blur');
            blurTimer = null;
        }, CONFIG.blurDuration);
    }

    // Kiểm tra 1 sự kiện bàn phím có khớp với các tổ hợp "nghi chụp màn hình" không
    function isScreenshotCombo(e) {
        // Phím PrintScreen: tuỳ trình duyệt/hệ điều hành có thể chỉ bắt được ở keyup
        // (không phải keydown) nên hàm này được gọi cho cả 2 loại sự kiện, xem initScreenshotGuard().
        if (e.key === 'PrintScreen') return true;
        // Windows + Shift  (tổ hợp mở Snipping Tool trên Windows 10/11)
        if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey) return true;
        // Ctrl + Shift + Alt
        if (e.ctrlKey && e.shiftKey && e.altKey) return true;
        // Ctrl + Alt (không kèm Shift - tránh trùng lặp với tổ hợp Ctrl+Shift+Alt ở trên)
        if (e.ctrlKey && e.altKey && !e.shiftKey) return true;
        // Ctrl + Shift (không kèm Alt - tránh trùng lặp với tổ hợp Ctrl+Shift+Alt ở trên)
        if (e.ctrlKey && e.shiftKey && !e.altKey) return true;
        return false;
    }

    function initScreenshotGuard() {
        injectBlurStyle();
        ['keydown', 'keyup'].forEach(function (eventName) {
            document.addEventListener(eventName, function (e) {
                if (isScreenshotCombo(e)) {
                    triggerBlur();
                }
            });
        });
    }

    // ==================== 3. WATERMARK HỌ TÊN + TÊN ĐĂNG NHẬP ====================
    // Vẽ 1 "viên gạch" (tile) chứa chữ watermark lên canvas, nghiêng theo CONFIG.watermark.angle,
    // rồi dùng làm background-image lặp lại (repeat) để phủ kín vùng với độ mờ rất nhẹ.
    // isLight quyết định dùng màu nào (xem CONFIG.watermark.colorLight / colorDark).
    function buildWatermarkTile(text, isLight) {
        const w = CONFIG.watermark.tileWidth;
        const h = CONFIG.watermark.tileHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.translate(w / 2, h / 2);
        ctx.rotate((CONFIG.watermark.angle * Math.PI) / 180);
        ctx.font = CONFIG.watermark.fontSize + 'px Arial, sans-serif';
        ctx.fillStyle = isLight ? CONFIG.watermark.colorLight : CONFIG.watermark.colorDark;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0);

        return canvas.toDataURL('image/png');
    }

    // Thử đọc giá trị từ localStorage theo danh sách tên key khả dĩ (candidateKeys),
    // trả về giá trị đầu tiên tìm thấy, hoặc chuỗi rỗng nếu không có key nào tồn tại.
    function getStoredValue(candidateKeys) {
        for (let i = 0; i < candidateKeys.length; i++) {
            const v = localStorage.getItem(candidateKeys[i]);
            if (v) return v;
        }
        return '';
    }

    // Đọc theme hiện tại - ưu tiên key 'crm_theme' vì đó là key nút Dark/Light trong header.js
    // đang ghi vào; fallback 'theme' (key sidebar.js/footer.js dùng) để tương thích ngược.
    function getIsLightTheme() {
        const savedTheme = localStorage.getItem('crm_theme') || localStorage.getItem('theme') || 'dark';
        return savedTheme === 'light';
    }

    // Lưu lại họ tên/tên đăng nhập lần gần nhất để khi theme đổi (xem themeObserver bên dưới)
    // có thể vẽ lại watermark đúng nội dung mà không cần đọc lại localStorage/gọi API lần nữa.
    let lastWatermarkUser = { hoVaTen: '', tenDangNhap: '' };

    // Dựng (hoặc cập nhật) lớp watermark với nội dung "Họ tên • Tên đăng nhập • Ngày".
    // Ưu tiên gắn BÊN TRONG khung theo CONFIG.watermark.targetSelector (ví dụ khung Hồ Sơ
    // Khách Hàng) bằng position:absolute; nếu không tìm thấy khung đó thì tự fallback về
    // phủ toàn trang bằng position:fixed như trước, để không bao giờ "mất tác dụng" âm thầm.
    function renderWatermark(hoVaTen, tenDangNhap) {
        lastWatermarkUser = { hoVaTen: hoVaTen, tenDangNhap: tenDangNhap };

        const ngay = new Date().toLocaleDateString('vi-VN');
        const text = [hoVaTen, tenDangNhap, ngay].filter(Boolean).join('  •  ') || 'CRM Lead';
        const isLight = getIsLightTheme();

        const targetSelector = CONFIG.watermark.targetSelector;
        const targetEl = targetSelector ? document.querySelector(targetSelector) : null;

        let layer = document.getElementById('crm-security-watermark');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'crm-security-watermark';
            layer.style.pointerEvents = 'none'; // không chặn thao tác chuột/chạm của người dùng bên dưới
        }

        if (targetEl) {
            // Watermark chỉ phủ đúng bên trong khung này. Khung cần position:relative để
            // absolute bên trong nó tính toạ độ theo đúng khung, không theo toàn trang -
            // leads.html đã thêm sẵn class "relative overflow-hidden" cho khung này.
            layer.style.cssText = 'pointer-events:none; position:absolute; inset:0; z-index:5;';
            if (layer.parentElement !== targetEl) {
                targetEl.appendChild(layer);
            }
        } else {
            // Không tìm thấy khung mục tiêu -> fallback: watermark toàn trang (hành vi cũ)
            layer.style.cssText = [
                'pointer-events:none', 'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
                'z-index:999998' // nằm dưới banner cảnh báo (999999) nhưng trên mọi nội dung khác của trang
            ].join(';');
            if (layer.parentElement !== document.body) {
                document.body.appendChild(layer);
            }
        }

        layer.style.backgroundImage = 'url(' + buildWatermarkTile(text, isLight) + ')';
        layer.style.backgroundRepeat = 'repeat';
    }

    // Theo dõi thay đổi theme (cùng cơ chế footer.js/sidebar.js đang dùng: quan sát class
    // của <body>) để vẽ lại watermark đúng màu ngay lập tức khi người dùng bấm đổi theme,
    // không cần load lại trang.
    function initWatermarkThemeSync() {
        const themeObserver = new MutationObserver(function () {
            renderWatermark(lastWatermarkUser.hoVaTen, lastWatermarkUser.tenDangNhap);
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    function initWatermark() {
        const hoVaTen = getStoredValue(CONFIG.localStorageKeys.hoVaTen);
        const tenDangNhap = getStoredValue(CONFIG.localStorageKeys.tenDangNhap);
        renderWatermark(hoVaTen, tenDangNhap);
    }

    // Cho phép các trang khác chủ động gọi hàm này SAU KHI lấy được thông tin user thật
    // (ví dụ sau khi query bảng "users" từ Supabase), phòng trường hợp tên key trong
    // localStorage ở CONFIG.localStorageKeys phía trên không khớp với hệ thống thực tế:
    //   CRMSecurity.setWatermarkUser('Nguyễn Văn A', 'agent01');
    window.CRMSecurity = window.CRMSecurity || {};
    window.CRMSecurity.setWatermarkUser = function (hoVaTen, tenDangNhap) {
        renderWatermark(hoVaTen, tenDangNhap);
    };

    // ==================== KHỞI TẠO ====================
    document.addEventListener('DOMContentLoaded', function () {
        disableCopy();
        initScreenshotGuard();
        initWatermark();
        initWatermarkThemeSync();
    });
})();