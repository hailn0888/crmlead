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
            // LƯU CẢ 2 KEY ĐỂ SIDEBAR KHÔNG BAO GIỜ BỊ LỆCH
            const role = result.user.phan_quyen;
            localStorage.setItem('phan_quyen', role);
            localStorage.setItem('userRole', role);
            localStorage.setItem('userName', result.user.ho_va_ten);

            if (role === 'admin') {
                window.location.href = '/admin/dashboard_admin.html';
            } else if (role === 'leader') {
                // Sửa lại đúng chuẩn folder /leader/ thay vì /leaders/
                window.location.href = '/leader/dashboard.html';
            } else if (role === 'agent') {
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