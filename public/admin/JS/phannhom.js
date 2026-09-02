document.addEventListener("DOMContentLoaded", () => {
    let allocationFiles = [];
    let allUsers = [];
    let allGroups = [];

    async function initAllocationModule() {
        try {
            const res = await fetch('/api/admin/allocation-options');
            const data = await res.json();
            if (data.success) {
                allocationFiles = data.files || [];
                allUsers = data.users || [];
                allGroups = data.groups || [];
                renderAllocationTable(allocationFiles);
            }
        } catch (err) {
            console.error('Lỗi khởi tạo module phân nhóm:', err);
        }
    }

    function renderAllocationTable(files) {
        const tbody = document.getElementById('allocation-table-body');
        const searchInput = document.getElementById('allocation-search-file');
        const keyword = searchInput ? searchInput.value.toLowerCase() : '';
        const filtered = files.filter(f => f.file_name.toLowerCase().includes(keyword));

        if (!tbody) return;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center opacity-60">Không tìm thấy file dữ liệu nào.</td></tr>`;
            return;
        }

        // Lọc danh sách Leader (user có phan_quyen là leader/admin)
        const leaders = allUsers.map(u => ({
            ...u,
            name: u.ho_va_ten || u.full_name || u.ten_dang_nhap
        })).filter(u => {
            const role = (u.phan_quyen || u.role || '').toLowerCase();
            return role.includes('leader') || role.includes('manager') || role.includes('admin');
        });

        // Lọc danh sách Agent (user có phan_quyen là agent/user/telesale)
        const agents = allUsers.map(u => ({
            ...u,
            name: u.ho_va_ten || u.full_name || u.ten_dang_nhap
        })).filter(u => {
            const role = (u.phan_quyen || u.role || '').toLowerCase();
            return role.includes('agent') || role.includes('telesale') || role.includes('user') || !role;
        });

        tbody.innerHTML = filtered.map((file, index) => {
            const selectedLeaderId = file.selected_leader_id || '';
            const selectedAgentId = file.selected_agent_id || '';

            // Nếu đã chọn Leader -> Lọc các Agent thuộc nhóm do Leader đó quản lý (dùng group_id)
            let currentAgents = agents;
            if (selectedLeaderId) {
                const managedGroups = allGroups.filter(g => g.leader_id == selectedLeaderId);
                const groupIds = managedGroups.map(g => g.group_id);
                
                currentAgents = agents.filter(a => groupIds.includes(a.group_id) || a.leader_id == selectedLeaderId);
            }

            // Nếu đã chọn Agent -> Tự động bắt ngược ra Leader quản lý nhóm của agent đó (dùng group_id)
            let currentLeaders = leaders;
            if (selectedAgentId) {
                const targetAgent = agents.find(a => a.id == selectedAgentId);
                if (targetAgent && targetAgent.group_id) {
                    const matchedGroup = allGroups.find(g => g.group_id == targetAgent.group_id);
                    if (matchedGroup && matchedGroup.leader_id) {
                        currentLeaders = leaders.filter(l => l.id == matchedGroup.leader_id);
                    }
                }
            }

            const leaderOptions = currentLeaders.map(l => 
                `<option value="${l.id}" ${selectedLeaderId == l.id ? 'selected' : ''}>${l.name}</option>`
            ).join('');

            const agentOptions = currentAgents.map(a => 
                `<option value="${a.id}" ${selectedAgentId == a.id ? 'selected' : ''}>${a.name}</option>`
            ).join('');

            return `
                <tr class="transition" style="border-color: var(--border-color);" data-fileid="${file.id}">
                    <td class="p-3 text-center font-semibold opacity-70">${index + 1}</td>
                    <td class="p-3">
                        <div class="font-semibold text-indigo-500">${file.file_name}</div>
                        <div class="text-[11px] opacity-70 mt-0.5">Trạng thái: <span class="font-medium text-amber-500">${file.status || 'Chờ phân bổ'}</span></div>
                    </td>
                    <td class="p-3 text-center">
                        <span class="text-slate-500 font-medium">${file.untouched_count || 0}</span> / 
                        <span class="text-blue-500 font-medium">${file.called_count || 0}</span> / 
                        <span class="text-emerald-500 font-bold">${file.appt_count || 0}</span>
                    </td>
                    <td class="p-3">
                        <select class="leader-select w-full px-2.5 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-indigo-600" 
                            style="border-color: var(--border-color); background: var(--bg-main); color: var(--text-main);"
                            data-fileid="${file.id}">
                            <option value="">-- Chọn Leader --</option>
                            ${leaderOptions}
                        </select>
                    </td>
                    <td class="p-3">
                        <select class="agent-select w-full px-2.5 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-indigo-600" 
                            style="border-color: var(--border-color); background: var(--bg-main); color: var(--text-main);"
                            data-fileid="${file.id}">
                            <option value="">-- Chọn Nhân Viên --</option>
                            ${agentOptions}
                        </select>
                    </td>
                    <td class="p-3 text-center space-x-1">
                        <button title="Thu hồi file" onclick="recallFileData(${file.id}, '${file.file_name}')" class="p-1 hover:text-purple-500 transition"><i data-lucide="rotate-ccw" class="w-4 h-4 inline"></i></button>
                        <button title="Khóa file" onclick="toggleLockFile(${file.id})" class="p-1 hover:text-amber-500 transition"><i data-lucide="lock" class="w-4 h-4 inline"></i></button>
                        <button title="Tải xuống gốc" onclick="downloadOriginalFile(${file.id})" class="p-1 hover:text-emerald-500 transition"><i data-lucide="download" class="w-4 h-4 inline"></i></button>
                        <button title="Xuất file báo cáo" onclick="exportFileReport(${file.id})" class="p-1 hover:text-indigo-500 transition"><i data-lucide="file-spreadsheet" class="w-4 h-4 inline"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
        bindRowEvents();
    }

    function bindRowEvents() {
        document.querySelectorAll('.leader-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const fileId = e.target.getAttribute('data-fileid');
                const leaderId = e.target.value;
                const fileObj = allocationFiles.find(f => f.id == fileId);
                if (fileObj) {
                    fileObj.selected_leader_id = leaderId;
                    if (fileObj.selected_agent_id) {
                        const agent = allUsers.find(u => u.id == fileObj.selected_agent_id);
                        const managedGroups = allGroups.filter(g => g.leader_id == leaderId).map(g => g.group_id);
                        if (agent && !managedGroups.includes(agent.group_id)) {
                            fileObj.selected_agent_id = '';
                        }
                    }
                    renderAllocationTable(allocationFiles);
                }
            });
        });

        document.querySelectorAll('.agent-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const fileId = e.target.getAttribute('data-fileid');
                const agentId = e.target.value;
                const fileObj = allocationFiles.find(f => f.id == fileId);
                if (fileObj) {
                    fileObj.selected_agent_id = agentId;
                    if (agentId) {
                        const agent = allUsers.find(u => u.id == agentId);
                        if (agent && agent.group_id) {
                            const group = allGroups.find(g => g.group_id == agent.group_id);
                            if (group && group.leader_id) {
                                fileObj.selected_leader_id = group.leader_id;
                            }
                        }
                    }
                    renderAllocationTable(allocationFiles);
                }
            });
        });
    }

    const searchInput = document.getElementById('allocation-search-file');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderAllocationTable(allocationFiles));
    }

    const btnSubmitMaster = document.getElementById('btn-submit-master-allocation');
    if (btnSubmitMaster) {
        btnSubmitMaster.addEventListener('click', async () => {
            const updates = allocationFiles.map(f => ({
                fileId: f.id,
                leaderId: f.selected_leader_id || null,
                agentId: f.selected_agent_id || null
            })).filter(item => item.leaderId || item.agentId);

            if (updates.length === 0) {
                Swal.fire({ title: 'Chưa có thay đổi', text: 'Vui lòng chọn ít nhất một Leader hoặc Nhân viên cho file data!', icon: 'warning', confirmButtonColor: '#4f46e5' });
                return;
            }

            const confirmResult = await Swal.fire({
                title: 'Xác nhận phân bổ dữ liệu?',
                html: `Hệ thống sẽ cập nhật phân bổ cho <b>${updates.length} file</b> đã chọn.<br><br>Tiến hành lưu ngay?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Đồng ý lưu',
                cancelButtonText: 'Hủy bỏ',
                confirmButtonColor: '#4f46e5',
                cancelButtonColor: '#64748b'
            });

            if (!confirmResult.isConfirmed) return;

            try {
                const res = await fetch('/admin/execute-master-allocation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                const result = await res.json();

                if (result.success) {
                    Swal.fire({ title: 'Thành công!', text: result.message, icon: 'success', confirmButtonColor: '#4f46e5' }).then(() => {
                        initAllocationModule();
                    });
                } else {
                    Swal.fire({ title: 'Thất bại', text: result.message, icon: 'error', confirmButtonColor: '#4f46e5' });
                }
            } catch (err) {
                console.error('Lỗi lưu phân bổ:', err);
                Swal.fire({ title: 'Lỗi kết nối', text: 'Không thể kết nối đến server.', icon: 'error', confirmButtonColor: '#4f46e5' });
            }
        });
    }

    initAllocationModule();
});