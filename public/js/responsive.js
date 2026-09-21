/**
 * ====================================================================================
 * public/js/responsive.js  -  Bộ điều khiển giao diện mobile / tablet dùng chung
 * ------------------------------------------------------------------------------------
 * Đi cùng /css/mobile.css (<768px) và /css/tablet.css (768-1024px).
 * KHÔNG đụng vào màu/font: mọi màu vẫn do theme.js quyết định (biến CSS --bg-card,
 * --sidebar-hover, --border-color...). File này chỉ lo phần hành vi:
 *   1. Nút hamburger (☰) trên header + lớp phủ mờ để mở/đóng sidebar dạng ngăn kéo (mobile).
 *   2. Tablet: sidebar là thanh icon hẹp, khi mở rộng sẽ đè lên nội dung (có lớp phủ) thay vì đẩy nội dung.
 *   3. Tô sáng mục menu của trang đang mở.
 *   4. Tự gắn nhãn cột (data-label) cho các bảng có class "rt-cards" để mobile hiển thị dạng thẻ.
 *   5. Đồng bộ meta theme-color với màu header của theme.js (thanh trình duyệt điện thoại cùng màu).
 *   6. Ép Tailwind dùng dark mode theo class .dark (do theme.js gắn), không theo cài đặt tối của điện thoại.
 * Nạp ngay SAU thẻ <script src="https://cdn.tailwindcss.com"> trong <head>.
 * ====================================================================================
 */
(function () {
    'use strict';

    var root = document.documentElement;

    // ------------------------------------------------------------------
    // 6. Tailwind dark mode theo class (khớp theme.js), không theo OS.
    //    Không có bước này, điện thoại bật chế độ tối hệ điều hành sẽ làm các lớp
    //    "dark:..." bật sai khi app đang ở theme Sáng (và ngược lại).
    // ------------------------------------------------------------------
    function fixTailwindDarkMode() {
        try {
            if (window.tailwind) {
                var cfg = window.tailwind.config || {};
                if (cfg.darkMode !== 'class') {
                    window.tailwind.config = Object.assign({}, cfg, { darkMode: 'class' });
                }
            }
        } catch (e) { /* bỏ qua */ }
    }
    fixTailwindDarkMode();

    var mqMobile = window.matchMedia('(max-width: 767.98px)');
    var mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1024px)');

    // Chờ 1 phần tử xuất hiện trong DOM (header.js / sidebar.js chèn giao diện bất đồng bộ)
    function whenPresent(selector, callback) {
        var el = document.querySelector(selector);
        if (el) { callback(el); return; }
        var mo = new MutationObserver(function () {
            var found = document.querySelector(selector);
            if (found) { mo.disconnect(); callback(found); }
        });
        mo.observe(root, { childList: true, subtree: true });
    }

    // ------------------------------------------------------------------
    // 1 + 2. Hamburger, lớp phủ, mở/đóng sidebar
    // ------------------------------------------------------------------
    var toggleBtn = null;
    var overlay = null;

    function setNavOpen(open) {
        root.classList.toggle('crm-nav-open', !!open);
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function buildToggleButton(header) {
        if (document.getElementById('crmNavToggle')) return;
        var left = header.firstElementChild;
        if (!left) return;

        toggleBtn = document.createElement('button');
        toggleBtn.id = 'crmNavToggle';
        toggleBtn.type = 'button';
        toggleBtn.setAttribute('aria-label', 'Mở menu');
        toggleBtn.setAttribute('aria-controls', 'appSidebar');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.style.display = 'none'; // mobile.css sẽ bật lại (desktop/tablet giữ ẩn)
        toggleBtn.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line>' +
            '<line x1="4" y1="17" x2="20" y2="17"></line></svg>';
        toggleBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setNavOpen(!root.classList.contains('crm-nav-open'));
        });
        left.insertBefore(toggleBtn, left.firstChild);
    }

    function buildOverlay() {
        if (document.getElementById('crmNavOverlay')) return;
        overlay = document.createElement('div');
        overlay.id = 'crmNavOverlay';
        overlay.style.display = 'none'; // mobile.css / tablet.css bật lại
        overlay.addEventListener('click', function () {
            if (mqMobile.matches) {
                setNavOpen(false);
            } else if (mqTablet.matches) {
                // Tablet: thu gọn lại thanh icon bằng chính nút của sidebar.js
                var btn = document.getElementById('toggleSidebarBtn');
                if (btn && root.classList.contains('crm-sb-expanded')) btn.click();
            }
        });
        document.body.appendChild(overlay);
    }

    // ------------------------------------------------------------------
    // 3. Sidebar: tô sáng trang hiện tại, đóng ngăn kéo khi bấm link, theo dõi trạng thái mở rộng
    // ------------------------------------------------------------------
    function enhanceSidebar(sidebar) {
        var here = location.pathname.replace(/\/+$/, '');
        sidebar.querySelectorAll('a[href]').forEach(function (a) {
            var target = a.pathname.replace(/\/+$/, '');
            if (target && target === here) {
                a.classList.add('crm-nav-active');
                a.setAttribute('aria-current', 'page');
            }
            a.addEventListener('click', function () { setNavOpen(false); });
        });

        function syncExpanded() {
            root.classList.toggle('crm-sb-expanded', sidebar.classList.contains('w-64'));
        }
        syncExpanded();
        new MutationObserver(syncExpanded).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    // ------------------------------------------------------------------
    // 4. Bảng dạng thẻ trên mobile: gắn data-label theo tiêu đề cột
    // ------------------------------------------------------------------
    var RE_STT = /^(stt|#)$/i;
    var RE_ACTION = /thao\s*tác/i;
    var RE_WIDE = /địa\s*chỉ|ghi\s*chú|sản\s*phẩm|bên\s*mua|báo\s*cáo|nội\s*dung|insights/i;

    function labelTable(table) {
        var headers = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
            return th.textContent.replace(/\s+/g, ' ').trim();
        });
        if (!headers.length) return;

        var titleIndex = RE_STT.test(headers[0]) ? 1 : 0;

        table.querySelectorAll('tbody tr').forEach(function (tr) {
            var cells = tr.children;
            if (cells.length === 1 && cells[0].hasAttribute('colspan')) return; // dòng "Không có dữ liệu"
            for (var i = 0; i < cells.length; i++) {
                var td = cells[i];
                var label = headers[i] || '';
                var role = '';
                if (RE_STT.test(label)) role = 'hide';
                else if (i === titleIndex) role = 'title';
                else if (RE_ACTION.test(label)) role = 'actions';
                else if (RE_WIDE.test(label)) role = 'wide';
                td.setAttribute('data-label', label);
                if (role) td.setAttribute('data-rt', role); else td.removeAttribute('data-rt');
            }
        });
    }

    function initCardTables() {
        document.querySelectorAll('table.rt-cards').forEach(function (table) {
            labelTable(table);
            var pending = false;
            new MutationObserver(function () {
                if (pending) return;
                pending = true;
                requestAnimationFrame(function () { pending = false; labelTable(table); });
            }).observe(table, { childList: true, subtree: true });
        });
    }

    // ------------------------------------------------------------------
    // 5. meta theme-color theo header của theme.js
    // ------------------------------------------------------------------
    function syncThemeColor() {
        var color = getComputedStyle(root).getPropertyValue('--header-bg').trim();
        if (!color) return;
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = color;
    }

    // ------------------------------------------------------------------
    // Khởi tạo
    // ------------------------------------------------------------------
    function init() {
        fixTailwindDarkMode();
        buildOverlay();
        whenPresent('#appHeader', buildToggleButton);
        whenPresent('#appSidebar', enhanceSidebar);
        initCardTables();
        syncThemeColor();
        new MutationObserver(syncThemeColor).observe(root, { attributes: true, attributeFilter: ['class', 'style'] });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setNavOpen(false);
        });

        // Xoay màn hình / đổi kích thước qua mốc 768px: đóng ngăn kéo để không kẹt trạng thái
        var onChange = function () { setNavOpen(false); };
        if (mqMobile.addEventListener) mqMobile.addEventListener('change', onChange);
        else if (mqMobile.addListener) mqMobile.addListener(onChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
