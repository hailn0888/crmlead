// public/admin/js/quanlyuser.js
let usersList = [];
let groupsList = [];

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const userTableBody = document.getElementById('userTableBody');
    const searchInput = document.getElementById('searchInput');
    const roleFilter = document.getElementById('roleFilter');

    async function fetchUsersAndGroups() {
        try {
            const [resUsers, resGroups] = await Promise.all([
                fetch('/api/admin/users'),
                fetch('/api/admin/groups')
            ]);
            const resultUsers = await resUsers.json();
            const resultGroups = await resGroups.json();

            if (resultUsers.success) {
                usersList = resultUsers.data || [];
            }
            if (resultGroups.success) {
                groupsList = resultGroups.data || [];
            }
            renderUsers();
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu:", error);
            if (userTableBody) {
                userTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">Lỗi kết nối đến server.</td></tr>`;
            }
        }
    }

    function renderUsers() {
        if (!userTableBody) return;
        const keyword = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedRole = roleFilter ? roleFilter.value : 'all';

        const filtered = usersList.filter(u => {
            const matchText = (u.ho_va_ten || '').toLowerCase().includes(keyword) || (u.ten_dang_nhap || '').toLowerCase().includes(keyword);
            const matchRole = selectedRole === 'all' || u.phan_quyen === selectedRole;
            return matchText && matchRole;
        });

        if (filtered.length === 0) {
            userTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 opacity-60">Không tìm thấy nhân sự phù hợp trong hệ thống.</td></tr>`;
            return;
        }

        userTableBody.innerHTML = filtered.map((u, index) => {
            const isActive = u.trang_thai === 'Đang hoạt động';
            const tenNhom = u.ten_nhom || '<span class="opacity-40 italic">Chưa có nhóm</span>';
            const truongNhom = u.leader_name || '<span class="opacity-40 italic">Không có</span>';

            return `
                <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition">
                    <td class="p-3.5 text-center font-mono opacity-60">${index + 1}</td>
                    <td class="p-3.5 font-medium">${u.ho_va_ten || ''}</td>
                    <td class="p-3.5 font-mono text-emerald-500">${u.ten_dang_nhap || ''}</td>
                    <td class="p-3.5">${tenNhom}</td>
                    <td class="p-3.5">${truongNhom}</td>
                    <td class="p-3.5 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${isActive ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}">
                            ${u.trang_thai || 'Đang hoạt động'}
                        </span>
                    </td>
                    <td class="p-3.5 text-center">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer" ${u.ip_limit ? 'checked' : ''} onchange="toggleIpLimit(${u.id})">
                            <div class="w-7 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </td>
                    <td class="p-3.5 text-center space-x-1">
                        <button onclick="openAssignGroupModal(${u.id})" class="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition" title="Phân lại nhóm"><i data-lucide="folder" class="w-3.5 h-3.5 text-blue-500"></i></button>
                        <button onclick="toggleLockUser(${u.id})" class="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition" title="${isActive ? 'Khoá tài khoản' : 'Mở khoá'}"><i data-lucide="${isActive ? 'lock' : 'unlock'}" class="w-3.5 h-3.5 text-red-400"></i></button>
                        <button onclick="deleteUser(${u.id}, '${u.ho_va_ten || ''}')" class="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition" title="Xóa nhân viên"><i data-lucide="trash-2" class="w-3.5 h-3.5 text-red-500"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    if (searchInput) searchInput.addEventListener('input', renderUsers);
    if (roleFilter) roleFilter.addEventListener('change', renderUsers);

    fetchUsersAndGroups();

    // Modal Thêm nhân sự (Chuẩn mẫu mượt mà)
    const userModal = document.getElementById('userModal');
    const openUserBtn = document.getElementById('openUserModalBtn');
    const closeUserBtn = document.getElementById('closeUserModal');
    const cancelUserBtn = document.getElementById('cancelUserModal');

    if (openUserBtn && userModal) openUserBtn.addEventListener('click', () => userModal.classList.remove('hidden'));
    if (closeUserBtn && userModal) closeUserBtn.addEventListener('click', () => userModal.classList.add('hidden'));
    if (cancelUserBtn && userModal) cancelUserBtn.addEventListener('click', () => userModal.classList.add('hidden'));

    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                ten_dang_nhap: document.getElementById('addTenDangNhap').value,
                mat_khau: document.getElementById('addMatKhau').value,
                ho_va_ten: document.getElementById('addHoVaTen').value,
                phan_quyen: document.getElementById('addPhanQuyen').value,
                ten_nhom: document.getElementById('addTenNhom') ? document.getElementById('addTenNhom').value : '',
                truong_nhom: document.getElementById('addTruongNhom') ? document.getElementById('addTruongNhom').value : ''
            };

            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                userModal.classList.add('hidden');
                fetchUsersAndGroups();
                e.target.reset();
            } else {
                alert('Lỗi khi thêm nhân sự mới!');
            }
        });
    }

    // Modal Tạo nhóm (Đồng bộ cơ chế mở/đóng y hệt modal Thêm nhân viên)
    const groupModal = document.getElementById('groupModal');
    const openGroupBtn = document.getElementById('openGroupModalBtn');
    const closeGroupBtn = document.getElementById('closeGroupModal');
    const cancelGroupBtn = document.getElementById('cancelGroupModal');

    if (openGroupBtn && groupModal) {
        openGroupBtn.addEventListener('click', () => {
            const selectLeader = document.getElementById('modalTruongNhom');
            
            // Lọc chính xác Leader chưa làm trưởng nhóm nào hoặc chưa có group_id
            const activeGroupNames = new Set(usersList.map(u => u.ten_nhom).filter(n => n && n !== 'Chưa có nhóm'));
            const leadersWithGroup = new Set();
            usersList.forEach(u => {
                if ((u.phan_quyen || '').toLowerCase() === 'leader' && activeGroupNames.has(u.ten_nhom)) {
                    leadersWithGroup.add(u.id);
                }
            });

            const leaders = usersList.filter(u => {
                const role = (u.phan_quyen || '').toLowerCase();
                return (role === 'leader' || role === 'admin') && !leadersWithGroup.has(u.id) && !u.group_id;
            });

            if (selectLeader) {
                selectLeader.innerHTML = `<option value="">-- Chọn trưởng nhóm --</option>` + 
                    (leaders.length > 0 ? leaders.map(l => `<option value="${l.id}">${l.ho_va_ten} (${l.ten_dang_nhap})</option>`).join('') : '<option value="" disabled>Không còn Leader trống nào</option>');
            }

            const selectUser = document.getElementById('modalSelectUser');
            const freeAgents = usersList.filter(u => (u.phan_quyen || '').toLowerCase() === 'agent' && !u.group_id);
            if (selectUser) {
                selectUser.innerHTML = freeAgents.length > 0
                    ? freeAgents.map(u => `<option value="${u.id}">${u.ho_va_ten} (${u.ten_dang_nhap})</option>`).join('')
                    : '<option value="" disabled>Không có Agent nào chưa có nhóm</option>';
            }

            groupModal.classList.remove('hidden');
        });
    }

    if (closeGroupBtn && groupModal) closeGroupBtn.addEventListener('click', () => groupModal.classList.add('hidden'));
    if (cancelGroupBtn && groupModal) cancelGroupBtn.addEventListener('click', () => groupModal.classList.add('hidden'));

    const addGroupForm = document.getElementById('addGroupForm');
    if (addGroupForm) {
        addGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectUser = document.getElementById('modalSelectUser');
            const selectedUserIds = selectUser ? Array.from(selectUser.selectedOptions).map(option => option.value) : [];
            const ten_nhom = document.getElementById('modalTenNhom').value;
            const leader_id = document.getElementById('modalTruongNhom').value;

            if (selectedUserIds.length === 0) {
                alert('Vui lòng chọn ít nhất một nhân viên!');
                return;
            }

            try {
                const res = await fetch('/api/admin/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ten_nhom, leader_id, agent_ids: selectedUserIds })
                });
                const result = await res.json();

                if (result.success) {
                    alert(`Tạo nhóm thành công!`);
                    groupModal.classList.add('hidden');
                    fetchUsersAndGroups();
                    e.target.reset();
                } else {
                    alert(result.message || 'Lỗi khi tạo nhóm!');
                }
            } catch (error) {
                console.error('Lỗi tạo nhóm:', error);
                alert('Lỗi kết nối đến server!');
            }
        });
    }

    window.toggleLockUser = async function(id) {
        try {
            const res = await fetch(`/api/admin/users/${id}/toggle-lock`, { method: 'PATCH' });
            const data = await res.json();
            if (data.success) {
                const user = usersList.find(u => u.id === id);
                if (user) user.trang_thai = data.trang_thai;
                renderUsers();
            } else {
                alert(data.message || 'Lỗi khi đổi trạng thái khóa!');
            }
        } catch (error) {
            console.error('Lỗi toggle lock:', error);
            alert('Lỗi kết nối đến server!');
        }
    };

    window.deleteUser = async function(id, tenNhanVien) {
        if (confirm(`Bạn có chắc chắn muốn xóa nhân viên "${tenNhanVien}" khỏi hệ thống không?`)) {
            try {
                const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    fetchUsersAndGroups();
                } else {
                    alert(data.message || 'Lỗi khi xóa nhân viên!');
                }
            } catch (error) {
                console.error('Lỗi xóa user:', error);
                alert('Lỗi kết nối đến server!');
            }
        }
    };

    window.openAssignGroupModal = function(userId) {
        const assignUserId = document.getElementById('assignUserId');
        if (assignUserId) assignUserId.value = userId;

        const groupSelect = document.getElementById('modalAssignGroupSelect');
        if (groupSelect) {
            groupSelect.innerHTML = `<option value="">-- Chọn nhóm --</option>` + 
                groupsList.map(g => `<option value="${g.id}">${g.ten_nhom} (Leader: ${g.leader_name || 'Chưa có'})</option>`).join('');

            const currentUser = usersList.find(u => u.id === userId);
            const leaderInput = document.getElementById('modalAssignLeaderInput');

            if (currentUser && currentUser.group_id) {
                groupSelect.value = currentUser.group_id;
                const groupObj = groupsList.find(g => g.id === currentUser.group_id);
                if (leaderInput) {
                    leaderInput.value = groupObj ? (groupObj.leader_name || 'Chưa có trưởng nhóm') : 'Không có';
                }
            } else {
                if (leaderInput) leaderInput.value = '';
            }
        }

        const assignModal = document.getElementById('assignSingleGroupModal');
        if (assignModal) assignModal.classList.remove('hidden');
    };

    const modalAssignGroupSelect = document.getElementById('modalAssignGroupSelect');
    if (modalAssignGroupSelect) {
        modalAssignGroupSelect.addEventListener('change', function() {
            const selectedGroupId = this.value;
            const leaderInput = document.getElementById('modalAssignLeaderInput');
            if (!selectedGroupId) {
                if (leaderInput) leaderInput.value = '';
                return;
            }
            const groupObj = groupsList.find(g => g.id == selectedGroupId);
            if (leaderInput) {
                leaderInput.value = groupObj && groupObj.leader_name ? groupObj.leader_name : 'Chưa có trưởng nhóm cho nhóm này';
            }
        });
    }

    const closeAssignModal = document.getElementById('closeAssignModal');
    const cancelAssignModal = document.getElementById('cancelAssignModal');
    const assignSingleGroupModal = document.getElementById('assignSingleGroupModal');

    if (closeAssignModal && assignSingleGroupModal) closeAssignModal.addEventListener('click', () => assignSingleGroupModal.classList.add('hidden'));
    if (cancelAssignModal && assignSingleGroupModal) cancelAssignModal.addEventListener('click', () => assignSingleGroupModal.classList.add('hidden'));

    const assignSingleGroupForm = document.getElementById('assignSingleGroupForm');
    if (assignSingleGroupForm) {
        assignSingleGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('assignUserId').value;
            const group_id = document.getElementById('modalAssignGroupSelect').value;
            const groupObj = groupsList.find(g => g.id == group_id);

            try {
                const res = await fetch(`/api/admin/users/${userId}/group`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        group_id: group_id ? parseInt(group_id, 10) : null,
                        ten_nhom: groupObj ? groupObj.ten_nhom : null,
                        truong_nhom: groupObj ? groupObj.leader_name : null
                    })
                });
                const data = await res.json();

                if (data.success) {
                    alert('Cập nhật nhóm thành công!');
                    if (assignSingleGroupModal) assignSingleGroupModal.classList.add('hidden');
                    fetchUsersAndGroups();
                } else {
                    alert(data.message || 'Cập nhật thất bại!');
                }
            } catch (error) {
                console.error('Lỗi phân nhóm:', error);
                alert('Lỗi kết nối đến server!');
            }
        });
    }
});