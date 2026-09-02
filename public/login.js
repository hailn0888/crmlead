document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    
    const ten_dang_nhap = document.getElementById('ten_dang_nhap').value.trim();
    const mat_khau = document.getElementById('mat_khau').value.trim();
    const errorMsg = document.getElementById('errorMsg');

    errorMsg.classList.add('hidden');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ten_dang_nhap, mat_khau })
        });

        const result = await response.json();

        if (result.success) {
            localStorage.setItem('userRole', result.user.phan_quyen);
            localStorage.setItem('userName', result.user.ho_va_ten);

            if (result.user.phan_quyen === 'admin') {
                window.location.href = '/admin/dashboard_admin.html';
            } else if (result.user.phan_quyen === 'leader') {
                window.location.href = '/leaders/dashboard_leaders.html';
            } else if (result.user.phan_quyen === 'agent') {
                window.location.href = '/agents/dashboard_agents.html';
            }
        } else {
            errorMsg.textContent = result.message;
            errorMsg.classList.remove('hidden');
        }
    } catch (err) {
        console.error(err);
        errorMsg.textContent = "Không thể kết nối đến server!";
        errorMsg.classList.remove('hidden');
    }
});