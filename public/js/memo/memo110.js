/* ==========================================================================
   memo110.js (public/js/memo/) - Quy tắc thưởng thi đua Memo 00110/AD/2026
   "Bứt tốc phi mã, chớp cơ hội vàng" (hồ sơ nộp + phát hành 01/10 - 31/10/2026)

   Dùng chung cho fyc.html (xem trước / lưu) và sales.html (cộng dồn cả tháng).
   LƯU Ý: đây là FYC XÉT THƯỞNG (IP tính thưởng), KHÔNG phải hoa hồng thực lãnh.
   ========================================================================== */
(function (global) {
    'use strict';

    const CFG = {
        so: 'Memo 00110/AD/2026',
        start: '2026-10-01',
        end: '2026-10-31',
        minMainIP: 3000000,      // IP sản phẩm chính tối thiểu
        minRiderIP: 1000000,     // hoặc tổng IP sản phẩm bán cùng tối thiểu
        minRiderCount: 2,        // hoặc có ít nhất 02 sản phẩm bán cùng
        cap: 100000000,          // thưởng chính tối đa / TVV
        // Xếp từ cao xuống thấp
        tiers: [
            { min: 90000000, pct: 0.10, tickets: 10, label: 'Từ 90 triệu IP trở lên (10% IP tính thưởng)' },
            { min: 50000000, bonus: 5000000, tickets: 5, label: 'Từ 50 đến dưới 90 triệu IP' },
            { min: 22000000, bonus: 2000000, tickets: 2, label: 'Từ 22 đến dưới 50 triệu IP' },
            { min: 18000000, bonus: 1500000, tickets: 1, label: 'Từ 18 đến dưới 22 triệu IP' }
        ]
    };

    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

    const dateOnly = (d) => (d ? String(d).slice(0, 10) : '');
    const inWindow = (d) => { const s = dateOnly(d); return !!s && s >= CFG.start && s <= CFG.end; };
    function dateError(d) {
        if (!dateOnly(d)) return 'Vui lòng chọn ngày phát hành hợp đồng!';
        if (!inWindow(d)) {
            return 'Lưu FYC xét thưởng theo Memo 00110 chỉ áp dụng cho hợp đồng có ngày phát hành từ 01/10/2026 đến 31/10/2026. ' +
                   'Hãy chọn lại ngày phát hành hoặc bỏ tick "Tính thêm thưởng theo Memo 00110".';
        }
        return '';
    }

    // SP chính bị loại: PRU-Thiết thực (CIS1), PRU-Tương lai tươi sáng (EUS5), PRU-Cuộc sống bình an (CIM2)
    function isExcludedMain(name) {
        const n = norm(name);
        return n.includes('cis1') || n.includes('eus5') || n.includes('cim2') ||
            n.includes('thiet thuc') || n.includes('tuong lai tuoi sang') || n.includes('cuoc song binh an');
    }
    // SP chính PRUYên Tâm Vui khỏe (TLA9)
    function isYenTam(name) { const n = norm(name); return n.includes('tla9') || n.includes('yen tam vui khoe'); }
    // SP bán cùng PRUKhỏe Linh Hoạt
    function isKhoeLinhHoat(name) { return norm(name).includes('khoe linh hoat'); }

    function normRiders(list) {
        return (Array.isArray(list) ? list : []).map(r => ({
            name: String((r && (r.name || r.ten || r.productName)) || ''),
            premium: Number(r && (r.premium != null ? r.premium : (r.phi != null ? r.phi : 0))) || 0
        })).filter(r => r.premium > 0);
    }

    /**
     * Phân tích 1 hồ sơ.
     * input: { mainProduct, mainIP, riders:[{name, premium}] }  (IP gốc, chưa nhân hệ số)
     */
    function analyze(input) {
        const riders = normRiders(input.riders);
        const mainIP = Number(input.mainIP) || 0;
        const riderIP = riders.reduce((s, r) => s + r.premium, 0);
        const yenTam = isYenTam(input.mainProduct);

        const lines = [];
        lines.push({ type: 'main', name: input.mainProduct || '(Sản phẩm chính)', ip: mainIP, factor: yenTam ? 2 : 1 });
        riders.forEach(r => lines.push({
            type: 'rider', name: r.name, ip: r.premium,
            factor: (yenTam || isKhoeLinhHoat(r.name)) ? 2 : 1
        }));
        lines.forEach(l => { l.ipTT = l.ip * l.factor; });
        const ipTT = lines.reduce((s, l) => s + l.ipTT, 0);

        let boostNote = '';
        if (yenTam) boostNote = '×2 tổng IP hồ sơ PRUYên Tâm Vui khỏe (gồm IP sản phẩm bán cùng)';
        else if (lines.some(l => l.type === 'rider' && l.factor === 2)) boostNote = '×2 IP sản phẩm bán cùng PRUKhỏe Linh Hoạt';

        // Điều kiện hồ sơ hợp lệ - xét trên IP gốc
        const checks = [
            { ok: !isExcludedMain(input.mainProduct), short: 'SP chính thuộc nhóm loại trừ',
              text: 'Sản phẩm chính không phải PRU-Thiết thực / PRU-Tương lai tươi sáng / PRU-Cuộc sống bình an' },
            { ok: mainIP >= CFG.minMainIP, short: 'IP sản phẩm chính dưới 3 triệu',
              text: 'IP sản phẩm chính từ 3.000.000đ trở lên (hiện tại: ' + fmt(mainIP) + 'đ)' },
            { ok: riders.length >= CFG.minRiderCount || riderIP >= CFG.minRiderIP, short: 'Chưa đủ sản phẩm bán cùng',
              text: 'Có ít nhất 02 sản phẩm bán cùng, hoặc tổng IP bán cùng từ 1.000.000đ (hiện tại: ' + riders.length + ' sản phẩm, ' + fmt(riderIP) + 'đ)' }
        ];
        const hopLe = checks.every(c => c.ok);

        return { mainIP, riderIP, ipGoc: mainIP + riderIP, ipTT, lines, checks, hopLe, yenTam, boostNote, riderCount: riders.length };
    }

    /**
     * Phân tích 1 hợp đồng đã lưu (dữ liệu từ /api/agent/sales).
     * Chỉ "tính vào tổng tháng" khi phát hành trong 01-31/10/2026 VÀ hồ sơ hợp lệ.
     * Hợp đồng chia 50-50: chia toàn bộ IP xét thưởng theo tỷ lệ chia.
     */
    function analyzeContract(item) {
        const riders = normRiders(item.riders);
        const riderIP = riders.reduce((s, r) => s + r.premium, 0);
        const mainIP = item.mainPremium != null
            ? Number(item.mainPremium) || 0
            : Math.max(0, (Number(item.totalAnnualPremium) || 0) - riderIP);
        const a = analyze({ mainProduct: item.mainProduct, mainIP, riders });
        const split = Number(item.splitRate) || 100;
        const win = inWindow(item.issueDate);
        const counted = win && a.hopLe;
        return Object.assign(a, {
            contractNumber: item.contractNumber, issueDate: item.issueDate,
            split, inWindow: win, counted,
            share: counted ? a.ipTT * split / 100 : 0
        });
    }

    /** Mức thưởng theo TỔNG IP xét thưởng */
    function tierFor(total) {
        const tier = CFG.tiers.find(t => total >= t.min) || null;
        let bonus = 0, tickets = 0;
        if (tier) {
            bonus = Math.min(CFG.cap, tier.pct ? total * tier.pct : tier.bonus);
            tickets = tier.tickets;
        }
        const next = [...CFG.tiers].reverse().find(t => total < t.min) || null;
        return { total, tier, bonus, tickets, next, missingToNext: next ? next.min - total : 0 };
    }

    /** Cộng dồn danh sách kết quả analyzeContract */
    function summarize(analyses) {
        const counted = analyses.filter(a => a.counted);
        const total = counted.reduce((s, a) => s + a.share, 0);
        return Object.assign({ count: counted.length }, tierFor(total));
    }

    global.Memo110 = { CFG, norm, fmt, inWindow, dateError, analyze, analyzeContract, tierFor, summarize };
})(window);