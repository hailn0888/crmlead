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

    // ---------------------------------------------------------------- huy hiệu + nhấp nháy tiêu đề tab
    var flashTimer = null, flashOn = false, urgentCount = 0;
    function refreshTitle() {
        if (urgentCount > 0 && document.hidden) {
            if (!flashTimer) {
                flashTimer = setInterval(function () {
                    flashOn = !flashOn;
                    document.title = flashOn ? '\u23F0 Đến giờ gọi khách!' : '(' + urgentCount + ') ' + S.baseTitle;
                }, 1000);
            }
            return;
        }
        if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
        document.title = urgentCount > 0 ? '(' + urgentCount + ') ' + S.baseTitle : S.baseTitle;
    }
    function setBadge(n) {
        urgentCount = n;
        refreshTitle();
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
            '#rm-toast-box{position:fixed;top:14px;right:14px;z-index:99999;display:flex;flex-direction:column;gap:10px;width:min(440px,calc(100vw - 24px))}' +
            '@media (max-width:600px){#rm-toast-box{left:12px;right:12px;top:10px;width:auto}}' +
            '@keyframes rmIn{from{transform:translateY(-14px);opacity:0}to{transform:none;opacity:1}}' +
            '.rm-toast{background:#fff;color:#111827;border:1px solid #e5e7eb;border-left:6px solid #d97706;border-radius:14px;padding:16px 18px;box-shadow:0 12px 34px rgba(0,0,0,.28);font:15px/1.45 system-ui,sans-serif;animation:rmIn .25s ease-out}' +
            '.rm-toast.rm-urgent{border-left-color:#dc2626}' +
            '.dark .rm-toast{background:#1f2937;color:#f3f4f6;border-color:#374151}' +
            '.rm-toast .rm-t{font-size:17px;font-weight:800;margin-bottom:6px}' +
            '.rm-toast .rm-n{font-size:16px;font-weight:700}' +
            '.rm-toast .rm-p{font-size:15px;margin-top:2px}' +
            '.rm-toast .rm-p a{color:#dc2626;font-weight:700;text-decoration:none}' +
            '.rm-toast .rm-note{margin-top:6px;font-size:13px;opacity:.85}' +
            '.rm-toast .rm-hint{margin-top:8px;font-size:12px;color:#b45309}' +
            '.rm-toast .rm-act{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}' +
            '.rm-toast .rm-act > *{font:700 14px system-ui,sans-serif;border:0;border-radius:10px;padding:10px 16px;cursor:pointer;text-decoration:none;text-align:center;line-height:1.2}' +
            '.rm-toast .rm-call{background:#059669;color:#fff}' +
            '.rm-toast .rm-go{background:#dc2626;color:#fff}' +
            '.rm-toast .rm-snz{background:#fef3c7;color:#92400e}' +
            '.rm-toast .rm-x{background:rgba(127,127,127,.18);color:inherit}';
        document.head.appendChild(st);
    }

    // o = { title, name, phone, note, urgent, id (nhắc hẹn), group (true: thông báo gộp) }
    function toast(o) {
        ensureToastStyle();
        var box = document.getElementById('rm-toast-box');
        if (!box) { box = document.createElement('div'); box.id = 'rm-toast-box'; document.body.appendChild(box); }
        var el = document.createElement('div');
        el.className = 'rm-toast' + (o.urgent ? ' rm-urgent' : '');
        el.setAttribute('role', 'alert');
        var html = '<div class="rm-t">' + esc(o.title) + '</div>';
        if (o.name) html += '<div class="rm-n">' + esc(o.name) + '</div>';
        if (o.phone) html += '<div class="rm-p">' + esc(o.phone) + (o.when ? ' &middot; hẹn lúc ' + esc(o.when) : '') + '</div>';
        if (o.text) html += '<div class="rm-p">' + esc(o.text) + '</div>';
        if (o.note) html += '<div class="rm-note">Lưu ý: ' + esc(o.note) + '</div>';
        html += '<div class="rm-act">';
        if (o.phone && !o.group) html += '<a class="rm-call" href="tel:' + esc(o.phone) + '">Gọi ngay</a>';
        html += '<button class="rm-go" type="button">Xem</button>';
        if (o.id && !o.group) html += '<button class="rm-snz" type="button">Hoãn 15 phút</button>';
        html += '<button class="rm-x" type="button">Đóng</button></div>';
        el.innerHTML = html;

        var close = function () { if (el.parentNode) el.parentNode.removeChild(el); };
        el.querySelector('.rm-go').onclick = function () { close(); goToTab4(); };
        el.querySelector('.rm-x').onclick = close;
        var snz = el.querySelector('.rm-snz');
        if (snz) snz.onclick = function () {
            snz.disabled = true; snz.textContent = 'Đang hoãn...';
            postJson('/' + o.id + '/snooze', { agent: agent(), minutes: 15 }).then(function (r) {
                if (r && r.success) {
                    el.querySelector('.rm-act').innerHTML = '<span style="font-weight:700;color:#059669">Đã hoãn 15 phút</span>';
                    setTimeout(close, 1500);
                    if (S.opts.onDue) S.opts.onDue([]);
                    poll();
                } else { snz.disabled = false; snz.textContent = 'Hoãn 15 phút'; }
            }).catch(function () { snz.disabled = false; snz.textContent = 'Hoãn 15 phút'; });
        };
        box.appendChild(el);
        setTimeout(close, o.urgent ? 90000 : 25000);
        while (box.children.length > 4) box.removeChild(box.firstChild);
        return el;
    }

    function hintBlockedSound() {
        var box = document.getElementById('rm-toast-box');
        if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('.rm-toast'), function (el) {
            if (el.querySelector('.rm-hint')) return;
            var h = document.createElement('div');
            h.className = 'rm-hint';
            h.textContent = 'Trình duyệt đang chặn âm thanh: bấm vào trang một lần để bật tiếng báo.';
            el.insertBefore(h, el.querySelector('.rm-act'));
        });
    }

    // ---------------------------------------------------------------- âm báo (WebAudio, không cần file)
    // Trình duyệt CHỈ cho phát âm sau khi người dùng đã bấm/chạm/gõ phím vào trang ít nhất 1 lần;
    // nên mở khóa AudioContext ở cú bấm đầu tiên rồi dùng lại về sau.
    var audioCtx = null;
    function soundEnabled() { return localStorage.getItem('rm_sound') !== 'off'; }
    function setSound(on) { try { localStorage.setItem('rm_sound', on ? 'on' : 'off'); } catch (e) { /* bỏ qua */ } }
    function getCtx() {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        if (!audioCtx) { try { audioCtx = new C(); } catch (e) { return null; } }
        return audioCtx;
    }
    function unlockAudio() {
        var c = getCtx();
        if (c && c.state !== 'running') { try { c.resume(); } catch (e) { /* bỏ qua */ } }
    }
    function playPattern(c, level) {
        var urgent = level === 'urgent';
        var pulses = urgent ? 3 : 1, vol = urgent ? 0.5 : 0.25, t0 = c.currentTime + 0.02;
        for (var k = 0; k < pulses; k++) {
            [880, 1175].forEach(function (f, i) {
                var t = t0 + k * 0.7 + i * 0.2;
                var o = c.createOscillator(), g = c.createGain();
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
                o.connect(g); g.connect(c.destination);
                o.start(t); o.stop(t + 0.2);
            });
        }
    }
    // level: 'urgent' (đến giờ / quá hạn: 3 hồi) | 'soft' (sắp tới giờ: 1 hồi). Trả về Promise<boolean> đã phát được chưa.
    function beep(level, force) {
        if (!force && !soundEnabled()) return Promise.resolve(true);
        var c = getCtx();
        if (!c) return Promise.resolve(false);
        if (c.state === 'running') { playPattern(c, level); return Promise.resolve(true); }
        return new Promise(function (resolve) {
            var done = false;
            var finish = function (v) { if (!done) { done = true; resolve(v); } };
            try {
                c.resume().then(function () {
                    if (c.state === 'running') { if (!done) playPattern(c, level); finish(true); } else finish(false);
                }).catch(function () { finish(false); });
            } catch (e) { finish(false); }
            setTimeout(function () { finish(false); }, 400);
        });
    }
    function soundState() {
        return { on: soundEnabled(), unlocked: !!audioCtx && audioCtx.state === 'running', supported: !!(window.AudioContext || window.webkitAudioContext) };
    }
    function testSound() {
        unlockAudio();
        return beep('urgent', true).then(function (ok) { var st = soundState(); st.ok = ok; return st; });
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
            toast({ title: t, text: 'Bấm Xem để mở danh sách nhắc lịch.', urgent: urgent, group: true });
            systemNotify(t, 'Mở danh sách nhắc lịch để xử lý.', 'nhac-group', urgent);
        } else {
            fresh.forEach(function (d) {
                var title = PHASE_TITLE[d.phase] || 'Nhắc lịch';
                toast({ title: title, name: d.ho_ten || '', phone: d.dien_thoai, when: hhmm(d.thoi_gian_nhac), note: d.ghi_chu, urgent: d.phase !== 'sap', id: d.id });
                systemNotify(title, (d.ho_ten || d.dien_thoai) + ' - hẹn lúc ' + hhmm(d.thoi_gian_nhac), 'nhac-' + d.id + '-' + d.phase, d.phase !== 'sap');
            });
        }
        beep(urgent ? 'urgent' : 'soft').then(function (ok) {
            if (!ok) { hintBlockedSound(); if (S.opts.onSoundBlocked) S.opts.onSoundBlocked(); }
        });
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

    function testPush(delaySeconds) { return postJson('/push/test', { agent: agent(), delay: delaySeconds || 0 }); }

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
        ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
            document.addEventListener(ev, unlockAudio, { passive: true });
        });
        poll();
        S.timer = setInterval(poll, POLL_MS);
        document.addEventListener('visibilitychange', function () { refreshTitle(); if (!document.hidden) poll(); });
    }

    function stop() { if (S.timer) clearInterval(S.timer); S.timer = null; S.started = false; }

    window.ReminderNotifier = {
        start: start, stop: stop, refresh: poll,
        pushState: pushState, enablePush: enablePush, disablePush: disablePush, testPush: testPush,
        soundState: soundState, testSound: testSound, setSound: setSound, soundEnabled: soundEnabled
    };
})();
