// ==========================================
// TÊN FILE: public/js/sidebar.js
// CHỨC NĂNG: Khởi tạo, quản lý hiển thị menu bên trái (Sidebar) theo đúng phân quyền (admin, leader, agent) 
// và đồng bộ màu sắc theo theme, xử lý thu gọn/mở rộng menu.
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Lấy thông tin phân quyền và theme hiện tại từ localStorage (chuẩn hóa về chữ thường, mặc định là agent nếu thiếu)
    const phanQuyen = (localStorage.getItem('phan_quyen') || 'agent').trim().toLowerCase();
    // Dùng đúng key 'crm_theme' - key chung mà theme.js/header.js đang dùng để lưu theme
    // (trước đây sidebar.js đọc nhầm key 'theme' không tồn tại ở đâu khác, nên sidebar luôn ra màu tối
    // mặc định bất kể phần còn lại của trang đang sáng hay tối).
    const savedTheme = localStorage.getItem('crm_theme') || 'light';

    // 2. Định nghĩa cấu trúc danh sách menu theo từng vai trò (phan_quyen)
    const menusByRole = {
        admin: [
            { name: "Tổng quan", icon: "layout-dashboard", href: "/admin/dashboard_admin.html" },
            { name: "Báo cáo doanh số nhóm", icon: "users", href: "/admin/rpsale_team.html" },
            { name: "Báo cáo doanh số cá nhân", icon: "user", href: "/admin/rpsale_personal.html" },
            { name: "Báo cáo Lead nhóm", icon: "network", href: "/admin/rplead_team.html" },
            { name: "Báo cáo Lead cá nhân", icon: "headset", href: "/admin/rplead_personal.html" },
            { name: "Quản lý user", icon: "user-cog", href: "/admin/users.html" },
            { name: "Quản lý data", icon: "database", href: "/admin/quanlydata.html" },
            { name: "Quản lý dữ liệu hợp đồng", icon: "shield-check", href: "/admin/hop_dong.html" },
            { name: "Công cụ tính FYC", icon: "calculator", href: "/admin/cal_fyc.html" }
        ],
        leader: [
            { name: "Team Overview", icon: "layout-dashboard", href: "/leader/dashboard.html" },
            { name: "Danh sách Agent", icon: "users", href: "/leader/agents.html" },
            { name: "Phân bổ Lead nhóm", icon: "share-2", href: "/leader/leads.html" },
            { name: "Báo cáo doanh số", icon: "bar-chart-3", href: "/leader/reports.html" }
        ],
        agent: [
            { name: "Tổng quan", icon: "layout-dashboard", href: "/agents/dashboard_agents.html" },
            { name: "Thiết lập mục tiêu cá nhân", icon: "goal", href: "/agents/goals.html" },
            { name: "Data Lead", icon: "user-check", href: "/agents/leads.html" },
            { name: "Quản lý cuộc gọi/hẹn", icon: "phone-call", href: "/agents/calls.html" },
            { name: "Doanh số cá nhân", icon: "shield-check", href: "/agents/sales.html" },
            { name: "Công cụ tính FYC", icon: "calculator", href: "/agents/fyc.html" },
            { name: "Thi đua - Memo", icon: "goal", href: "/agents/memos.html" },
            { name: "Sản phẩm Prudential", icon: "package-search", href: "/agents/products.html" }
        ]   
    };

    // Chọn bộ menu phù hợp với phân quyền thực tế của user đăng nhập
    let currentMenu = menusByRole[phanQuyen] || menusByRole['agent'];

    // 1.1. Hàm gọi API kiểm tra trạng thái tài khoản (mọi vai trò) + quyền Data Lead (riêng agent).
    // Dùng chung cho lần load trang đầu tiên VÀ vòng lặp kiểm tra định kỳ bên dưới.
    async function kiemTraTaiKhoan() {
        const tenDangNhap = localStorage.getItem('ten_dang_nhap');
        if (!tenDangNhap) return null;
        try {
            const res = await fetch(`/api/auth/account-status/${encodeURIComponent(tenDangNhap)}`);
            const result = await res.json();
            return (result && result.success) ? result : null;
        } catch (err) {
            console.error('Không thể kiểm tra trạng thái tài khoản:', err);
            return null; // Lỗi mạng tạm thời -> fail-open, không ép đăng xuất oan
        }
    }

    // Buộc đăng xuất ngay lập tức: xoá cookie phiên (server) + localStorage, đưa về trang login.
    // Gọi khi phát hiện tài khoản đã bị admin khoá, dù đang ở bất kỳ trang nào.
    async function buocDangXuat(message) {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error('Lỗi khi xoá cookie phiên:', err);
        }
        localStorage.clear();
        alert(message || 'Tài khoản của bạn đã bị khoá. Vui lòng liên hệ admin.');
        window.location.href = '/login.html';
    }

    // 1.2. Kiểm tra ngay khi vừa load trang: nếu tài khoản đã bị khoá -> đăng xuất luôn,
    // không cần đợi user tự F5 hay bấm đăng xuất mới nhận ra.
    const trangThaiKq = await kiemTraTaiKhoan();
    if (trangThaiKq && trangThaiKq.trang_thai === 'Tạm khoá') {
        buocDangXuat('Tài khoản của bạn đã bị khoá. Vui lòng liên hệ admin.');
        return; // Dừng luôn, không build sidebar cho tài khoản đã bị khoá
    }

    // 1.3. Với agent: cùng 1 quyền "xem_data_leads" sẽ kiểm soát CẢ 2 trang - "Data Lead" và
    // "Quản lý cuộc gọi/hẹn" (calls.html) - vì cuộc gọi/hẹn thực chất là hành động thao tác trên data lead,
    // nên gộp chung theo yêu cầu, không tách thành cột quyền riêng.
    const CAC_TRANG_CAN_QUYEN_LEADS = ['/agents/leads.html', '/agents/calls.html'];
    if (phanQuyen === 'agent') {
        const coQuyenXemLeads = !!(trangThaiKq && trangThaiKq.xem_data_leads);
        if (!coQuyenXemLeads) {
            currentMenu = currentMenu.filter(item => !CAC_TRANG_CAN_QUYEN_LEADS.includes(item.href));
        }
    }

    // 1.4. Kiểm tra ĐỊNH KỲ mỗi 20 giây trong lúc đang mở trang: nếu admin vừa khoá tài khoản
    // trong lúc user đang ngồi im không chuyển trang, vẫn bị đăng xuất ngay mà không cần F5.
    setInterval(async () => {
        const kq = await kiemTraTaiKhoan();
        if (kq && kq.trang_thai === 'Tạm khoá') {
            buocDangXuat('Tài khoản của bạn vừa bị quản trị viên khoá.');
        }
    }, 20000);
    // Đổi lại logic: Nếu trong localStorage chưa có giá trị (null) thì mặc định là 'true' (mở rộng). 
    // Nếu người dùng đã từng bấm thu gọn thì mới nhận giá trị 'false'.
    const isMobileScreen = window.innerWidth < 768;
    const savedSidebarState = localStorage.getItem('sidebar_expanded');
    // Trên điện thoại, nếu người dùng chưa từng bấm chọn trạng thái, mặc định THU GỌN
    // để dành tối đa không gian cho nội dung chính (bảng, form...) thay vì bị sidebar che mất.
    const isExpanded = savedSidebarState === null ? !isMobileScreen : savedSidebarState === 'true';
    const sidebarWidth = isExpanded ? 'w-64' : 'w-12';

    // Thiết lập màu sắc giao diện theo theme (light/dark)
    const isLight = savedTheme === 'light';
    const bgClass = isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#141414] border-[#222] text-[#999]';
    const hoverClass = isLight ? 'hover:bg-slate-200 hover:text-slate-900' : 'hover:bg-[#202020] hover:text-white';
    const borderBottomClass = isLight ? 'border-slate-200' : 'border-[#222]';

    // 3. Hàm chức năng: Tạo mã HTML Sidebar và chèn trực tiếp vào DOM
    const sidebarHTML = `
    <aside id="appSidebar" class="fixed left-0 top-14 bottom-0 transition-all duration-300 z-40 flex flex-col select-none border-r ${bgClass} ${sidebarWidth}">
        <!-- Danh sách mục menu động theo phân quyền -->
        <div class="flex-1 py-3 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
            ${currentMenu.map(item => `
                <a href="${item.href}" class="flex items-center space-x-1.5 px-1.5 py-2.5 rounded-lg transition group relative ${hoverClass}" title="${item.name}">
                    <i data-lucide="${item.icon}" class="w-4 h-4 min-w-[20px] ${isLight ? 'text-slate-500 group-hover:text-slate-900' : 'text-[#888] group-hover:text-white'}"></i>
                    <span class="sidebar-text text-xs font-medium whitespace-nowrap transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}">${item.name}</span>
                </a>
            `).join('')}
        </div>

        <!-- Nút thu gọn / mở rộng Sidebar ở chân khung -->
        <div class="p-2 border-t ${borderBottomClass}">
            <button id="toggleSidebarBtn" class="w-full flex items-center space-x-1.5 px-1.5 py-2 rounded-lg transition ${hoverClass}">
                <i data-lucide="${isExpanded ? 'panel-left-close' : 'panel-left-open'}" class="w-5 h-5 min-w-[20px]"></i>
                <span class="sidebar-text text-xs font-medium whitespace-nowrap transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}">Thu gọn menu</span>
            </button>
        </div>
    </aside>
    `;

    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    updateMainContainerMargin(isExpanded);

    // Khởi tạo icon Lucide sau khi render HTML
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('appSidebar');

    // 4. Hàm chức năng: Xử lý sự kiện bấm nút thu gọn/mở rộng sidebar
    toggleBtn.addEventListener('click', () => {
        const currentlyExpanded = sidebar.classList.contains('w-64');
        
        if (currentlyExpanded) {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-12');
            localStorage.setItem('sidebar_expanded', 'false');
            toggleIconAndText(sidebar, false);
            updateMainContainerMargin(false);
        } else {
            sidebar.classList.remove('w-12');
            sidebar.classList.add('w-64');
            localStorage.setItem('sidebar_expanded', 'true');
            toggleIconAndText(sidebar, true);
            updateMainContainerMargin(true);
        }
    });

    // 5. Hàm chức năng: Ẩn/hiện chữ và đổi icon thu gọn mở rộng
    function toggleIconAndText(sidebarEl, expand) {
        const texts = sidebarEl.querySelectorAll('.sidebar-text');
        const iconToggle = sidebarEl.querySelector('#toggleSidebarBtn i');
        
        texts.forEach(el => {
            if (expand) {
                el.classList.remove('hidden');
                setTimeout(() => el.classList.remove('opacity-0'), 10);
            } else {
                el.classList.add('opacity-0');
                setTimeout(() => el.classList.add('hidden'), 200);
            }
        });

        if (iconToggle) {
            iconToggle.setAttribute('data-lucide', expand ? 'panel-left-close' : 'panel-left-open');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // 6. Hàm chức năng: Điều chỉnh lề trái của khung nội dung chính theo độ rộng Sidebar
    // Trên mobile (< 768px): KHÔNG ép margin-left cố định (16rem/4rem) vì màn hình quá hẹp,
    // sẽ làm nội dung (bảng, form) bị bóp méo/tràn ngang không kiểm soát được.
    // Sidebar lúc này hoạt động như 1 lớp phủ (overlay) đè lên nội dung khi mở, thay vì đẩy nội dung sang.
    function updateMainContainerMargin(expand) {
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            const isMobile = window.innerWidth < 768;
            mainContainer.style.marginLeft = isMobile ? '0' : (expand ? '16rem' : '4rem');
            mainContainer.style.transition = 'margin-left 300ms ease';
        }
    }

    // Khi xoay ngang/dọc màn hình điện thoại hoặc thay đổi kích thước cửa sổ,
    // tính lại margin cho đúng (tránh trường hợp bị kẹt margin cũ sai khi resize qua lại breakpoint 768px)
    window.addEventListener('resize', () => {
        const nowExpanded = document.getElementById('appSidebar')?.classList.contains('w-64');
        updateMainContainerMargin(!!nowExpanded);
    });

    // 7. Hàm chức năng: Lắng nghe sự kiện thay đổi Theme động từ tệp theme.js
    // theme.js gắn/gỡ class "dark" trên <html> (document.documentElement), không phải <body>,
    // nên phải observe đúng documentElement thì mới bắt được sự kiện đổi theme tức thời (không cần reload trang).
    const observer = new MutationObserver(() => {
        const currentTheme = localStorage.getItem('crm_theme');
        if (currentTheme === 'light') {
            sidebar.className = sidebar.className.replace('bg-[#141414] border-[#222] text-[#999]', 'bg-slate-50 border-slate-200 text-slate-800');
        } else {
            sidebar.className = sidebar.className.replace('bg-slate-50 border-slate-200 text-slate-800', 'bg-[#141414] border-[#222] text-[#999]');
        }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});