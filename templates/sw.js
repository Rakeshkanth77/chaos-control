// ════════════════════════════════════════
//  Service Worker — offline shell + push
//  Served from / so it controls the whole origin.
// ════════════════════════════════════════

const CACHE = 'todo-shell-v1';
const OFFLINE_URL = '/offline/';

// Static assets safe to cache-first (versioned or immutable).
const PRECACHE = [
    OFFLINE_URL,
    '/static/css/styles.css',
    '/static/images/logo.svg',
    '/static/images/icon-192.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Never cache authenticated HTML or API responses — could leak stale/other-user data.
    // Navigations: network-first, fall back to the offline page when disconnected.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Static assets: cache-first, then network (and cache the result).
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            caches.match(req).then((cached) =>
                cached || fetch(req).then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy));
                    return res;
                }).catch(() => cached)
            )
        );
    }
});

// ── Push notifications ──
self.addEventListener('push', (event) => {
    let data = { title: 'to-do', body: 'You have tasks waiting.' };
    try {
        if (event.data) data = { ...data, ...event.data.json() };
    } catch (e) { /* plain-text or empty payload */ }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/static/images/icon-192.png',
            badge: '/static/images/icon-192.png',
            tag: data.tag || 'todo-reminder',
        })
    );
});

// ── 15-minute audit slot prompts ──
// The page raises these via registration.showNotification (see base.html) so the
// prompt still lands when the tab is backgrounded. Tapping the prediction action
// saves the slot here, without the app ever coming to the foreground.
function saveSlotFromNotification(data) {
    return fetch('/api/time-audit/save/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': data.csrfToken || '',
        },
        body: JSON.stringify({
            time_slot: data.slot,
            raw_text: data.text,
            category: data.category || undefined,
            source: 'notification',
        }),
    }).catch(() => { /* offline — the slot can still be backfilled in the app */ });
}

function openApp(slot) {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
            if ('focus' in client) {
                if (slot) client.postMessage({ type: 'open-quick-log', slot: slot });
                return client.focus();
            }
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
    });
}

self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data || {};
    event.notification.close();

    if (event.action === 'log-prediction' && data.slot && data.text) {
        event.waitUntil(saveSlotFromNotification(data));
        return;
    }

    event.waitUntil(openApp(data.slot));
});
