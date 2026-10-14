/*
 * Tên file: public/admin/js/rplead_personal.js
 * Chức năng: Báo cáo Lead cá nhân - thống kê cuộc gọi telesale theo ngày/tuần/tháng/quý/năm.
 *
 * API backend cần có (trả JSON):
 *   GET /api/calls/report/agents
 *       -> [{ id, name }]
 *   GET /api/calls/report/logs?from=YYYY-MM-DD&to=YYYY-MM-DD[&agent_id=ID]
 *       -> [{ id, agent_id, agent_name, customer_name, phone, called_at,
 *             result, callback_at, duration, note }]
 *       from..to tính trọn ngày (00:00:00 của from đến 23:59:59 của to), giờ Việt Nam.
 * Mọi thống kê (ngày/tuần/tháng/quý/năm) được tính ở trình duyệt từ danh sách cuộc gọi này.
 */
(function () {
    'use strict';

    const API = {
        agents: '/api/calls/report/agents',
        logs: '/api/calls/report/logs'
    };

    // Kết quả cuộc gọi - khớp đúng các lựa chọn trong form gọi điện
    const RESULTS = [
        { key: 'hen_gap',    label: 'Hẹn gặp thành công',        color: '#16a34a' },
        { key: 'goi_lai',    label: 'Đang suy nghĩ/gọi lại sau', color: '#f59e0b' },
        { key: 'ban',        label: 'Khách bận',                 color: '#38bdf8' },
        { key: 'khong_nghe', label: 'Không nghe máy',            color: '#94a3b8' },
        { key: 'sai_so',     label: 'Sai số/Không gọi được',     color: '#a78bfa' },
        { key: 'thue_bao',   label: 'Thuê bao',                  color: '#64748b' },
        { key: 'tu_choi',    label: 'Từ chối thẳng',             color: '#dc2626' },
        { key: 'khac',       label: 'Khác',                      color: '#cbd5e1' }
    ];
    const RES = Object.fromEntries(RESULTS.map(r => [r.key, r]));

    const PERIODS = {
        day:     { label: 'ngày',  n: 30, desc: '30 ngày gần nhất' },
        week:    { label: 'tuần',  n: 12, desc: '12 tuần gần nhất' },
        month:   { label: 'tháng', n: 12, desc: '12 tháng gần nhất' },
        quarter: { label: 'quý',   n: 8,  desc: '8 quý gần nhất' },
        year:    { label: 'năm',   n: 5,  desc: '5 năm gần nhất' }
    };

    const state = {
        agentsFromApi: false,
        rows: [],
        cache: new Map(),
        period: 'day',
        buckets: [],
        selected: null,
        logPage: 1,
        pageSize: 50,
        charts: {},
        avgMode: 'd7',   // chế độ cột "Trung bình" của bảng tổng hợp theo nhân viên
        range: null      // { from, to } khoảng ngày đang xem (để tính cột Trung bình)
    };

    /* ---------- Tiện ích ---------- */
    const $ = id => document.getElementById(id);
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dm = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const dmyHm = d => `${hm(d)} ${dm(d)}/${d.getFullYear()}`;
    const num = n => Number(n || 0).toLocaleString('vi-VN');
    const pct = n => (Math.round(n * 10) / 10).toLocaleString('vi-VN') + '%';
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[_-]+/g, ' ').trim();

    function parseDate(v) {
        if (!v) return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        let s = String(v).trim();
        // DB lưu giờ UTC dạng không kèm múi giờ -> thêm 'Z' để hiểu đúng là UTC (giống calls.html)
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(s)) {
            s = s.replace(' ', 'T') + 'Z';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    // Ghi chú trong DB có lẫn thẻ HTML (<br>, <span ...>) -> bỏ thẻ, giữ chữ
    function cleanNote(s) {
        return String(s == null ? '' : s)
            .replace(/<\s*br\s*\/?>/gi, ' ')
            .replace(/<\/?(?:span|div|p|b|i|u|em|strong|small|font)\b[^>]*>/gi, '')
            .replace(/&nbsp;/gi, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ').trim();
    }
    function parseInputDate(v) {
        if (!v) return null;
        const p = v.split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }
    function minMax(list, fn) {
        let min = null, max = null;
        list.forEach(item => {
            const t = fn(item);
            if (t == null) return;
            if (min === null || t < min) min = t;
            if (max === null || t > max) max = t;
        });
        return { min: min === null ? null : new Date(min), max: max === null ? null : new Date(max) };
    }
    function fmtDuration(sec) {
        sec = Number(sec) || 0;
        if (!sec) return '-';
        return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
    }
    function showError(e) {
        console.error(e);
        const msg = (e && e.message) || String(e);
        if (window.Swal) Swal.fire({ icon: 'error', title: 'Lỗi', text: msg });
        else alert(msg);
    }
    function showNotice(msg) {
        const el = $('apiNotice');
        el.textContent = msg;
        el.classList.toggle('hidden', !msg);
    }
    const emptyHtml = msg => `<div class="text-xs opacity-70 text-center py-8">${esc(msg)}</div>`;
    const refreshIcons = () => { if (window.lucide) lucide.createIcons(); };

    /* ---------- Gọi API ---------- */
    async function fetchJson(url) {
        const headers = { Accept: 'application/json' };
        try {
            const t = localStorage.getItem('token');
            if (t) headers.Authorization = 'Bearer ' + t;
        } catch (_) { /* bỏ qua */ }
        const res = await fetch(url, { headers, credentials: 'same-origin' });
        const path = url.split('?')[0];
        const type = res.headers.get('content-type') || '';
        if (!type.includes('application/json')) {
            throw new Error(res.status === 404
                ? `API ${path} chưa tồn tại (404). Cần thêm route này ở backend.`
                : `API ${path} không trả về JSON (HTTP ${res.status}).`);
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `Lỗi HTTP ${res.status} tại ${path}`);
        return data;
    }
    function unwrap(d) {
        if (Array.isArray(d)) return d;
        if (d && typeof d === 'object') {
            for (const k of ['data', 'rows', 'items', 'logs', 'agents', 'result']) {
                if (Array.isArray(d[k])) return d[k];
            }
        }
        return [];
    }

    function classify(raw) {
        const t = norm(raw);
        if (!t) return 'khac';
        if (t.includes('hen gap') || t === 'hen' || t.includes('appointment')) return 'hen_gap';
        if (t.includes('suy nghi') || t.includes('goi lai') || t.includes('callback')) return 'goi_lai';
        if (t.includes('sai so') || t.includes('khong goi duoc')) return 'sai_so';
        if (t.includes('khong nghe')) return 'khong_nghe';
        if (t.includes('thue bao')) return 'thue_bao';
        if (t.includes('tu choi')) return 'tu_choi';
        if (t.includes('ban')) return 'ban';
        return 'khac';
    }

    function normalizeRow(r) {
        const id = r.agent_id != null ? r.agent_id : (r.user_id != null ? r.user_id : (r.employee_id != null ? r.employee_id : (r.agentId != null ? r.agentId : '')));
        const name = r.agent_name || r.user_name || r.employee_name || r.full_name || (id !== '' ? 'NV #' + id : 'Không rõ');
        return {
            id: r.id || r._id || '',
            at: parseDate(r.called_at || r.call_time || r.calledAt || r.created_at || r.createdAt),
            cb: parseDate(r.callback_at || r.callback_time || r.recall_at || r.next_call_at || r.callbackAt),
            resultKey: classify(r.result || r.call_result || r.ket_qua || r.status),
            agentId: String(id),
            agentKey: String(id !== '' ? id : name),
            agentName: name,
            customer: r.customer_name || r.lead_name || r.name || '',
            phone: r.phone || r.customer_phone || '',
            note: cleanNote(r.note || r.notes),
            duration: Number(r.duration || r.call_duration || 0)
        };
    }

    async function loadRange(from, to, agentId) {
        const key = `${ymd(from)}|${ymd(to)}|${agentId}`;
        if (state.cache.has(key)) return state.cache.get(key);
        const qs = new URLSearchParams({ from: ymd(from), to: ymd(to) });
        if (agentId) qs.set('agent_id', agentId);
        const data = await fetchJson(`${API.logs}?${qs}`);
        if (data && data.truncated) showNotice('Khoảng thời gian này có quá nhiều cuộc gọi, báo cáo chỉ gồm 50.000 cuộc gọi gần nhất. Hãy chọn khoảng ngắn hơn hoặc lọc theo nhân viên.');
        const lo = startOfDay(from), hi = addDays(startOfDay(to), 1);
        const rows = unwrap(data).map(normalizeRow).filter(r => r.at && r.at >= lo && r.at < hi);
        state.cache.set(key, rows);
        return rows;
    }

    /* ---------- Thống kê ---------- */
    function tally(rows) {
        const t = { total: rows.length };
        RESULTS.forEach(r => { t[r.key] = 0; });
        rows.forEach(r => { t[r.resultKey]++; });
        t.connected = t.hen_gap + t.goi_lai + t.tu_choi; // khách nghe máy và có phản hồi
        t.unreached = t.ban + t.khong_nghe + t.sai_so + t.thue_bao;
        t.rateHen = t.total ? t.hen_gap / t.total * 100 : 0;
        t.rateConn = t.total ? t.connected / t.total * 100 : 0;
        return t;
    }
    function summarizeByAgent(rows) {
        const map = new Map();
        rows.forEach(r => {
            if (!map.has(r.agentKey)) map.set(r.agentKey, { name: r.agentName, rows: [] });
            map.get(r.agentKey).rows.push(r);
        });
        return [...map.values()]
            .map(g => ({ name: g.name, rows: g.rows, t: tally(g.rows) }))
            .sort((a, b) => b.t.total - a.t.total);
    }

    function startOfWeek(d) {
        const x = startOfDay(d);
        x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // tuần bắt đầu từ thứ Hai
        return x;
    }
    function makeBuckets(period) {
        const now = new Date(), list = [];
        for (let i = PERIODS[period].n - 1; i >= 0; i--) {
            let s, e, label, full;
            if (period === 'day') {
                s = addDays(now, -i); s = startOfDay(s); e = addDays(s, 1);
                label = dm(s); full = `Ngày ${dm(s)}/${s.getFullYear()}`;
            } else if (period === 'week') {
                s = addDays(startOfWeek(now), -7 * i); e = addDays(s, 7);
                const last = addDays(e, -1);
                label = dm(s); full = `Tuần ${dm(s)} - ${dm(last)}/${last.getFullYear()}`;
            } else if (period === 'month') {
                s = new Date(now.getFullYear(), now.getMonth() - i, 1);
                e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
                label = `${pad(s.getMonth() + 1)}/${s.getFullYear()}`; full = `Tháng ${label}`;
            } else if (period === 'quarter') {
                const qm = Math.floor(now.getMonth() / 3) * 3;
                s = new Date(now.getFullYear(), qm - 3 * i, 1);
                e = new Date(s.getFullYear(), s.getMonth() + 3, 1);
                const q = Math.floor(s.getMonth() / 3) + 1;
                label = `Q${q}/${s.getFullYear()}`; full = `Quý ${q} năm ${s.getFullYear()}`;
            } else {
                s = new Date(now.getFullYear() - i, 0, 1); e = new Date(s.getFullYear() + 1, 0, 1);
                label = String(s.getFullYear()); full = `Năm ${label}`;
            }
            list.push({ s, e, label, full, rows: [], t: null });
        }
        return list;
    }

    /* ---------- Biểu đồ ---------- */
    function applyChartTheme() {
        const fg = getComputedStyle(document.body).color || '#374151';
        Chart.defaults.color = fg;
        Chart.defaults.borderColor = 'rgba(128,128,128,.2)';
        Chart.defaults.font.family = 'inherit';
        Chart.defaults.font.size = 11;
    }
    function mkChart(id, cfg) {
        if (state.charts[id]) state.charts[id].destroy();
        applyChartTheme();
        state.charts[id] = new Chart($(id), cfg);
        return state.charts[id];
    }
    function killChart(id) {
        if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
    }

    function drawTrend() {
        const b = state.buckets;
        const datasets = RESULTS.map(r => ({
            label: r.label, data: b.map(x => x.t[r.key]), backgroundColor: r.color, stack: 'calls', order: 2
        }));
        datasets.push({
            type: 'line', label: 'Tỷ lệ hẹn gặp (%)', yAxisID: 'y1', order: 1,
            data: b.map(x => Math.round(x.t.rateHen * 10) / 10),
            borderColor: '#6366f1', backgroundColor: '#6366f1', borderWidth: 2, tension: 0.3,
            pointRadius: c => c.dataIndex === state.selected ? 7 : 3
        });
        mkChart('trendChart', {
            type: 'bar',
            data: { labels: b.map(x => x.label), datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Số cuộc gọi' } },
                    y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            title: items => b[items[0].dataIndex].full,
                            footer: items => 'Tổng cuộc gọi: ' + num(b[items[0].dataIndex].t.total)
                        }
                    }
                },
                onClick: (evt, _els, chart) => {
                    const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
                    if (!pts.length) return;
                    state.selected = pts[0].index;
                    chart.update('none');
                    drawCompare();
                }
            }
        });
    }

    function drawCompare() {
        const b = state.buckets[state.selected];
        if (!b) return;
        const groups = summarizeByAgent(b.rows);
        $('compareTitle').textContent = `So sánh nhân viên - ${b.full}`;
        $('compareEmpty').classList.toggle('hidden', groups.length > 0);
        $('compareWrap').classList.toggle('hidden', groups.length === 0);
        $('bucketTable').innerHTML = agentTableHtml(b.rows, state.period === 'day', false);
        if (!groups.length) { killChart('compareChart'); return; }
        const series = [
            ['Tổng cuộc gọi', 'total', '#3b82f6'],
            ['Liên hệ được', 'connected', '#14b8a6'],
            ['Hẹn gặp thành công', 'hen_gap', '#16a34a'],
            ['Gọi lại sau', 'goi_lai', '#f59e0b'],
            ['Từ chối thẳng', 'tu_choi', '#dc2626']
        ];
        mkChart('compareChart', {
            type: 'bar',
            data: {
                labels: groups.map(g => g.name),
                datasets: series.map(s => ({ label: s[0], data: groups.map(g => g.t[s[1]]), backgroundColor: s[2] }))
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
            }
        });
    }

    async function renderPeriod() {
        const p = state.period, agent = $('agentSelect').value;
        document.querySelectorAll('.period-tab').forEach(btn => {
            const on = btn.dataset.period === p;
            btn.classList.toggle('bg-red-700', on);
            btn.classList.toggle('text-white', on);
            btn.classList.toggle('border-red-700', on);
        });
        $('periodTitle').textContent = `Biểu đồ ${PERIODS[p].label} - ${PERIODS[p].desc}`;
        const buckets = makeBuckets(p);
        let rows;
        try {
            rows = await loadRange(buckets[0].s, new Date(), agent);
        } catch (e) { showError(e); return; }
        if (p !== state.period) return; // người dùng đã đổi tab trong lúc tải
        buckets.forEach(b => {
            b.rows = rows.filter(r => r.at >= b.s && r.at < b.e);
            b.t = tally(b.rows);
        });
        state.buckets = buckets;
        if (state.selected == null || state.selected >= buckets.length) {
            let idx = buckets.length - 1;
            while (idx > 0 && buckets[idx].t.total === 0) idx--;
            state.selected = idx;
        }
        drawTrend();
        drawCompare();
    }

    function drawHourAndResult(rows) {
        const total = new Array(24).fill(0), hen = new Array(24).fill(0);
        rows.forEach(r => { const h = r.at.getHours(); total[h]++; if (r.resultKey === 'hen_gap') hen[h]++; });
        let lo = total.findIndex(v => v > 0), hi = 23 - [...total].reverse().findIndex(v => v > 0);
        if (lo < 0) { lo = 8; hi = 18; }
        const hours = []; for (let h = lo; h <= hi; h++) hours.push(h);
        mkChart('hourChart', {
            type: 'bar',
            data: {
                labels: hours.map(h => h + 'h'),
                datasets: [
                    { label: 'Tổng cuộc gọi', data: hours.map(h => total[h]), backgroundColor: '#3b82f6' },
                    { label: 'Hẹn gặp thành công', data: hours.map(h => hen[h]), backgroundColor: '#16a34a' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
            }
        });
        const t = tally(rows);
        mkChart('resultChart', {
            type: 'doughnut',
            data: {
                labels: RESULTS.map(r => r.label),
                datasets: [{ data: RESULTS.map(r => t[r.key]), backgroundColor: RESULTS.map(r => r.color), borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
            }
        });
    }

    /* ---------- Bảng ---------- */
    const TH = (text, left) => `<th class="px-2 py-2 ${left ? 'text-left' : 'text-right'} whitespace-nowrap font-semibold">${text}</th>`;
    const TD = (text, left, bold) => `<td class="px-2 py-2 ${left ? 'text-left' : 'text-right'} whitespace-nowrap ${bold ? 'font-semibold' : ''}">${text}</td>`;

    /* ---------- Cột "Trung bình" (tính tại trình duyệt, không lưu DB) ----------
     * Mọi chế độ đều tính đủ 7 ngày/tuần (kể cả Chủ Nhật):
     *  - d1 / d7 / d30 : "ngày liên tục" -> tổng gọi ÷ số ngày của khoảng đã chọn (× 1, × 7 hoặc × 30)
     *  - week     : tuần LỊCH (Thứ Hai - Chủ Nhật) -> tổng gọi ÷ số tuần lịch mà khoảng ngày chạm vào
     *  - month    : tháng LỊCH (mùng 1 - cuối tháng) -> tổng gọi ÷ số tháng lịch mà khoảng ngày chạm vào */
    const AVG_MODES = {
        d1:    { label: 'Trung bình 1 ngày',  unit: '/ngày' },
        d7:    { label: 'Trung bình 7 ngày',  unit: '/7 ngày' },
        week:  { label: 'Trung bình tuần',    unit: '/tuần' },
        d30:   { label: 'Trung bình 30 ngày', unit: '/30 ngày' },
        month: { label: 'Trung bình tháng',   unit: '/tháng' }
    };
    function avgInfo() {
        const r = state.range;
        if (!r) return null;
        const days = Math.round((startOfDay(r.to) - startOfDay(r.from)) / 864e5) + 1;
        switch (state.avgMode) {
            case 'week': {
                const weeks = Math.round((startOfWeek(r.to) - startOfWeek(r.from)) / (7 * 864e5)) + 1;
                return { div: weeks, mul: 1, note: `tổng gọi ÷ ${weeks} tuần lịch (Thứ Hai - Chủ Nhật) mà khoảng ngày đã chọn chạm vào` };
            }
            case 'month': {
                const months = (r.to.getFullYear() - r.from.getFullYear()) * 12 + r.to.getMonth() - r.from.getMonth() + 1;
                return { div: months, mul: 1, note: `tổng gọi ÷ ${months} tháng lịch (mùng 1 - cuối tháng) mà khoảng ngày đã chọn chạm vào` };
            }
            case 'd1':  return { div: days, mul: 1,  note: `tổng gọi ÷ ${days} ngày đã chọn (tính đủ cả Chủ Nhật)` };
            case 'd30': return { div: days, mul: 30, note: `tổng gọi ÷ ${days} ngày đã chọn × 30 (tính đủ cả Chủ Nhật)` };
            default:    return { div: days, mul: 7,  note: `tổng gọi ÷ ${days} ngày đã chọn × 7 (tính đủ cả Chủ Nhật)` };
        }
    }
    const fmtAvg = v => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    function avgCell(total, bold) {
        const a = avgInfo();
        if (!a) return TD('-', false, bold);
        return TD(`${fmtAvg(total / a.div * a.mul)}`, false, bold);
    }
    function avgHeader() {
        const opts = Object.entries(AVG_MODES).map(([k, m]) =>
            `<option value="${k}"${k === state.avgMode ? ' selected' : ''}>${m.label}</option>`).join('');
        return '<th class="px-2 py-2 text-right whitespace-nowrap font-semibold">'
            + `<select id="avgModeSelect" class="border border-gray-500/40 bg-transparent rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer" title="Chọn cách tính trung bình">${opts}</select></th>`;
    }

    function agentLine(name, list, t, oneDay, bold, withAvg) {
        const mm = minMax(list, r => r.at.getTime());
        const now = new Date();
        const nextCb = minMax(list.filter(r => r.cb && r.cb >= now), r => r.cb.getTime()).min;
        const ft = d => d ? (oneDay ? hm(d) : `${hm(d)} ${dm(d)}`) : '-';
        return `<tr class="border-b border-gray-500/30 ${bold ? 'bg-gray-500/10' : ''}">`
            + TD(esc(name), true, true) + TD(num(t.total), false, bold) + (withAvg ? avgCell(t.total, bold) : '') + TD(num(t.connected), false, bold)
            + TD(num(t.hen_gap), false, bold) + TD(pct(t.rateHen), false, bold) + TD(num(t.goi_lai), false, bold)
            + TD(num(t.ban), false, bold) + TD(num(t.khong_nghe), false, bold) + TD(num(t.sai_so), false, bold)
            + TD(num(t.thue_bao), false, bold) + TD(num(t.tu_choi), false, bold) + TD(num(t.khac), false, bold)
            + TD(ft(mm.min), false, bold) + TD(ft(mm.max), false, bold)
            + TD(nextCb ? (oneDay ? hm(nextCb) : `${hm(nextCb)} ${dm(nextCb)}`) : '-', false, bold) + '</tr>';
    }
    // withAvg: true = có cột "Trung bình" (bảng Tổng hợp theo nhân viên); false = bảng so sánh theo kỳ (không cần trung bình)
    function agentTableHtml(rows, oneDay, withAvg) {
        if (!rows.length) return emptyHtml('Chưa có cuộc gọi nào trong kỳ này.');
        const groups = summarizeByAgent(rows);
        const head = '<tr class="bg-gray-500/10 border-b border-gray-500/30">'
            + TH('Nhân viên', true) + TH('Tổng gọi') + (withAvg ? avgHeader() : '') + TH('Liên hệ được') + TH('Hẹn gặp') + TH('Tỷ lệ hẹn')
            + TH('Gọi lại sau') + TH('Khách bận') + TH('Không nghe') + TH('Sai số') + TH('Thuê bao')
            + TH('Từ chối') + TH('Khác') + TH('Giờ gọi đầu') + TH('Giờ gọi cuối') + TH('Gọi lại sớm nhất') + '</tr>';
        const body = groups.map(g => agentLine(g.name, g.rows, g.t, oneDay, false, withAvg)).join('')
            + agentLine('Tổng cộng', rows, tally(rows), oneDay, true, withAvg);
        const a = withAvg ? avgInfo() : null;
        const note = a ? `<p class="text-[11px] opacity-70 mt-2">${esc(AVG_MODES[state.avgMode].label)}: ${esc(a.note)}.</p>` : '';
        return `<table class="w-full text-xs"><thead>${head}</thead><tbody>${body}</tbody></table>${note}`;
    }

    function resultBadge(key) {
        const r = RES[key] || RES.khac;
        return `<span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span class="w-2 h-2 rounded-full" style="background:${r.color}"></span>${esc(r.label)}</span>`;
    }

    function renderCallbacks(rows) {
        const now = new Date(), today = startOfDay(now);
        const list = rows.filter(r => r.cb && r.cb >= today).sort((a, b) => a.cb - b.cb).slice(0, 50);
        if (!list.length) { $('callbackTable').innerHTML = emptyHtml('Không có lịch gọi lại nào từ hôm nay trong dữ liệu đang xem.'); return; }
        const head = '<tr class="bg-gray-500/10 border-b border-gray-500/30">' + TH('Giờ gọi lại', true) + TH('Trạng thái', true)
            + TH('Nhân viên', true) + TH('Khách hàng', true) + TH('SĐT', true) + TH('Lần gọi trước', true) + TH('Ghi chú', true) + '</tr>';
        const body = list.map(r => {
            const late = r.cb < now;
            return `<tr class="border-b border-gray-500/30">`
                + TD(dmyHm(r.cb), true, true)
                + TD(late ? '<span class="text-red-600 font-medium">Quá giờ</span>' : 'Sắp tới', true)
                + TD(esc(r.agentName), true) + TD(esc(r.customer), true) + TD(esc(r.phone), true)
                + TD(dmyHm(r.at), true) + `<td class="px-2 py-2 text-left">${esc(r.note)}</td></tr>`;
        }).join('');
        $('callbackTable').innerHTML = `<table class="w-full text-xs"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }

    function filteredLog() {
        const rk = $('logResult').value, q = norm($('logSearch').value);
        return [...state.rows].sort((a, b) => b.at - a.at).filter(r => {
            if (rk && r.resultKey !== rk) return false;
            if (!q) return true;
            return norm(`${r.agentName} ${r.customer} ${r.phone} ${r.note}`).includes(q);
        });
    }
    function renderLog() {
        const list = filteredLog();
        const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
        state.logPage = Math.min(state.logPage, pages);
        const from = (state.logPage - 1) * state.pageSize;
        const slice = list.slice(from, from + state.pageSize);
        if (!slice.length) {
            $('logTable').innerHTML = emptyHtml('Không có cuộc gọi phù hợp.');
            $('logPager').innerHTML = '';
            return;
        }
        const head = '<tr class="bg-gray-500/10 border-b border-gray-500/30">' + TH('Giờ gọi', true) + TH('Nhân viên', true)
            + TH('Khách hàng', true) + TH('SĐT', true) + TH('Kết quả', true) + TH('Giờ gọi lại', true) + TH('Thời lượng') + TH('Ghi chú', true) + '</tr>';
        const body = slice.map(r => `<tr class="border-b border-gray-500/30">`
            + TD(dmyHm(r.at), true) + TD(esc(r.agentName), true) + TD(esc(r.customer), true) + TD(esc(r.phone), true)
            + `<td class="px-2 py-2 text-left">${resultBadge(r.resultKey)}</td>`
            + TD(r.cb ? dmyHm(r.cb) : '-', true) + TD(fmtDuration(r.duration)) + `<td class="px-2 py-2 text-left">${esc(r.note)}</td></tr>`).join('');
        $('logTable').innerHTML = `<table class="w-full text-xs"><thead>${head}</thead><tbody>${body}</tbody></table>`;
        const btn = (page, text, off) => `<button type="button" data-page="${page}" ${off ? 'disabled' : ''} class="border border-gray-500/40 rounded-lg px-3 py-1.5 ${off ? 'opacity-40' : ''}">${text}</button>`;
        $('logPager').innerHTML = `<span>${from + 1}-${from + slice.length} / ${num(list.length)} cuộc gọi</span>`
            + `<span class="flex items-center gap-2">${btn(state.logPage - 1, 'Trước', state.logPage <= 1)}<span>Trang ${state.logPage}/${pages}</span>${btn(state.logPage + 1, 'Sau', state.logPage >= pages)}</span>`;
    }

    /* ---------- Thẻ tổng quan ---------- */
    function delta(cur, prev) {
        if (prev == null) return '';
        if (prev === 0) return cur > 0 ? '<span class="text-green-600">▲ mới phát sinh</span> so với kỳ trước' : 'Kỳ trước: 0';
        const ch = (cur - prev) / prev * 100;
        const up = ch >= 0;
        return `<span class="${up ? 'text-green-600' : 'text-red-600'}">${up ? '▲' : '▼'} ${pct(Math.abs(ch))}</span> so với kỳ trước`;
    }
    function kpiCard(icon, color, label, value, sub) {
        return `<div class="theme-card border rounded-xl p-3 shadow-sm"><div class="flex items-center justify-between"><span class="text-xs opacity-75">${label}</span>`
            + `<i data-lucide="${icon}" class="w-4 h-4 ${color}"></i></div><div class="text-xl font-bold mt-1">${value}</div>`
            + `<div class="text-[11px] opacity-80 mt-0.5">${sub || '&nbsp;'}</div></div>`;
    }
    function renderKpi(rows, prevRows) {
        const t = tally(rows), p = prevRows ? tally(prevRows) : null;
        const upcoming = rows.filter(r => r.cb && r.cb >= new Date()).length;
        $('kpiGrid').innerHTML =
            kpiCard('phone-call', 'text-blue-500', 'Tổng cuộc gọi', num(t.total), delta(t.total, p && p.total))
            + kpiCard('user-check', 'text-teal-500', 'Liên hệ được', num(t.connected), `${pct(t.rateConn)} tổng cuộc gọi`)
            + kpiCard('calendar-check', 'text-green-600', 'Hẹn gặp thành công', num(t.hen_gap), `${pct(t.rateHen)} tổng gọi · ${delta(t.hen_gap, p && p.hen_gap)}`)
            + kpiCard('phone-forwarded', 'text-amber-500', 'Gọi lại sau', num(t.goi_lai), `${num(upcoming)} lịch gọi lại sắp tới`)
            + kpiCard('phone-off', 'text-red-600', 'Từ chối thẳng', num(t.tu_choi), `${pct(t.total ? t.tu_choi / t.total * 100 : 0)} tổng cuộc gọi`)
            + kpiCard('phone-missed', 'text-slate-500', 'Chưa liên hệ được', num(t.unreached), 'Bận · không nghe · sai số · thuê bao');
        refreshIcons();
    }

    function renderResultStrip(rows) {
        const t = tally(rows);
        $('resultStripTitle').textContent = `Chi tiết theo kết quả cuộc gọi - tổng ${num(t.total)} cuộc gọi`;
        $('resultStrip').innerHTML = RESULTS.map(r => {
            const p = t.total ? t[r.key] / t.total * 100 : 0;
            return `<div class="theme-card border rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">`
                + `<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${r.color}"></span>`
                + `<div class="min-w-0"><div class="text-[11px] opacity-75 truncate" title="${esc(r.label)}">${esc(r.label)}</div>`
                + `<div class="text-sm font-bold">${num(t[r.key])} <span class="text-[11px] font-normal opacity-70">(${pct(p)})</span></div></div></div>`;
        }).join('');
    }

    /* ---------- Xuất CSV ---------- */
    function downloadCsv(name, header, lines) {
        const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const csv = '\uFEFF' + [header, ...lines].map(l => l.map(q).join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    const rangeTag = () => `${ymd(parseInputDate($('dateFrom').value))}_${ymd(parseInputDate($('dateTo').value))}`;

    function exportAgents() {
        if (!state.rows.length) return;
        const header = ['Nhân viên', 'Tổng gọi', 'Liên hệ được', 'Hẹn gặp', 'Tỷ lệ hẹn (%)', 'Gọi lại sau', 'Khách bận', 'Không nghe máy', 'Sai số', 'Thuê bao', 'Từ chối', 'Khác', 'Giờ gọi đầu', 'Giờ gọi cuối'];
        const lines = summarizeByAgent(state.rows).map(g => {
            const mm = minMax(g.rows, r => r.at.getTime());
            return [g.name, g.t.total, g.t.connected, g.t.hen_gap, Math.round(g.t.rateHen * 10) / 10, g.t.goi_lai, g.t.ban,
                g.t.khong_nghe, g.t.sai_so, g.t.thue_bao, g.t.tu_choi, g.t.khac, dmyHm(mm.min), dmyHm(mm.max)];
        });
        downloadCsv(`tong-hop-telesale_${rangeTag()}.csv`, header, lines);
    }
    function exportLog() {
        const list = filteredLog();
        if (!list.length) return;
        const header = ['Giờ gọi', 'Nhân viên', 'Khách hàng', 'SĐT', 'Kết quả', 'Giờ gọi lại', 'Thời lượng (giây)', 'Ghi chú'];
        const lines = list.map(r => [dmyHm(r.at), r.agentName, r.customer, r.phone, RES[r.resultKey].label, r.cb ? dmyHm(r.cb) : '', r.duration || '', r.note]);
        downloadCsv(`nhat-ky-cuoc-goi_${rangeTag()}.csv`, header, lines);
    }

    /* ---------- Nhân viên ---------- */
    async function loadAgents() {
        try {
            const list = unwrap(await fetchJson(API.agents));
            fillAgents(list.map(a => ({
                id: String(a.id != null ? a.id : (a.user_id != null ? a.user_id : a.agent_id)),
                name: a.name || a.full_name || a.username || a.agent_name || ('NV #' + a.id)
            })));
            state.agentsFromApi = true;
        } catch (e) {
            console.warn(e);
            showNotice(e.message + ' Danh sách nhân viên sẽ lấy tạm từ dữ liệu cuộc gọi.');
        }
    }
    function fillAgents(list) {
        const sel = $('agentSelect'), cur = sel.value;
        sel.innerHTML = '<option value="">Tất cả nhân viên</option>'
            + list.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
        sel.value = list.some(a => a.id === cur) ? cur : '';
    }
    function fillAgentsFromRows(rows) {
        if ($('agentSelect').value) return; // đang lọc 1 nhân viên - giữ nguyên danh sách
        const map = new Map();
        rows.forEach(r => { if (r.agentId !== '') map.set(r.agentId, r.agentName); });
        if (map.size) fillAgents([...map].map(([id, name]) => ({ id, name })));
    }

    /* ---------- Chạy báo cáo ---------- */
    function setLoading(on) {
        $('btnReport').disabled = on;
        $('btnReportText').textContent = on ? 'Đang tải...' : 'Xem báo cáo';
        $('reportBody').style.opacity = on ? '.5' : '1';
    }

    async function runReport() {
        const from = parseInputDate($('dateFrom').value), to = parseInputDate($('dateTo').value);
        if (!from || !to) { Swal.fire({ icon: 'warning', title: 'Thiếu ngày', text: 'Chọn đủ Từ ngày và Đến ngày.' }); return; }
        if (from > to) { Swal.fire({ icon: 'warning', title: 'Sai khoảng ngày', text: 'Từ ngày phải trước hoặc bằng Đến ngày.' }); return; }
        const agent = $('agentSelect').value;
        state.cache.clear();
        if (state.agentsFromApi) showNotice('');
        setLoading(true);
        let ok = false;
        try {
            const rows = await loadRange(from, to, agent);
            const len = Math.round((startOfDay(to) - startOfDay(from)) / 864e5) + 1;
            const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(len - 1));
            let prev = null;
            try { prev = await loadRange(prevFrom, prevTo, agent); } catch (_) { /* không bắt buộc */ }
            state.rows = rows;
            state.range = { from, to };
            state.oneDay = len === 1;
            state.logPage = 1;
            if (!state.agentsFromApi) fillAgentsFromRows(rows);
            renderKpi(rows, prev);
            renderResultStrip(rows);
            $('agentTable').innerHTML = agentTableHtml(rows, len === 1, true);
            drawHourAndResult(rows);
            renderCallbacks(rows);
            renderLog();
            ok = true;
        } catch (e) {
            showError(e);
        } finally {
            setLoading(false);
        }
        if (ok) { state.selected = null; await renderPeriod(); }
    }

    function setQuickRange(days) {
        const today = startOfDay(new Date());
        $('dateTo').value = ymd(today);
        $('dateFrom').value = ymd(addDays(today, days === 0 ? 0 : -(days - 1)));
        document.querySelectorAll('.quick-btn').forEach(b => {
            const on = Number(b.dataset.days) === days;
            b.classList.toggle('bg-red-700', on);
            b.classList.toggle('text-white', on);
            b.classList.toggle('border-red-700', on);
        });
    }

    /* ---------- Khởi tạo ---------- */
    document.addEventListener('DOMContentLoaded', async () => {
        refreshIcons();
        $('logResult').innerHTML = '<option value="">Tất cả kết quả</option>'
            + RESULTS.map(r => `<option value="${r.key}">${esc(r.label)}</option>`).join('');

        $('btnReport').addEventListener('click', runReport);
        $('agentSelect').addEventListener('change', runReport);
        $('quickRange').addEventListener('click', e => {
            const b = e.target.closest('.quick-btn');
            if (!b) return;
            setQuickRange(Number(b.dataset.days));
            runReport();
        });
        ['dateFrom', 'dateTo'].forEach(id => $(id).addEventListener('change', () =>
            document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('bg-red-700', 'text-white', 'border-red-700'))));
        $('periodTabs').addEventListener('click', e => {
            const b = e.target.closest('.period-tab');
            if (!b || b.dataset.period === state.period) return;
            state.period = b.dataset.period;
            state.selected = null;
            renderPeriod();
        });
        $('logResult').addEventListener('change', () => { state.logPage = 1; renderLog(); });
        $('logSearch').addEventListener('input', () => { state.logPage = 1; renderLog(); });
        $('logPager').addEventListener('click', e => {
            const b = e.target.closest('button[data-page]');
            if (!b || b.disabled) return;
            state.logPage = Number(b.dataset.page);
            renderLog();
        });
        // Đổi cách tính trung bình -> chỉ vẽ lại bảng tại chỗ (không gọi API, không ghi DB)
        $('agentTable').addEventListener('change', e => {
            if (e.target.id !== 'avgModeSelect') return;
            state.avgMode = e.target.value;
            $('agentTable').innerHTML = agentTableHtml(state.rows, !!state.oneDay, true);
        });
        $('btnExportAgents').addEventListener('click', exportAgents);
        $('btnExportLog').addEventListener('click', exportLog);

        // Vẽ lại biểu đồ khi đổi giao diện sáng/tối
        let t = null;
        new MutationObserver(() => {
            clearTimeout(t);
            t = setTimeout(() => {
                if (state.buckets.length) { drawTrend(); drawCompare(); }
                if (state.rows.length) drawHourAndResult(state.rows);
            }, 150);
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

        setQuickRange(0); // mặc định: hôm nay - phục vụ báo cáo cuối ngày
        await loadAgents();
        runReport();
    });
})();