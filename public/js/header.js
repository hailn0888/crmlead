// ==========================================
// TÊN FILE: public/js/header.js
// CHỨC NĂNG: Khởi tạo thanh tiêu đề đầu trang (Header), hiển thị đúng tên và phân quyền của user đăng nhập, 
// quản lý menu thả xuống cá nhân, giao diện theme và bảng điều khiển trợ lý AI Assistant.
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Lấy thông tin tài khoản và phân quyền thực tế từ localStorage (tránh cố định cứng giá trị)
    const hoVaTen = localStorage.getItem('userName') || localStorage.getItem('ho_va_ten') || 'Người dùng hệ thống';
    const phanQuyen = (localStorage.getItem('userRole') || localStorage.getItem('phan_quyen') || 'agent').trim().toLowerCase();
    const userEmail = localStorage.getItem('userEmail') || 'user@crm.com';

    const savedTheme = localStorage.getItem('crm_theme') || 'light';

    // 2. Hàm chức năng: Tạo mã HTML Header và chèn vào trang
    const headerHTML = `
    <header id="appHeader" class="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 select-none transition-colors duration-200">
        <div class="flex items-center space-x-4">
            <a href="#" class="flex items-center space-x-2">
                <img src="/uploads/logo_crm.png" alt="Logo" class="w-12 h-12 object-contain rounded">
            </a>
            <span id="dividerText" class="opacity-60">/</span>
            <div class="flex items-center space-x-2">
                <span id="headerName" class="font-medium text-xs">${hoVaTen}</span>
                <span id="headerRole" class="font-mono text-[10px] px-2 py-0.5 rounded border uppercase">${phanQuyen}</span>
            </div>
        </div>

        <div class="flex items-center space-x-2">
            <!-- Nút gọi AI Assistant -->
            <button id="aiAssistantBtn" class="flex items-center space-x-1.5 py-1.5 px-2.5 rounded-lg opacity-80 hover:opacity-100 transition relative border border-inherit text-xs font-medium" title="Ask AI">
                <i data-lucide="bot" class="w-4 h-4 ${savedTheme === 'light' ? 'text-white' : 'text-emerald-500'}"></i>
                <span>AI Assistant</span>
                <span class="font-mono text-[9px] opacity-60 ml-1 px-1 py-0.2 border rounded">Ctrl I</span>
            </button>

            <!-- Menu cá nhân user -->
            <div class="relative">
                <button id="userMenuBtn" class="flex items-center space-x-2 focus:outline-none p-1.5 rounded-full transition border border-transparent">
                    <div id="userAvatar" class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">
                        ${hoVaTen.charAt(0).toUpperCase()}
                    </div>
                </button>

                <!-- Khung thông tin cá nhân và cài đặt thu gọn -->
                <div id="userDropdown" class="hidden absolute right-0 mt-2 w-64 theme-dropdown border rounded-xl shadow-2xl py-1 text-xs z-50">
                    <div class="px-4 py-3 border-b border-inherit">
                        <p class="font-medium truncate">${hoVaTen}</p>
                        <p class="opacity-70 truncate mt-0.5">${userEmail}</p>
                    </div>
                    <div class="px-4 py-2 border-b border-inherit">
                        <p class="text-[10px] uppercase tracking-wider opacity-60 mb-1 font-semibold">Giao diện (Theme)</p>
                        <div class="grid grid-cols-2 gap-1 p-1 rounded-lg border border-inherit">
                            <button id="themeDark" class="py-1.5 px-2 rounded text-center transition font-medium">Dark</button>
                            <button id="themeLight" class="py-1.5 px-2 rounded text-center transition font-medium">Light</button>
                        </div>
                    </div>
                    <div class="py-1">
                        <button id="headerLogout" class="w-full text-left flex items-center px-4 py-2 text-red-500 hover:bg-red-500/10 transition font-medium">Đăng xuất</button>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Khung trượt AI Assistant Drawer -->
    <div id="aiDrawerOverlay" class="fixed inset-0 bg-black/40 z-50 hidden transition-opacity opacity-0"></div>
    <aside id="aiDrawer" class="fixed top-0 right-0 bottom-0 w-96 theme-dropdown border-l shadow-2xl z-50 transform translate-x-full transition-transform duration-300 ease-in-out flex flex-col">
        <div class="h-14 px-4 flex items-center justify-between border-b border-inherit">
            <div class="flex items-center space-x-2">
                <i data-lucide="bot" class="w-5 h-5 text-emerald-500"></i>
                <span class="font-semibold text-sm">AI Assistant</span>
            </div>
            <button id="closeAiDrawer" class="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div class="p-3 rounded-xl border border-inherit opacity-90 bg-black/5 dark:bg-white/5">
                <p class="font-medium mb-1 flex items-center gap-1.5 text-emerald-500">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Trợ lý thông minh CRM
                </p>
                <p class="opacity-75 leading-relaxed">Hệ thống đã sẵn sàng hỗ trợ bạn phân tích dòng tiền, tra cứu dữ liệu Lead hoặc viết kịch bản chăm sóc khách hàng.</p>
            </div>
        </div>
    </aside>
    `;

    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 3. Hàm chức năng: Xử lý ẩn/hiện User Dropdown
    const menuBtn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdown');

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        dropdown.classList.add('hidden');
    });

    dropdown.addEventListener('click', (e) => e.stopPropagation());

    // 4. Hàm chức năng: Điều khiển hiệu ứng mở/đóng bảng AI Assistant Drawer
    const aiBtn = document.getElementById('aiAssistantBtn');
    const aiDrawer = document.getElementById('aiDrawer');
    const aiOverlay = document.getElementById('aiDrawerOverlay');
    const closeAiBtn = document.getElementById('closeAiDrawer');

    function openAiDrawer() {
        aiOverlay.classList.remove('hidden');
        setTimeout(() => aiOverlay.classList.remove('opacity-0'), 10);
        aiDrawer.classList.remove('translate-x-full');
    }

    function closeAiDrawerFunc() {
        aiOverlay.classList.add('opacity-0');
        aiDrawer.classList.add('translate-x-full');
        setTimeout(() => aiOverlay.classList.add('hidden'), 300);
    }
    
    aiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAiDrawer();
    });

    closeAiBtn.addEventListener('click', closeAiDrawerFunc);
    aiOverlay.addEventListener('click', closeAiDrawerFunc);

    // Phím tắt Ctrl + I để kích hoạt nhanh trợ lý AI
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            openAiDrawer();
        }
    });

    const themeDarkBtn = document.getElementById('themeDark');
    const themeLightBtn = document.getElementById('themeLight');

    // 5. Hàm chức năng: Cập nhật style thành phần header theo Theme được chọn
    function updateHeaderElements(theme) {
        const headerRole = document.getElementById('headerRole');
        const userAvatar = document.getElementById('userAvatar');

        if (theme === 'light') {
            if (headerRole) headerRole.className = "font-mono text-[10px] text-white bg-black/25 px-2 py-0.5 rounded border border-white/20 uppercase";
            if (userAvatar) userAvatar.className = "w-7 h-7 rounded-full bg-white/20 border border-white/40 text-white flex items-center justify-center font-bold text-xs";
            if (themeLightBtn) themeLightBtn.className = "py-1.5 px-2 rounded text-center transition font-medium text-white bg-[#ed1b24] shadow";
            if (themeDarkBtn) themeDarkBtn.className = "py-1.5 px-2 rounded text-center transition font-medium opacity-60 hover:opacity-100 bg-transparent";
        } else {
            if (headerRole) headerRole.className = "font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase";
            if (userAvatar) userAvatar.className = "w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-xs";
            if (themeDarkBtn) themeDarkBtn.className = "py-1.5 px-2 rounded text-center transition font-medium text-white bg-[#ed1b24] shadow";
            if (themeLightBtn) themeLightBtn.className = "py-1.5 px-2 rounded text-center transition font-medium opacity-60 hover:opacity-100 bg-transparent";
        }
    }

    updateHeaderElements(savedTheme);

    if (themeDarkBtn) {
        themeDarkBtn.addEventListener('click', () => {
            if (typeof applyTheme === 'function') applyTheme('dark');
            updateHeaderElements('dark');
        });
    }

    if (themeLightBtn) {
        themeLightBtn.addEventListener('click', () => {
            if (typeof applyTheme === 'function') applyTheme('light');
            updateHeaderElements('light');
        });
    }

    // 6. Hàm chức năng: Xử lý đăng xuất tài khoản, giữ lại cài đặt theme hiện tại
    const headerLogout = document.getElementById('headerLogout');
    if (headerLogout) {
        headerLogout.addEventListener('click', () => {
            const currentTheme = localStorage.getItem('crm_theme');
            localStorage.clear();
            if (currentTheme) {
                localStorage.setItem('crm_theme', currentTheme);
            }
            window.location.href = '/login.html';
        });
    }
});