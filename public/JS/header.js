// public/js/header.js
document.addEventListener("DOMContentLoaded", () => {
    const hoVaTen = localStorage.getItem('ho_va_ten') || 'Quản trị viên hệ thống';
    const phanQuyen = localStorage.getItem('phan_quyen') || 'admin';
    const userEmail = localStorage.getItem('userEmail') || 'admin@crm.com';

    const savedTheme = localStorage.getItem('crm_theme') || 'light';

    const headerHTML = `
    <header id="appHeader" class="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 select-none transition-colors duration-200">
        <div class="flex items-center space-x-4">
            <a href="#" class="flex items-center space-x-2">
                <img src="/uploads/logo_crm.png" alt="Logo" class="w-12 h-12 object-contain rounded">
            </a>
            <span id="dividerText" class="opacity-60">/</span>
            <div class="flex items-center space-x-2">
                <span id="headerName" class="font-medium text-xs">${hoVaTen}</span>
                <span id="headerRole" class="font-mono text-[10px] px-2 py-0.5 rounded border">${phanQuyen}</span>
            </div>
        </div>

        <div class="flex items-center space-x-2">
            <!-- Nút gọi AI Assistant chuẩn phong cách Supabase -->
            <button id="aiAssistantBtn" class="flex items-center space-x-1.5 py-1.5 px-2.5 rounded-lg opacity-80 hover:opacity-100 transition relative border border-inherit text-xs font-medium" title="Ask AI">
                <i data-lucide="bot" class="w-4 h-4 ${savedTheme === 'light' ? 'text-white' : 'text-emerald-500'}"></i>
                <span>AI Assistant</span>
                <span class="font-mono text-[9px] opacity-60 ml-1 px-1 py-0.2 border rounded">Ctrl I</span>
            </button>

            <div class="relative">
                <button id="userMenuBtn" class="flex items-center space-x-2 focus:outline-none p-1.5 rounded-full transition border border-transparent">
                    <div id="userAvatar" class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">
                        ${hoVaTen.charAt(0).toUpperCase()}
                    </div>
                </button>

                <!-- Khung Quản trị viên hệ thống -->
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

    <!-- Khung trượt AI Assistant Drawer (Phong cách Supabase) -->
    <div id="aiDrawerOverlay" class="fixed inset-0 bg-black/40 z-50 hidden transition-opacity opacity-0"></div>
    <aside id="aiDrawer" class="fixed top-0 right-0 bottom-0 w-96 theme-dropdown border-l shadow-2xl z-50 transform translate-x-full transition-transform duration-300 ease-in-out flex flex-col">
        <!-- Header Drawer -->
        <div class="h-14 px-4 flex items-center justify-between border-b border-inherit">
            <div class="flex items-center space-x-2">
                <i data-lucide="bot" class="w-5 h-5 text-emerald-500"></i>
                <span class="font-semibold text-sm">AI Assistant</span>
            </div>
            <button id="closeAiDrawer" class="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>

        <!-- Body Nội dung Chat / Gợi ý -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div class="p-3 rounded-xl border border-inherit opacity-90 bg-black/5 dark:bg-white/5">
                <p class="font-medium mb-1 flex items-center gap-1.5 text-emerald-500">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Trợ lý thông minh CRM
                </p>
                <p class="opacity-75 leading-relaxed">Hệ thống đã sẵn sàng hỗ trợ bạn phân tích dòng tiền, tra cứu dữ liệu Lead hoặc viết kịch bản chăm sóc khách hàng.</p>
            </div>

            <div>
                <p class="font-semibold opacity-60 uppercase tracking-wider text-[10px] mb-2">Gợi ý nhanh</p>
                <div class="space-y-1.5">
                    <button class="w-full text-left p-2 rounded-lg border border-inherit hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center justify-between">
                        <span>📊 Phân tích hiệu suất Lead tuần này</span>
                        <i data-lucide="arrow-right" class="w-3.5 h-3.5 opacity-50"></i>
                    </button>
                    <button class="w-full text-left p-2 rounded-lg border border-inherit hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center justify-between">
                        <span>💬 Viết kịch bản gọi khách hàng cũ</span>
                        <i data-lucide="arrow-right" class="w-3.5 h-3.5 opacity-50"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Ô nhập tin nhắn ở chân Drawer -->
        <div class="p-3 border-t border-inherit">
            <div class="relative">
                <input type="text" placeholder="Hỏi AI bất cứ điều gì..." class="w-full bg-transparent border border-inherit rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-500 pr-10">
                <button class="absolute right-2 top-2 p-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition">
                    <i data-lucide="send" class="w-3.5 h-3.5"></i>
                </button>
            </div>
            <div class="flex items-center justify-between mt-2 px-1 text-[10px] opacity-50 font-mono">
                <span>Model: gpt-4o-mini</span>
                <span>Press Enter ↵</span>
            </div>
        </div>
    </aside>
    `;

    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Xử lý ẩn/hiện User Dropdown
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

    // Xử lý trượt mở/đóng AI Assistant Drawer
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

    // Phím tắt Ctrl + I để mở nhanh AI Assistant
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            openAiDrawer();
        }
    });

    const themeDarkBtn = document.getElementById('themeDark');
    const themeLightBtn = document.getElementById('themeLight');

    function updateHeaderElements(theme) {
        const headerRole = document.getElementById('headerRole');
        const userAvatar = document.getElementById('userAvatar');

        if (theme === 'light') {
            if (headerRole) headerRole.className = "font-mono text-[10px] text-white bg-black/25 px-2 py-0.5 rounded border border-white/20";
            if (userAvatar) userAvatar.className = "w-7 h-7 rounded-full bg-white/20 border border-white/40 text-white flex items-center justify-center font-bold text-xs";
            if (themeLightBtn) themeLightBtn.className = "py-1.5 px-2 rounded text-center transition font-medium text-white bg-[#ed1b24] shadow";
            if (themeDarkBtn) themeDarkBtn.className = "py-1.5 px-2 rounded text-center transition font-medium opacity-60 hover:opacity-100 bg-transparent";
        } else {
            if (headerRole) headerRole.className = "font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20";
            if (userAvatar) userAvatar.className = "w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-xs";
            if (themeDarkBtn) themeDarkBtn.className = "py-1.5 px-2 rounded text-center transition font-medium text-white bg-[#ed1b24] shadow";
            if (themeLightBtn) themeLightBtn.className = "py-1.5 px-2 rounded text-center transition font-medium opacity-60 hover:opacity-100 bg-transparent";
        }
    }

    updateHeaderElements(savedTheme);

    themeDarkBtn.addEventListener('click', () => {
        applyTheme('dark');
        updateHeaderElements('dark');
    });

    themeLightBtn.addEventListener('click', () => {
        applyTheme('light');
        updateHeaderElements('light');
    });

    // Hàm xử lý theme mặc dịnh và lưu theme
    document.getElementById('headerLogout').addEventListener('click', () => {
        const currentTheme = localStorage.getItem('crm_theme'); // Giữ lại theme hiện tại
        localStorage.clear(); // Xóa sạch token đăng nhập
        if (currentTheme) {
            localStorage.setItem('crm_theme', currentTheme); // Ghi phục hồi lại theme
        }
        window.location.href = '/login.html';
    });
});