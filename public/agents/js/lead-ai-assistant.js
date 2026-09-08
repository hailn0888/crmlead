/*
  Tên file: public/agents/js/lead-ai-assistant.js
  Chức năng: Mở rộng bảng trượt "AI Assistant" (định nghĩa sẵn trong public/js/header.js,
  dùng chung cho mọi trang) dành riêng cho trang Data Lead (leads.html):
  - Đọc trực tiếp các trường đang hiển thị trong khung "Hồ Sơ Khách Hàng" trên màn hình
    (không cần biết leads.js load dữ liệu ra sao, luôn khớp với những gì agent đang thấy).
  - Gửi lên AI (qua backend) để phân tích chân dung khách hàng + gợi ý 3 kịch bản gọi.
  - Hiển thị kết quả ngay trong khung AI Assistant có sẵn.

  Cách hoạt động:
  header.js phát sự kiện tuỳ biến 'crm:ai-drawer-open' mỗi khi bảng AI Assistant được mở
  (bấm nút "AI Assistant" hoặc phím tắt Ctrl+I). File này lắng nghe sự kiện đó và tự thay
  nội dung bên trong #aiDrawerBody bằng giao diện phân tích khách hàng.
*/

(function () {
    // Chỉ kích hoạt tại đúng trang Data Lead, các trang khác vẫn dùng nội dung mặc định của header.js
    const IS_LEADS_PAGE = window.location.pathname.endsWith('/leads.html');
    if (!IS_LEADS_PAGE) return;

    // ----- Đọc dữ liệu đang hiển thị trên khung Hồ Sơ Khách Hàng -----
    function getFieldText(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        const text = el.textContent.trim();
        return (text === '-' || text === '') ? '' : text;
    }

    function getPhoneText() {
        const linkEl = document.getElementById('lbl-dien-thoai-link');
        const textEl = document.getElementById('lbl-dien-thoai-text');
        if (linkEl && !linkEl.classList.contains('hidden') && textEl) {
            const t = textEl.textContent.trim();
            return t === '-' ? '' : t;
        }
        return '';
    }

    function collectCustomerProfile() {
        return {
            so_hop_dong: getFieldText('lbl-so-hop-dong'),
            ho_ten: getFieldText('lbl-ho-ten'),
            gioi_tinh: getFieldText('lbl-gioi-tinh'),
            dien_thoai: getPhoneText(),
            cccd: getFieldText('lbl-cccd'),
            ngay_sinh: getFieldText('lbl-ngay-sinh'),
            ngay_tham_gia: getFieldText('lbl-ngay-tham-gia'),
            nam_dao_han: getFieldText('lbl-nam-dao-han'),
            menh_gia: getFieldText('lbl-menh-gia'),
            dia_chi: getFieldText('lbl-dia-chi')
        };
    }

    function hasLoadedCustomer(profile) {
        return !!(profile.ho_ten || profile.so_hop_dong);
    }

    // ----- Các giao diện hiển thị trong drawer -----
    function renderProfileSummaryHtml(profile) {
        const rows = [
            ['Họ tên', profile.ho_ten],
            ['Số hợp đồng', profile.so_hop_dong],
            ['Điện thoại', profile.dien_thoai],
            ['Mệnh giá', profile.menh_gia],
            ['Năm đáo hạn', profile.nam_dao_han]
        ].filter(([, v]) => v);

        if (rows.length === 0) return '';
        return `
            <div class="p-2.5 rounded-lg border border-inherit opacity-80 mb-3 space-y-0.5">
                ${rows.map(([label, val]) => `<div class="flex justify-between gap-2"><span class="opacity-60">${label}:</span><span class="font-medium text-right">${val}</span></div>`).join('')}
            </div>
        `;
    }

    function renderPromptState(profile) {
        const body = document.getElementById('aiDrawerBody');
        if (!body) return;

        if (!hasLoadedCustomer(profile)) {
            body.innerHTML = `
                <div class="p-3 rounded-xl border border-inherit opacity-90 bg-black/5 dark:bg-white/5">
                    <p class="font-medium mb-1 flex items-center gap-1.5 text-emerald-500">
                        <i data-lucide="user-search" class="w-3.5 h-3.5"></i> Chưa có khách hàng nào được chọn
                    </p>
                    <p class="opacity-75 leading-relaxed">Hãy chọn một khách hàng ở khung "Hồ Sơ Khách Hàng" trước, sau đó mở lại AI Assistant để phân tích chân dung và nhận gợi ý kịch bản gọi.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        body.innerHTML = `
            ${renderProfileSummaryHtml(profile)}
            <div class="p-3 rounded-xl border border-inherit opacity-90 bg-black/5 dark:bg-white/5 mb-3">
                <p class="font-medium mb-1 flex items-center gap-1.5 text-emerald-500">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Trợ lý thông minh CRM
                </p>
                <p class="opacity-75 leading-relaxed">AI sẽ đọc hồ sơ khách hàng đang hiển thị để phân tích chân dung và gợi ý 3 kịch bản chăm sóc phù hợp.</p>
            </div>
            <button id="btnAnalyzeLeadAi" class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl text-xs font-medium transition shadow">
                <i data-lucide="bot-message-square" class="w-4 h-4"></i>
                <span>Phân tích khách hàng bằng AI</span>
            </button>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const btn = document.getElementById('btnAnalyzeLeadAi');
        if (btn) btn.addEventListener('click', () => runAnalyze(profile));
    }

    function renderLoadingState(profile) {
        const body = document.getElementById('aiDrawerBody');
        if (!body) return;
        body.innerHTML = `
            ${renderProfileSummaryHtml(profile)}
            <div class="p-6 flex flex-col items-center gap-3 opacity-75">
                <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <span>AI đang phân tích hồ sơ khách hàng...</span>
            </div>
        `;
    }

    function renderResultState(profile, result) {
        const body = document.getElementById('aiDrawerBody');
        if (!body) return;

        const kichBanHtml = (result.kich_ban || []).map((kb, idx) => `
            <div class="p-3 rounded-xl border border-inherit mb-2">
                <p class="font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Kịch bản ${idx + 1}${kb.tieu_de ? ': ' + kb.tieu_de : ''}</p>
                <p class="opacity-90 leading-relaxed whitespace-pre-line">${kb.noi_dung || ''}</p>
            </div>
        `).join('');

        body.innerHTML = `
            ${renderProfileSummaryHtml(profile)}
            <div class="p-3 rounded-xl border border-inherit mb-3">
                <p class="font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                    <i data-lucide="user-round-search" class="w-3.5 h-3.5"></i> Phân tích chân dung khách hàng
                </p>
                <p class="opacity-90 leading-relaxed whitespace-pre-line">${result.phan_tich || 'Không có dữ liệu.'}</p>
            </div>
            <p class="font-semibold mb-1.5 flex items-center gap-1.5">
                <i data-lucide="list-checks" class="w-3.5 h-3.5 text-emerald-500"></i> 3 Kịch bản gợi ý
            </p>
            ${kichBanHtml || '<p class="opacity-60 italic">Không có kịch bản nào được tạo.</p>'}
            <button id="btnReAnalyzeLeadAi" class="w-full flex items-center justify-center gap-2 mt-1 py-2 px-3 rounded-lg border border-inherit opacity-80 hover:opacity-100 transition text-xs font-medium">
                <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                <span>Phân tích lại</span>
            </button>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const btn = document.getElementById('btnReAnalyzeLeadAi');
        if (btn) btn.addEventListener('click', () => runAnalyze(profile));
    }

    function renderErrorState(profile, message) {
        const body = document.getElementById('aiDrawerBody');
        if (!body) return;
        body.innerHTML = `
            ${renderProfileSummaryHtml(profile)}
            <div class="p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 mb-3">
                <p class="font-medium mb-1 flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Không thể phân tích</p>
                <p class="opacity-90">${message}</p>
            </div>
            <button id="btnRetryAnalyzeLeadAi" class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl text-xs font-medium transition shadow">
                <i data-lucide="rotate-cw" class="w-4 h-4"></i>
                <span>Thử lại</span>
            </button>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        const btn = document.getElementById('btnRetryAnalyzeLeadAi');
        if (btn) btn.addEventListener('click', () => runAnalyze(profile));
    }

    async function runAnalyze(profile) {
        renderLoadingState(profile);
        try {
            const res = await fetch('/api/ai/analyze-lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'AI không phân tích được.');
            renderResultState(profile, data.data);
        } catch (err) {
            console.error('Lỗi phân tích AI khách hàng:', err);
            renderErrorState(profile, err.message || 'Không thể kết nối tới máy chủ AI.');
        }
    }

    // Mỗi lần drawer AI Assistant được mở tại trang Data Lead -> đọc lại hồ sơ khách
    // hàng đang hiển thị và hiện giao diện phù hợp (chưa chọn khách / sẵn sàng phân tích)
    document.addEventListener('crm:ai-drawer-open', () => {
        const profile = collectCustomerProfile();
        renderPromptState(profile);
    });
})();