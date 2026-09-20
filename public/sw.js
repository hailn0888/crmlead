// public/sw.js  (phải nằm ở gốc web để scope = "/")
// Nhận Web Push khi trang đã đóng và hiển thị thông báo hệ thống trên PC / Android / iPhone (PWA).
const DEFAULT_URL = '/agents/calls.html?tab=4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; }
    catch (e) { d = { body: event.data ? event.data.text() : '' }; }

    const urgent = d.phase === 'dung_gio' || d.phase === 'qua_han';
    event.waitUntil(self.registration.showNotification(d.title || 'Nhắc lịch chăm sóc khách hàng', {
        body: d.body || '',
        tag: d.tag || undefined,      // cùng tag = thay thế thông báo cũ, không chồng chất
        renotify: !!d.tag,
        icon: '/uploads/icon.png',
        badge: '/uploads/icon.png',
        vibrate: [200, 100, 200],
        requireInteraction: urgent,   // PC: giữ thông báo cho tới khi bấm (đến giờ / quá hạn)
        data: { url: d.url || DEFAULT_URL }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || DEFAULT_URL;

    event.waitUntil((async () => {// public/sw.js  (phải nằm ở gốc web để scope = "/")
// Nhận Web Push khi trang đã đóng và hiển thị thông báo hệ thống trên PC / Android / iPhone (PWA).
const DEFAULT_URL = '/agents/calls.html?tab=4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; }
    catch (e) { d = { body: event.data ? event.data.text() : '' }; }

    const urgent = d.phase === 'dung_gio' || d.phase === 'qua_han';
    event.waitUntil(self.registration.showNotification(d.title || 'Nhắc lịch chăm sóc khách hàng', {
        body: d.body || '',
        tag: d.tag || undefined,      // cùng tag = thay thế thông báo cũ, không chồng chất
        renotify: !!d.tag,
        icon: '/uploads/icon.png',
        badge: '/uploads/icon.png',
        vibrate: [200, 100, 200],
        requireInteraction: urgent,   // PC: giữ thông báo cho tới khi bấm (đến giờ / quá hạn)
        data: { url: d.url || DEFAULT_URL }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || DEFAULT_URL;

    event.waitUntil((async () => {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of list) {
            // Đã mở sẵn trang calls -> chuyển thẳng sang Tab 4, không mở thêm cửa sổ
            if (c.url.includes('/agents/calls.html') && 'focus' in c) {
                c.postMessage({ type: 'open-reminders' });
                return c.focus();
            }
        }
        return self.clients.openWindow(url);
    })());
});

        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of list) {
            // Đã mở sẵn trang calls -> chuyển thẳng sang Tab 4, không mở thêm cửa sổ
            if (c.url.includes('/agents/calls.html') && 'focus' in c) {
                c.postMessage({ type: 'open-reminders' });
                return c.focus();
            }
        }
        return self.clients.openWindow(url);
    })());
});