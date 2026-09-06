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
            <!-- Chuông thông báo: hiện số thông báo chưa đọc, đặt cạnh AI Assistant -->
            <div class="relative">
                <button id="notifBtn" class="relative flex items-center justify-center p-2 rounded-lg opacity-80 hover:opacity-100 transition border border-inherit" title="Thông báo">
                    <i data-lucide="bell" class="w-4 h-4 ${savedTheme === 'light' ? 'text-white' : 'text-emerald-500'}"></i>
                    <span id="notifBadge" class="hidden absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">0</span>
                </button>

                <!-- Khung thả xuống danh sách thông báo -->
                <div id="notifDropdown" class="hidden absolute right-0 mt-2 w-80 theme-dropdown border rounded-xl shadow-2xl z-50 max-h-[420px] flex flex-col">
                    <div class="px-4 py-3 border-b border-inherit flex items-center justify-between">
                        <span class="font-semibold text-xs">Thông báo</span>
                        <button id="notifMarkAllRead" class="text-[11px] text-emerald-600 hover:underline font-medium">Đọc tất cả</button>
                    </div>
                    <div id="notifList" class="overflow-y-auto flex-1"></div>
                </div>
            </div>

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
                        ${(phanQuyen === 'agent' || phanQuyen === 'leader') ? `
                        <button id="headerChangePassword" class="w-full text-left flex items-center px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition font-medium">Đổi mật khẩu</button>
                        ` : ''}
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

    // ==========================================================================
    // CHUÔNG THÔNG BÁO
    // ==========================================================================
    const notifBtn = document.getElementById('notifBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    const notifBadge = document.getElementById('notifBadge');
    const notifList = document.getElementById('notifList');
    const notifMarkAllRead = document.getElementById('notifMarkAllRead');

    // Định dạng thời gian tương đối kiểu "5 phút trước", "2 giờ trước"...
    function formatRelativeTime(isoString) {
        if (!isoString) return '';
        const diffMs = Date.now() - new Date(isoString).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Vừa xong';
        if (diffMin < 60) return `${diffMin} phút trước`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour} giờ trước`;
        const diffDay = Math.floor(diffHour / 24);
        return `${diffDay} ngày trước`;
    }

    // Icon riêng cho từng loại thông báo để dễ phân biệt bằng mắt
    function getNotifIcon(loaiThongBao) {
        switch (loaiThongBao) {
            case 'hen_moi': return 'calendar-plus';
            case 'da_tiep_nhan': return 'check-check';
            case 'khong_tiep_nhan': return 'x-circle';
            case 'bao_cao_moi': return 'clipboard-check';
            default: return 'bell';
        }
    }

    function renderNotifications(list) {
        const unreadCount = list.filter(n => !n.da_doc).length;

        if (notifBadge) {
            if (unreadCount > 0) {
                notifBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                notifBadge.classList.remove('hidden');
            } else {
                notifBadge.classList.add('hidden');
            }
        }

        if (!notifList) return;

        if (list.length === 0) {
            notifList.innerHTML = `<div class="p-6 text-center text-xs opacity-60">Không có thông báo nào</div>`;
            return;
        }

        notifList.innerHTML = list.map(n => `
            <div class="notif-item px-4 py-2.5 border-b border-inherit flex items-start gap-2.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition ${n.da_doc ? 'opacity-60' : ''}" data-notif-id="${n.id}" data-read="${n.da_doc ? '1' : '0'}">
                <i data-lucide="${getNotifIcon(n.loai_thong_bao)}" class="notif-icon w-4 h-4 mt-0.5 flex-shrink-0 ${n.da_doc ? 'opacity-60' : 'text-emerald-500'}"></i>
                <div class="min-w-0">
                    <p class="notif-text text-xs ${n.da_doc ? '' : 'font-medium'} leading-snug">${n.noi_dung || ''}</p>
                    <p class="text-[10px] opacity-60 mt-0.5">${formatRelativeTime(n.created_at)}</p>
                </div>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Tải danh sách thông báo từ API (dùng chung key 'userName' - KHÔNG dùng key nào khác
    // để tránh lặp lại lỗi lộ dữ liệu chéo tài khoản đã từng gặp ở các trang khác)
    async function loadNotifications() {
        const agentName = localStorage.getItem('userName');
        if (!agentName) return;
        try {
            const res = await fetch(`/api/calls/notifications?agent=${encodeURIComponent(agentName)}`);
            const result = await res.json();
            if (result.success) renderNotifications(result.data || []);
        } catch (err) {
            console.error("Lỗi tải thông báo:", err);
        }
    }

    if (notifBtn) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifDropdown.classList.toggle('hidden');
            dropdown.classList.add('hidden'); // đóng menu user nếu đang mở
        });
    }

    if (notifDropdown) {
        notifDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Bấm vào TỪNG thông báo (nếu chưa đọc) -> đánh dấu đã đọc + tự trừ số badge,
    // không cần bấm "Đọc tất cả" mới trừ được.
    if (notifList) {
        notifList.addEventListener('click', async (e) => {
            const item = e.target.closest('.notif-item');
            if (!item || item.dataset.read === '1') return;

            const notifId = item.dataset.notifId;

            // Cập nhật giao diện ngay lập tức (optimistic update)
            item.dataset.read = '1';
            item.classList.add('opacity-60');
            const icon = item.querySelector('.notif-icon');
            if (icon) icon.classList.remove('text-emerald-500');
            const textEl = item.querySelector('.notif-text');
            if (textEl) textEl.classList.remove('font-medium');

            if (notifBadge && !notifBadge.classList.contains('hidden')) {
                const current = parseInt(notifBadge.textContent, 10);
                if (!isNaN(current)) {
                    const next = current - 1;
                    if (next <= 0) notifBadge.classList.add('hidden');
                    else notifBadge.textContent = next > 99 ? '99+' : next;
                }
            }

            try {
                await fetch(`/api/calls/notifications/${notifId}/read`, { method: 'POST' });
            } catch (err) {
                console.error("Lỗi đánh dấu thông báo đã đọc:", err);
            }
        });
    }

    document.addEventListener('click', () => {
        if (notifDropdown) notifDropdown.classList.add('hidden');
    });

    if (notifMarkAllRead) {
        notifMarkAllRead.addEventListener('click', async (e) => {
            e.stopPropagation();
            const agentName = localStorage.getItem('userName');
            if (!agentName) return;
            try {
                await fetch('/api/calls/notifications/mark-all-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agent: agentName })
                });
                loadNotifications();
            } catch (err) {
                console.error("Lỗi đánh dấu đã đọc:", err);
            }
        });
    }

    // Tải lần đầu khi header khởi tạo, sau đó tự làm mới mỗi 30 giây
    loadNotifications();
    setInterval(loadNotifications, 30000);

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
        const notifBadgeEl = document.getElementById('notifBadge');

        // Theo yêu cầu: giao diện Light -> nền vàng chữ trắng (dễ nổi trên nền sáng),
        // giao diện Dark -> nền đỏ chữ trắng (dễ nổi trên nền tối).
        // Dùng classList.remove/add cho đúng 2 class màu, KHÔNG động vào class 'hidden'
        // (vốn đang được renderNotifications() điều khiển ẩn/hiện dựa trên số chưa đọc).
        if (notifBadgeEl) {
            notifBadgeEl.classList.remove('bg-amber-500', 'bg-red-600');
            notifBadgeEl.classList.add(theme === 'light' ? 'bg-amber-500' : 'bg-red-600');
        }

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

    // 6.5. Hàm chức năng: Đổi mật khẩu (chỉ Agent/Leader)
    const headerChangePassword = document.getElementById('headerChangePassword');
    if (headerChangePassword) {
        headerChangePassword.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            Swal.fire({
                title: '<div class="text-sm md:text-base font-bold">Đổi Mật Khẩu</div>',
                html: `
                    <div class="text-left text-xs space-y-3">
                        <div>
                            <label class="block font-semibold mb-1">Mật khẩu hiện tại:</label>
                            <input type="password" id="swal-mk-cu" class="swal2-input" style="margin:0; width:100%;" placeholder="Nhập mật khẩu hiện tại...">
                        </div>
                        <div>
                            <label class="block font-semibold mb-1">Mật khẩu mới:</label>
                            <input type="password" id="swal-mk-moi" class="swal2-input" style="margin:0; width:100%;" placeholder="Ít nhất 6 ký tự...">
                        </div>
                        <div>
                            <label class="block font-semibold mb-1">Xác nhận mật khẩu mới:</label>
                            <input type="password" id="swal-mk-xacnhan" class="swal2-input" style="margin:0; width:100%;" placeholder="Nhập lại mật khẩu mới...">
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Xác nhận đổi',
                cancelButtonText: 'Hủy',
                confirmButtonColor: '#059669',
                preConfirm: () => {
                    const mkCu = document.getElementById('swal-mk-cu').value;
                    const mkMoi = document.getElementById('swal-mk-moi').value;
                    const mkXacNhan = document.getElementById('swal-mk-xacnhan').value;

                    if (!mkCu || !mkMoi || !mkXacNhan) {
                        Swal.showValidationMessage('Vui lòng điền đầy đủ các trường!');
                        return false;
                    }
                    if (mkMoi.length < 6) {
                        Swal.showValidationMessage('Mật khẩu mới phải có ít nhất 6 ký tự!');
                        return false;
                    }
                    if (mkMoi !== mkXacNhan) {
                        Swal.showValidationMessage('Mật khẩu mới và xác nhận không khớp nhau!');
                        return false;
                    }
                    return { mkCu, mkMoi };
                }
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                try {
                    const res = await fetch('/api/auth/change-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ten_dang_nhap: localStorage.getItem('userName'),
                            mat_khau_cu: result.value.mkCu,
                            mat_khau_moi: result.value.mkMoi
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        Swal.fire('Thành công', 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.', 'success').then(() => {
                            const currentTheme = localStorage.getItem('crm_theme');
                            localStorage.clear();
                            if (currentTheme) localStorage.setItem('crm_theme', currentTheme);
                            window.location.href = '/login.html';
                        });
                    } else {
                        Swal.fire('Lỗi', data.message || 'Không thể đổi mật khẩu!', 'error');
                    }
                } catch (err) {
                    Swal.fire('Lỗi', 'Không thể kết nối đến server!', 'error');
                }
            });
        });
    }

    // 7. Hàm chức năng: Xử lý đăng xuất tài khoản, giữ lại cài đặt theme hiện tại
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