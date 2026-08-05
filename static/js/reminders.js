// ════════════════════════════════════════
//  TASK REMINDERS — browser notifications
//  Morning summary, evening nudge, and a
//  once-per-day summary when the app opens.
// ════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtns = document.querySelectorAll('.reminder-toggle-btn');
    if (toggleBtns.length === 0) return;

    const STORAGE_KEY = 'reminders_enabled';
    const MORNING_HOUR = 9;
    const EVENING_HOUR = 18;

    const supported = 'Notification' in window;

    function isEnabled() {
        return supported &&
            localStorage.getItem(STORAGE_KEY) === 'true' &&
            Notification.permission === 'granted';
    }

    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function firedToday(slot) {
        return localStorage.getItem(`reminder_fired_${slot}`) === todayStr();
    }

    function markFired(slot) {
        localStorage.setItem(`reminder_fired_${slot}`, todayStr());
    }

    function updateToggleUI() {
        toggleBtns.forEach(btn => {
            btn.classList.toggle('active', isEnabled());
            btn.title = isEnabled() ? 'Workflows active — click to turn off' : 'Workflows & Systems';
        });
    }

    async function fetchSummary() {
        const res = await fetch('/api/todo/today-summary/');
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || 'summary failed');
        return data;
    }

    function notify(title, body) {
        try {
            new Notification(title, { body, icon: '/static/images/logo.svg' });
        } catch (e) {
            // Some mobile browsers only allow notifications from a service worker; fail quietly
            console.warn('Notification failed:', e);
        }
    }

    async function fireSlot(slot) {
        if (firedToday(slot)) return;
        let s;
        try {
            s = await fetchSummary();
        } catch (e) {
            return; // logged out or offline — try again next tick
        }
        markFired(slot);

        if (slot === 'morning' || slot === 'open') {
            if (s.total === 0 && s.missed === 0) return;
            const missedPart = s.missed > 0 ? ` ${s.missed} missed task${s.missed === 1 ? '' : 's'} need attention.` : '';
            notify('⚡ Daily System Overview', `${s.total} task${s.total === 1 ? '' : 's'} today, ${s.completed} done.${missedPart}`);
        } else if (slot === 'evening') {
            if (s.pending === 0) return;
            notify('🌙 Workflow System Check-in', `${s.pending} task${s.pending === 1 ? '' : 's'} still open today. Maintain momentum to complete your system goals.`);
        }
    }

    function tick() {
        if (!isEnabled()) return;
        const h = new Date().getHours();
        if (h >= MORNING_HOUR && h < EVENING_HOUR) {
            fireSlot('morning');
        } else if (h >= EVENING_HOUR) {
            fireSlot('evening');
        }
    }

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!supported) {
                alert('This browser does not support notifications.');
                return;
            }
            if (isEnabled()) {
                localStorage.setItem(STORAGE_KEY, 'false');
            } else {
                const perm = await Notification.requestPermission();
                if (perm === 'granted') {
                    localStorage.setItem(STORAGE_KEY, 'true');
                    notify('🔔 Reminders on', "You'll get a morning summary and an evening nudge while the app is open.");
                } else {
                    alert('Notifications are blocked for this site. Enable them in your browser settings to get reminders.');
                }
            }
            updateToggleUI();
        });
    });

    updateToggleUI();

    if (isEnabled()) {
        // Once-per-day summary on first open, then check the clock every minute
        fireSlot('open');
    }
    setInterval(tick, 60 * 1000);
});
