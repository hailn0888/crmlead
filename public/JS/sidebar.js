// public/js/sidebar.js
document.addEventListener("DOMContentLoaded", () => {
    const phanQuyen = localStorage.getItem('phan_quyen') || 'agent';
    const savedTheme = localStorage.getItem('theme') || 'dark';

    const menusByRole = {
        admin: [
            { name: "Tổng quan", icon: "layout-dashboard", href: "/admin/dashboard_admin.html" },
            { name: "Báo cáo doanh số nhóm", icon: "users", href: "/admin/rpsale_team.html" },
            { name: "Báo cáo doanh số cá nhân", icon: "user", href: "/admin/rpsale_personal.html" },
            { name: "Báo cáo Lead nhóm", icon: "users", href: "/admin/rplead_team.html" },
            { name: "Báo cáo Lead cá nhân", icon: "user", href: "/admin/rplead_personal.html" },
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
            { name: "My Dashboard", icon: "layout-dashboard", href: "/agent/dashboard.html" },
            { name: "Data Lead", icon: "user-check", href: "/agent/dataleads.html" },
            { name: "Lịch sử cuộc gọi", icon: "phone-call", href: "/agent/calls.html" },
            { name: "Hợp đồng bảo hiểm", icon: "shield-check", href: "/agent/contracts.html" }
        ]
    };

    const currentMenu = menusByRole[phanQuyen] || menusByRole['agent'];
    const isExpanded = localStorage.getItem('sidebar_expanded') === 'true';
    const sidebarWidth = isExpanded ? 'w-64' : 'w-12';

    // Thiết lập màu sắc theo theme hiện tại
    const isLight = savedTheme === 'light';
    const bgClass = isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#141414] border-[#222] text-[#999]';
    const hoverClass = isLight ? 'hover:bg-slate-200 hover:text-slate-900' : 'hover:bg-[#202020] hover:text-white';
    const borderBottomClass = isLight ? 'border-slate-200' : 'border-[#222]';

    const sidebarHTML = `
    <aside id="appSidebar" class="fixed left-0 top-14 bottom-0 transition-all duration-300 z-40 flex flex-col select-none border-r ${bgClass} ${sidebarWidth}">
        <!-- Danh sách menu -->
        <div class="flex-1 py-3 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
            ${currentMenu.map(item => `
                <a href="${item.href}" class="flex items-center space-x-1.5 px-1.5 py-2.5 rounded-lg transition group relative ${hoverClass}" title="${item.name}">
                    <i data-lucide="${item.icon}" class="w-4 h-4 min-w-[20px] ${isLight ? 'text-slate-500 group-hover:text-slate-900' : 'text-[#888] group-hover:text-white'}"></i>
                    <span class="sidebar-text text-xs font-medium whitespace-nowrap transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}">${item.name}</span>
                </a>
            `).join('')}
        </div>

        <!-- Nút thu gọn / mở rộng Sidebar ở đáy -->
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

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('appSidebar');

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

    function updateMainContainerMargin(expand) {
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.style.marginLeft = expand ? '16rem' : '4rem';
            mainContainer.style.transition = 'margin-left 300ms ease';
        }
    }

    // Lắng nghe sự kiện chuyển đổi theme từ file theme.js để sidebar tự đổi màu theo
    const observer = new MutationObserver(() => {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'light') {
            sidebar.className = sidebar.className.replace('bg-[#141414] border-[#222] text-[#999]', 'bg-slate-50 border-slate-200 text-slate-800');
        } else {
            sidebar.className = sidebar.className.replace('bg-slate-50 border-slate-200 text-slate-800', 'bg-[#141414] border-[#222] text-[#999]');
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});