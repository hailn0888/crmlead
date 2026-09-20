// services/pushService.js
// Gửi Web Push tới mọi thiết bị (PC + mobile) của một nhân viên.
// Nếu chưa cài `web-push` hoặc chưa có khóa VAPID trong .env thì tự động "tắt" (không lỗi):
// khi đó thông báo vẫn hiện ở chuông trong app + poll khi đang mở web.
let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* chưa cài web-push */ }

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hailn.0888@gmail.com';

let enabled = !!(webpush && PUBLIC_KEY && PRIVATE_KEY);
if (enabled) {
    try {
        webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    } catch (e) {
        // Khóa placeholder ("...") hoặc VAPID_SUBJECT sai định dạng: tắt push chứ không làm sập server
        enabled = false;
        console.error('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT không hợp lệ -> tắt Web Push:', e.message);
    }
} else {
    console.log('[push] Web Push đang TẮT (thiếu gói web-push hoặc VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).');
}

function isEnabled() { return enabled; }
function getPublicKey() { return enabled ? PUBLIC_KEY : null; }

async function saveSubscription(supabase, userId, subscription, thietBi) {
    const keys = (subscription && subscription.keys) || {};
    if (!userId || !subscription || !subscription.endpoint || !keys.p256dh || !keys.auth) {
        throw new Error('Thông tin đăng ký thông báo không hợp lệ!');
    }
    const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        thiet_bi: (thietBi || '').slice(0, 200),
        last_ok_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (error) throw error;
}

async function removeSubscription(supabase, endpoint) {
    if (!endpoint) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

// payload: { title, body, url, tag, phase, id }
async function sendToUser(supabase, userId, payload) {
    if (!enabled || !userId) return { sent: 0, failed: 0 };
    const { data: subs, error } = await supabase
        .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
    if (error || !subs || !subs.length) return { sent: 0, failed: 0 };

    const body = JSON.stringify(payload);
    let sent = 0, failed = 0;
    await Promise.allSettled(subs.map(async (s) => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                body,
                { TTL: 15 * 60, urgency: 'high' }
            );
            sent++;
        } catch (err) {
            failed++;
            // 404/410 = thiết bị đã gỡ đăng ký -> xóa để khỏi gửi lại
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                await removeSubscription(supabase, s.endpoint);
            } else {
                console.error('[push] Lỗi gửi:', err && (err.statusCode || err.message));
            }
        }
    }));
    return { sent, failed };
}

module.exports = { isEnabled, getPublicKey, saveSubscription, removeSubscription, sendToUser };
