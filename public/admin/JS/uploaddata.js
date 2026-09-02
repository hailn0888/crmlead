// public/admin/js/uploaddata.js
// Đóng/Mở Modal Upload
function toggleUploadModal(isOpen) {
    const modal = document.getElementById('uploadModal');
    if (!modal) return;
    
    if (isOpen) {
        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        modal.classList.add('hidden');
        const form = document.getElementById('uploadForm');
        if (form) form.reset();
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        if (fileNameDisplay) fileNameDisplay.textContent = "Nhấp để chọn file";
    }
}

// Hiển thị danh sách tên các file khi chọn nhiều file
function updateFileName(input) {
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    if (input.files && input.files.length > 0) {
        if (input.files.length === 1) {
            fileNameDisplay.textContent = input.files[0].name;
        } else {
            fileNameDisplay.textContent = `Đã chọn ${input.files.length} file`;
        }
    } else {
        fileNameDisplay.textContent = "Nhấp để chọn file";
    }
}

// Xử lý Submit form Upload (Gửi nhiều file lên Backend)
async function handleUploadSubmit(event) {
    event.preventDefault();
    const fileInput = document.getElementById('dataFile');
    const submitBtn = document.getElementById('btnSubmitUpload');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Vui lòng chọn ít nhất một file dữ liệu cần upload!');
        return;
    }

    const formData = new FormData();
    // Đính kèm tất cả các file được chọn vào formData
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('files', fileInput.files[i]);
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Đang xử lý...`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        const response = await fetch('/api/admin/upload-lead-file', {
            method: 'POST',
            body: formData
        });

        // Kiểm tra xem server có trả về JSON hợp lệ không tránh lỗi SyntaxError 
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server không trả về định dạng JSON hợp lệ (Kiểm tra lại API route trên backend).");
        }

        const result = await response.json();

        if (response.ok && result.success) {
            toggleUploadModal(false);

            await Swal.fire({
                title: 'Thành công!',
                text: 'Upload và kiểm định chất lượng data thành công!',
                icon: 'success',
                confirmButtonText: 'OK'
            });

            if (typeof loadDashboardData === 'function') {
                loadDashboardData();
            } else {
                location.reload();
            }
        } else {
            // Popup báo lỗi khi trùng tên file hoặc lỗi phát sinh từ server
            Swal.fire({
                title: 'Không thể upload!',
                text: result.message || 'Đã có lỗi xảy ra khi upload file!',
                icon: 'error',
                confirmButtonText: 'Đóng'
            });
        }

        } catch (error) {
            console.error('Upload error:', error);
            alert('Lỗi kết nối đến server hoặc API chưa được định nghĩa đúng: ' + error.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Xác nhận Upload`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
}

// Hàm tải danh sách file cho Trung tâm Phân bổ (Tab 2)
async function loadFilesForAssignment() {
    try {
        const response = await fetch('/api/admin/data-files'); // Đã thêm /api/ vào trước /admin
        const result = await response.json();
        
        const fileList = Array.isArray(result) ? result : (result.files || result.data || []);
        
        const container = document.getElementById('file-list-container');
        if (!container) return;
        container.innerHTML = '';

        if (fileList.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Chưa có file data nào.</p>';
            return;
        }

        fileList.forEach(file => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-primary cursor-pointer transition';
            
            const fileId = file.id;
            const fileName = file.file_name || 'Không có tên';
            const totalRecords = file.total_records || 0;
            const status = file.status || 'Chờ phân bổ';

            item.innerHTML = `
                <div class="flex items-center space-x-2.5 overflow-hidden">
                    <input type="radio" name="selected-file" value="${fileId}" class="text-primary focus:ring-primary">
                    <div class="truncate">
                        <p class="text-xs font-semibold text-slate-800 truncate">${fileName}</p>
                        <p class="text-[10px] text-slate-500">Số lượng: <span class="font-bold text-slate-700">${totalRecords}</span> leads</p>
                    </div>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">${status}</span>
            `;
            
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const radio = item.querySelector('input[type="radio"]');
                    radio.checked = true;
                }
                const maxCountEl = document.getElementById('file-max-count');
                if (maxCountEl) maxCountEl.innerText = totalRecords;
            });

            container.appendChild(item);
        });
    } catch (error) {
        console.error("Lỗi tải danh sách file phân bổ:", error);
    }
}