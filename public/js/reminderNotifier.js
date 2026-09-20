/* public/js/reminderNotifier.js
 * Thông báo nhắc lịch gọi lại khách phía trình duyệt:
 *  - Poll /api/reminders/due mỗi 30 giây khi trang đang mở -> toast + thông báo hệ thống + âm báo + huy hiệu
 *  - Đăng ký Web Push (Service Worker) để nhận thông báo cả khi đã đóng trang (PC + mobile)
 * Dùng: ReminderNotifier.start({ onCounts(counts){}, onDue(list){} })  (gọi 1 lần sau khi trang tải)
 */
(function () {
    'use strict';
    if (window.ReminderNotifier) return;

    var POLL_MS = 30000;
    var SEEN_KEY = 'rm_seen_v1';
    var TAB4_URL = '/agents/calls.html?tab=4';
    var S = { timer: null, opts: {}, baseTitle: '', pushActive: false, started: false };

    var PHASE_TITLE = {
        sap: 'Sắp tới giờ gọi lại khách',
        dung_gio: 'Đến giờ gọi lại khách',
        qua_han: 'Quá hạn gọi lại khách'
    };

    function agent() { return localStorage.getItem('userName') || ''; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function api(path, init) {
        return fetch('/api/reminders' + path, init).then(function (r) { return r.json(); });
    }
    function postJson(path, body) {
        return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    function hhmm(iso) {
        var d = new Date(new Date(iso).getTime() + 7 * 3600000); // giờ VN
        return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    }
    function b64ToU8(b64) {
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }

    // ---------------------------------------------------------------- đã báo rồi thì không báo lại
    function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { return {}; } }
    function saveSeen(o) {
        var cut = Date.now() - 2 * 86400000;
        Object.keys(o).forEach(function (k) { if (o[k] < cut) delete o[k]; });
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch (e) { /* đầy bộ nhớ: bỏ qua */ }
    }
    function keyOf(d) { return d.id + ':' + d.phase + ':' + d.thoi_gian_nhac; }

    // ---------------------------------------------------------------- huy hiệu
    function setBadge(n) {
        document.title = n > 0 ? '(' + n + ') ' + S.baseTitle : S.baseTitle;
        try {
            if (navigator.setAppBadge) { if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge(); }
        } catch (e) { /* trình duyệt không hỗ trợ */ }
    }

    // ---------------------------------------------------------------- toast trong trang (không dùng Swal để khỏi đè popup đang mở)
    function ensureToastStyle() {
        if (document.getElementById('rm-toast-style')) return;
        var st = document.createElement('style');
        st.id = 'rm-toast-style';
        st.textContent =
            '#rm-toast-box{position:fixed;top:12px;right:12px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:min(360px,calc(100vw - 24px))}' +
            '.rm-toast{background:#fff;color:#111827;border:1px solid #e5e7eb;border-left:4px solid #d97706;border-radius:10px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.18);font:13px/1.4 system-ui,sans-serif}' +
            '.rm-toast.rm-urgent{border-left-color:#dc2626}' +
            '.dark .rm-toast{background:#1f2937;color:#f3f4f6;border-color:#374151}' +
            '.rm-toast b{display:block;font-size:13px;margin-bottom:2px}' +
            '.rm-toast .rm-act{margin-top:8px;display:flex;gap:8px}' +
            '.rm-toast button{font:600 12px system-ui,sans-serif;border:0;border-radius:8px;padding:5px 12px;cursor:pointer}' +
            '.rm-toast .rm-go{background:#dc2626;color:#fff}' +
            '.rm-toast .rm-x{background:rgba(127,127,127,.18);color:inherit}';
        document.head.appendChild(st);
    }
    function toast(title, body, urgent) {
        ensureToastStyle();
        var box = document.getElementById('rm-toast-box');
        if (!box) { box = document.createElement('div'); box.id = 'rm-toast-box'; document.body.appendChild(box); }
        var el = document.createElement('div');
        el.className = 'rm-toast' + (urgent ? ' rm-urgent' : '');
        el.setAttribute('role', 'alert');
        el.innerHTML = '<b>' + esc(title) + '</b><div>' + esc(body) + '</div>' +
            '<div class="rm-act"><button class="rm-go" type="button">Xem</button><button class="rm-x" type="button">Đóng</button></div>';
        var close = function () { if (el.parentNode) el.parentNode.removeChild(el); };
        el.querySelector('.rm-go').onclick = function () { close(); goToTab4(); };
        el.querySelector('.rm-x').onclick = close;
        box.appendChild(el);
        setTimeout(close, urgent ? 60000 : 15000);
        while (box.children.length > 4) box.removeChild(box.firstChild);
    }

    // ---------------------------------------------------------------- âm báo (WebAudio, không cần file)
    function beep() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            var ctx = new Ctx(), t = ctx.currentTime;
            [880, 1175].forEach(function (f, i) {
                var o = ctx.createOscillator(), g = ctx.createGain();
                o.frequency.value = f; o.type = 'sine';
                g.gain.setValueAtTime(0.0001, t + i * 0.18);
                g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
                o.connect(g); g.connect(ctx.destination);
                o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.17);
            });
            setTimeout(function () { ctx.close(); }, 800);
        } catch (e) { /* trình duyệt chặn phát âm khi chưa tương tác: bỏ qua */ }
    }

    // ---------------------------------------------------------------- thông báo hệ thống khi đang mở trang (chỉ khi chưa có push)
    function systemNotify(title, body, tag, urgent) {
        if (S.pushActive) return; // Web Push đã lo thông báo hệ thống -> tránh báo đôi
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        var opts = { body: body, tag: tag, icon: '/uploads/icon.png', requireInteraction: !!urgent, data: { url: TAB4_URL } };
        var viaSw = navigator.serviceWorker && navigator.serviceWorker.getRegistration
            ? navigator.serviceWorker.getRegistration('/') : Promise.resolve(null);
        viaSw.then(function (reg) {
            if (reg) return reg.showNotification(title, opts);
            var n = new Notification(title, opts);
            n.onclick = function () { window.focus(); goToTab4(); n.close(); };
        }).catch(function () { /* bỏ qua */ });
    }

    function goToTab4() {
        if (typeof window.switchTab === 'function' && /calls\.html/.test(location.pathname)) window.switchTab(4);
        else location.href = TAB4_URL;
    }

    function present(fresh) {
        var urgent = fresh.some(function (d) { return d.phase !== 'sap'; });
        if (fresh.length > 3) {
            var t = 'Bạn có ' + fresh.length + ' nhắc hẹn cần xử lý';
            toast(t, 'Bấm Xem để mở danh sách nhắc lịch.', urgent);
            systemNotify(t, 'Mở danh sách nhắc lịch để xử lý.', 'nhac-group', urgent);
        } else {
            fresh.forEach(function (d) {
                var title = PHASE_TITLE[d.phase] || 'Nhắc lịch';
                var body = (d.ho_ten || d.dien_thoai) + ' - hẹn lúc ' + hhmm(d.thoi_gian_nhac);
                toast(title, body, d.phase !== 'sap');
                systemNotify(title, body, 'nhac-' + d.id + '-' + d.phase, d.phase !== 'sap');
            });
        }
        if (urgent) beep();
    }

    // ---------------------------------------------------------------- poll
    function poll() {
        var a = agent();
        if (!a) return Promise.resolve();
        return api('/due?agent=' + encodeURIComponent(a)).then(function (j) {
            if (!j || !j.success) return;
            setBadge(j.counts.qua_han + j.counts.sap_dung_gio);
            if (S.opts.onCounts) S.opts.onCounts(j.counts);

            var seen = loadSeen();
            var fresh = j.due.filter(function (d) { return !seen[keyOf(d)]; });
            if (!fresh.length) return;
            fresh.forEach(function (d) { seen[keyOf(d)] = Date.now(); });
            saveSeen(seen);
            present(fresh);
            if (S.opts.onDue) S.opts.onDue(fresh);
        }).catch(function () { /* mất mạng: thử lại lần poll sau */ });
    }

    // ---------------------------------------------------------------- Web Push
    function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
    function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
    function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

    function registerSw() {
        if (!('serviceWorker' in navigator)) return Promise.resolve(null);
        return navigator.serviceWorker.register('/sw.js').catch(function (e) { console.warn('[reminder] SW lỗi:', e); return null; });
    }

    // Trả về { supported, iosNeedsInstall, permission, subscribed, serverEnabled }
    function pushState() {
        var st = { supported: pushSupported(), iosNeedsInstall: false, permission: 'Notification' in window ? Notification.permission : 'unsupported', subscribed: false, serverEnabled: true };
        if (isIOS() && !isStandalone()) { st.iosNeedsInstall = true; st.supported = false; return Promise.resolve(st); }
        if (!st.supported) return Promise.resolve(st);
        return api('/push/public-key').then(function (k) {
            st.serverEnabled = !!(k && k.enabled);
            return navigator.serviceWorker.getRegistration('/');
        }).then(function (reg) {
            return reg ? reg.pushManager.getSubscription() : null;
        }).then(function (sub) {
            st.subscribed = !!sub && st.permission === 'granted';
            S.pushActive = st.subscribed;
            return st;
        }).catch(function () { return st; });
    }

    function enablePush() {
        return pushState().then(function (st) {
            if (st.iosNeedsInstall) return { ok: false, reason: 'ios' };
            if (!st.supported) return { ok: false, reason: 'unsupported' };
            if (!st.serverEnabled) return { ok: false, reason: 'server' };
            return Notification.requestPermission().then(function (perm) {
                if (perm !== 'granted') return { ok: false, reason: 'denied' };
                return registerSw().then(function (reg) {
                    if (!reg) return { ok: false, reason: 'sw' };
                    return navigator.serviceWorker.ready.then(function () {
                        return api('/push/public-key');
                    }).then(function (k) {
                        return reg.pushManager.getSubscription().then(function (existing) {
                            return existing || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(k.publicKey) });
                        });
                    }).then(function (sub) {
                        return postJson('/push/subscribe', { agent: agent(), subscription: sub.toJSON(), thiet_bi: navigator.userAgent });
                    }).then(function (r) {
                        if (!r.success) return { ok: false, reason: 'api', message: r.message };
                        S.pushActive = true;
                        return { ok: true };
                    });
                });
            });
        }).catch(function (e) { return { ok: false, reason: 'error', message: e && e.message }; });
    }

    function disablePush() {
        return navigator.serviceWorker.getRegistration('/').then(function (reg) {
            return reg ? reg.pushManager.getSubscription() : null;
        }).then(function (sub) {
            if (!sub) return { ok: true };
            var endpoint = sub.endpoint;
            return sub.unsubscribe().then(function () { return postJson('/push/unsubscribe', { endpoint: endpoint }); })
                .then(function () { S.pushActive = false; return { ok: true }; });
        }).catch(function (e) { return { ok: false, message: e && e.message }; });
    }

    function testPush() { return postJson('/push/test', { agent: agent() }); }

    // ---------------------------------------------------------------- khởi động
    function start(opts) {
        if (S.started) return;
        S.started = true;
        S.opts = opts || {};
        S.baseTitle = document.title;

        registerSw().then(function () { return pushState(); });
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', function (e) {
                if (e.data && e.data.type === 'open-reminders') goToTab4();
            });
        }
        poll();
        S.timer = setInterval(poll, POLL_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    }

    function stop() { if (S.timer) clearInterval(S.timer); S.timer = null; S.started = false; }

    window.ReminderNotifier = { start: start, stop: stop, refresh: poll, pushState: pushState, enablePush: enablePush, disablePush: disablePush, testPush: testPush };
})();