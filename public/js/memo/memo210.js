/* ==========================================================================
   memo210.js (public/js/memo/) - Quy tắc thưởng thi đua Memo 00210/AD/2026
   "Đỉnh cao hiệu suất, rinh ngay quà lớn" (hồ sơ nộp + phát hành 01/10 - 31/12/2026)

   Dùng chung cho fyc.html (xem trước / lưu) và sales.html (cộng dồn cả quý).
   LƯU Ý:
   - Đây là IP XÉT THƯỞNG, KHÔNG phải hoa hồng thực lãnh.
   - IP = phí khách hàng THỰC ĐÓNG (đóng nửa năm: phí năm / 2, đóng quý: phí năm / 4).
   - Memo 00210 hoàn toàn ĐỘC LẬP với Memo 00110 (không dùng chung dữ liệu tính).

   Quy tắc chính (theo bản ĐIỀU CHỈNH Memo 00210 ngày 13/10/2026):
   - Hồ sơ hợp lệ để tính IP: nộp từ 01/10/2026 đến 31/12/2026 và phát hành đến hết 31/12/2026;
     sản phẩm chính không thuộc PRU-Thiết thực / PRU-Tương lai tươi sáng / PRU-Cuộc sống bình an;
     IP chính từ 3 triệu; có từ 02 sản phẩm bán cùng hoặc IP bán cùng từ 1 triệu.
   - Phần "hỗ trợ đặc biệt" (hệ số nhân IP) CHỈ áp dụng cho hồ sơ nộp VÀ phát hành CÙNG MỘT THÁNG;
     hồ sơ nộp tháng này, phát hành tháng sau vẫn được tính IP nhưng chỉ x1 (xem CFG.crossMonthValid).
   - Hệ số nhân IP theo tháng:
       Tháng 10: x2 cho mọi hồ sơ hợp lệ
       Tháng 11: Yên Tâm Vui Khoẻ x2, các sản phẩm khác x1.5
       Tháng 12: chỉ Yên Tâm Vui Khoẻ x2, các sản phẩm khác x1
     Riêng PRU-Đầu Tư Vững Tiến (ULR9): tháng 10, 11 chỉ được nhân khi TỔNG IP của hồ sơ từ 20 triệu
     trở lên (1 hồ sơ); dưới 20 triệu thì x1. (Bản điều chỉnh bỏ điều kiện số tiền bảo hiểm 2 tỷ.)
   - Bản điều chỉnh không còn nêu trần 200 triệu phần IP nhân thêm của tháng 11
     (có thể đặt lại bằng CFG.novExtraCap nếu memo quy định lại).
   - Hợp đồng chia 50-50: tất cả IP đều chia theo tỷ lệ.
   - Quà theo tổng IP tính thưởng cả quý: 600 - dưới 900 triệu: iPhone 18 Pro Max;
     từ 900 triệu: iPhone Duo (mỗi TVV chỉ nhận tối đa 1 quà, không quy đổi thành tiền).
   ========================================================================== */
(function (global) {
    'use strict';

    const CFG = {
        so: 'Memo 00210/AD/2026',
        start: '2026-10-01',
        end: '2026-12-31',
        months: ['2026-10', '2026-11', '2026-12'],
        minMainIP: 3000000,       // IP sản phẩm chính tối thiểu
        minRiderIP: 1000000,      // hoặc tổng IP sản phẩm bán cùng tối thiểu
        minRiderCount: 2,         // hoặc có ít nhất 02 sản phẩm bán cùng
        ulrMinIP: 20000000,       // PRU-Đầu Tư Vững Tiến: tổng IP tối thiểu / 1 hồ sơ để được nhân hệ số
        novExtraCap: null,        // trần phần IP nhân thêm tháng 11 (bản điều chỉnh không còn trần; đặt số để bật lại)
        crossMonthValid: true,    // true: hồ sơ nộp khác tháng phát hành vẫn được tính IP (x1); false: coi là không hợp lệ
        // Xếp từ cao xuống thấp
        prizes: [
            { min: 900000000, name: 'iPhone Duo 256GB' },
            { min: 600000000, name: 'iPhone 18 Pro Max 256GB' }
        ]
    };

    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
    const dateOnly = (d) => (d ? String(d).slice(0, 10) : '');
    const monthKey = (d) => dateOnly(d).slice(0, 7);
    const fmtDate = (d) => dateOnly(d).split('-').reverse().join('/');
    const monthLabel = (m) => 'tháng ' + String(m || '').slice(5, 7) + '/' + String(m || '').slice(0, 4);

    // IP = phí thực đóng: nửa năm = phí năm / 2, quý = phí năm / 4
    function divisorOf(mode) {
        if (mode === 'HALF' || mode === 'Nửa năm') return 2;
        if (mode === 'QUARTER' || mode === 'Quý') return 4;
        return 1;
    }

    function isExcludedMain(name) {
        const n = norm(name);
        return n.includes('cis1') || n.includes('eus5') || n.includes('cim2') ||
            n.includes('thiet thuc') || n.includes('tuong lai tuoi sang') || n.includes('cuoc song binh an');
    }
    function isYenTam(name) { const n = norm(name); return n.includes('tla9') || n.includes('yen tam vui khoe'); }
    function isULR9(name) { const n = norm(name); return n.includes('ulr9') || n.includes('dau tu vung tien'); }

    function normRiders(list) {
        return (Array.isArray(list) ? list : []).map(r => ({
            name: String((r && (r.name || r.ten || r.productName)) || ''),
            premium: Number(r && (r.premium != null ? r.premium : (r.phi != null ? r.phi : 0))) || 0
        })).filter(r => r.premium > 0);
    }

    // Lấy khối memo đã lưu kèm hợp đồng (ghi_chu.memo00210) nếu API có trả về
    function getMemoMeta(item) {
        try {
            let m = item.memo00210;
            if (!m) {
                let g = item.ghiChu || item.ghi_chu;
                if (typeof g === 'string') g = JSON.parse(g);
                m = g && g.memo00210;
            }
            return m || null;
        } catch (e) { return null; }
    }

    /**
     * Hệ số nhân IP theo tháng + sản phẩm.
     * recordIP: tổng IP thực đóng của hồ sơ (dùng cho điều kiện PRU-Đầu Tư Vững Tiến từ 20 triệu IP/hồ sơ)
     * sameMonth: hồ sơ nộp và phát hành cùng một tháng (không cùng tháng -> không được nhân)
     */
    function factorFor(month, mainProduct, recordIP, sameMonth) {
        if (!sameMonth) {
            return { factor: 1, note: 'Nộp và phát hành khác tháng: không được hỗ trợ nhân hệ số (vẫn tính IP ×1)' };
        }
        const yenTam = isYenTam(mainProduct);
        const ulr = isULR9(mainProduct);
        const ulrOk = !ulr || (Number(recordIP) || 0) >= CFG.ulrMinIP;
        const ulrNote = 'PRU-Đầu Tư Vững Tiến dưới 20 triệu IP/hồ sơ: không được nhân';
        const m = String(month || '').slice(5, 7);

        if (m === '10') {
            if (!ulrOk) return { factor: 1, note: ulrNote };
            return { factor: 2, note: 'Tháng 10: ×2 cho mọi hồ sơ hợp lệ' };
        }
        if (m === '11') {
            if (yenTam) return { factor: 2, note: 'Tháng 11: PRUYên Tâm Vui khỏe ×2' };
            if (!ulrOk) return { factor: 1, note: ulrNote };
            return { factor: 1.5, note: 'Tháng 11: các sản phẩm khác ×1.5' };
        }
        if (m === '12') {
            if (yenTam) return { factor: 2, note: 'Tháng 12: PRUYên Tâm Vui khỏe ×2' };
            return { factor: 1, note: 'Tháng 12: chỉ PRUYên Tâm Vui khỏe được ×2, sản phẩm khác ×1' };
        }
        return { factor: 1, note: '' };
    }

    /**
     * Phân tích 1 hồ sơ. IP đầu vào là IP THỰC ĐÓNG (đã quy đổi theo phương thức đóng phí).
     * input: { mainProduct, mainIP, riders:[{name, premium}], ngayNop, ngayPhatHanh, month, split }
     *   - month: 'YYYY-MM' (xem trước ở fyc.html); nếu bỏ trống thì lấy theo ngày phát hành.
     */
    function analyze(input) {
        const riders = normRiders(input.riders);
        const mainIP = Number(input.mainIP) || 0;
        const riderIP = riders.reduce((s, r) => s + r.premium, 0);
        const ip = mainIP + riderIP;
        const split = Number(input.split) || 100;
        const ngayNop = dateOnly(input.ngayNop);
        const ngayPH = dateOnly(input.ngayPhatHanh);
        const month = input.month || monthKey(ngayPH);
        // Chưa biết ngày nộp (hợp đồng lưu trước đây / xem trước) -> coi như nộp cùng tháng phát hành
        const sameMonth = !ngayNop || monthKey(ngayNop) === month;

        const checks = [
            { ok: !isExcludedMain(input.mainProduct), short: 'SP chính thuộc nhóm loại trừ',
              text: 'Sản phẩm chính không phải PRU-Thiết thực / PRU-Tương lai tươi sáng / PRU-Cuộc sống bình an' },
            { ok: mainIP >= CFG.minMainIP, short: 'IP sản phẩm chính dưới 3 triệu',
              text: 'IP sản phẩm chính từ 3.000.000đ trở lên (hiện tại: ' + fmt(mainIP) + 'đ)' },
            { ok: riders.length >= CFG.minRiderCount || riderIP >= CFG.minRiderIP, short: 'Chưa đủ sản phẩm bán cùng',
              text: 'Có ít nhất 02 sản phẩm bán cùng, hoặc tổng IP bán cùng từ 1.000.000đ (hiện tại: ' + riders.length + ' sản phẩm, ' + fmt(riderIP) + 'đ)' },
            { ok: CFG.months.includes(month), short: 'Phát hành ngoài 10-12/2026',
              text: 'Hồ sơ phát hành trong 01/10 - 31/12/2026' }
        ];
        if (ngayNop) {
            checks.push({
                ok: ngayNop >= CFG.start && ngayNop <= CFG.end && (!ngayPH || ngayNop <= ngayPH),
                short: 'Nộp hồ sơ ngoài 01/10-31/12/2026',
                text: 'Hồ sơ nộp từ 01/10/2026 đến 31/12/2026, không sau ngày phát hành (nộp: ' + fmtDate(ngayNop) + ')'
            });
            if (!CFG.crossMonthValid) {
                checks.push({
                    ok: sameMonth, short: 'Nộp và phát hành khác tháng',
                    text: 'Hồ sơ nộp và phát hành trong cùng một tháng'
                });
            }
        }
        const valid = checks.every(c => c.ok);

        const f = factorFor(month, input.mainProduct, ip, sameMonth);
        const shareIP = valid ? ip * split / 100 : 0;           // IP sau khi chia tỷ lệ
        const extra = shareIP * (f.factor - 1);                  // phần IP được nhân thêm
        const lines = [{ type: 'main', name: input.mainProduct || '(Sản phẩm chính)', ip: mainIP }]
            .concat(riders.map(r => ({ type: 'rider', name: r.name, ip: r.premium })));

        return {
            month, ip, mainIP, riderIP, split, shareIP, extra, valid, checks, lines,
            factor: f.factor, factorNote: f.note,
            ipTT: shareIP + extra, // IP tính thưởng của hồ sơ (chưa áp trần tháng 11)
            sameMonth, isULR9: isULR9(input.mainProduct), yenTam: isYenTam(input.mainProduct)
        };
    }

    /** Phân tích 1 hợp đồng đã lưu (dữ liệu từ /api/agent/sales) */
    function analyzeContract(item) {
        const div = divisorOf(item.paymentMode);
        const annualRiders = normRiders(item.riders);
        const annualRiderIP = annualRiders.reduce((s, r) => s + r.premium, 0);
        const annualMain = item.mainPremium != null
            ? Number(item.mainPremium) || 0
            : Math.max(0, (Number(item.totalAnnualPremium) || 0) - annualRiderIP);

        const meta = getMemoMeta(item);
        const ngayNop = meta && meta.ngayNopHoSo ? dateOnly(meta.ngayNopHoSo) : '';

        const a = analyze({
            mainProduct: item.mainProduct,
            mainIP: annualMain / div,
            riders: annualRiders.map(r => ({ name: r.name, premium: r.premium / div })),
            ngayNop, ngayPhatHanh: item.issueDate,
            split: Number(item.splitRate) || 100
        });
        return Object.assign(a, {
            contractNumber: item.contractNumber, issueDate: item.issueDate, ngayNop,
            thieuNgayNop: !ngayNop,
            inWindow: CFG.months.includes(monthKey(item.issueDate))
        });
    }

    function prizeFor(total) {
        const prize = CFG.prizes.find(p => total >= p.min) || null;
        const next = [...CFG.prizes].reverse().find(p => total < p.min) || null;
        return { prize, next, missingToNext: next ? next.min - total : 0 };
    }

    /** Cộng dồn cả quý (áp trần 200 triệu phần IP nhân thêm của tháng 11) */
    function summarize(analyses) {
        const byMonth = {};
        CFG.months.forEach(m => { byMonth[m] = { month: m, count: 0, ip: 0, extra: 0, extraCounted: 0, capped: false }; });
        analyses.filter(a => a.valid && byMonth[a.month]).forEach(a => {
            const b = byMonth[a.month];
            b.count++; b.ip += a.shareIP; b.extra += a.extra;
        });
        CFG.months.forEach(m => {
            const b = byMonth[m];
            if (m === '2026-11' && CFG.novExtraCap != null) {
                b.extraCounted = Math.min(b.extra, CFG.novExtraCap);
                b.capped = b.extra > CFG.novExtraCap;
            } else {
                b.extraCounted = b.extra;
            }
        });
        const total = CFG.months.reduce((s, m) => s + byMonth[m].ip + byMonth[m].extraCounted, 0);
        const count = CFG.months.reduce((s, m) => s + byMonth[m].count, 0);
        return Object.assign({ total, count, byMonth }, prizeFor(total));
    }

    global.Memo210 = { CFG, norm, fmt, fmtDate, monthKey, monthLabel, divisorOf, isULR9, isYenTam,
                       factorFor, analyze, analyzeContract, summarize, prizeFor };
})(window);