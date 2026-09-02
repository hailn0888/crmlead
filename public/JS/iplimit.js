// public/js/iplimit.js
async function checkOfficeIpAccess() {
    try {
        const res = await fetch('/api/check-ip-access');
        const data = await res.json();

        if (!data.success && data.error_code === 'IP_RESTRICTED') {
            // Hiển thị giao diện chặn ngay lập tức trên trang data lead
            const mainContainer = document.querySelector('#mainContainer') || document.body;
            mainContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
                    <div class="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                        <i data-lucide="map-pin-off" class="w-8 h-8"></i>
                    </div>
                    <h3 class="text-base font-bold text-red-500 mb-1">Truy cập bị từ chối</h3>
                    <p class="text-xs opacity-70 max-w-sm">Bạn cần đến văn phòng để nhận lead</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return false;
        }
        return true;
    } catch (error) {
        console.error('Lỗi kiểm tra IP:', error);
        return true; // Tránh khóa oan nếu lỗi kết nối mạng nội bộ
    }
}