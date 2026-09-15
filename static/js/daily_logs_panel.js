/**
 * daily_logs_panel.js
 * Controls Column 4: "How was your day?" (Reflection) & "Logs" (8:00 AM - 8:00 PM Timeline).
 */
document.addEventListener('DOMContentLoaded', () => {
    const tabReflection = document.getElementById('col4TabReflection');
    const tabLogs = document.getElementById('col4TabLogs');
    const paneReflection = document.getElementById('col4PaneReflection');
    const paneLogs = document.getElementById('col4PaneLogs');
    const reflectionStatus = document.getElementById('reflection-save-status');
    const logsCounter = document.getElementById('col4-logs-counter');
    const timelineFeed = document.getElementById('col4TimelineFeed');

    if (!tabReflection || !tabLogs || !paneReflection || !paneLogs) return;

    // Detect selected date from URL or default to today
    const urlParams = new URLSearchParams(window.location.search);
    const selectedDate = urlParams.get('date') || '';

    // Standard categories for time audit (matches models.py TimeAuditLog.CATEGORY_CHOICES)
    const AUDIT_CATEGORIES = [
        { code: 'phd', label: 'PhD' },
        { code: 'projects', label: 'Side Projects' },
        { code: 'planning', label: 'Planning' },
        { code: 'life_skills', label: 'Life Skills' },
        { code: 'spiritual', label: 'Spiritual' },
        { code: 'cooking', label: 'Cooking' },
        { code: 'driving', label: 'Driving' },
        { code: 'exercise', label: 'Exercise' },
        { code: 'getting_ready', label: 'Getting Ready' },
        { code: 'phone_call', label: 'Phone Call' },
        { code: 'distracted', label: 'Distracted' },
        { code: 'break', label: 'Break' },
        { code: 'other', label: 'Other' }
    ];

    // Generate all 15-min slots strictly from 8:00 AM (08:00) to 8:00 PM (20:00)
    function generate8to8Slots() {
        const slots = [];
        for (let hour = 8; hour <= 20; hour++) {
            for (let min = 0; min < 60; min += 15) {
                if (hour === 20 && min > 0) break; // stops at 20:00
                const h = String(hour).padStart(2, '0');
                const m = String(min).padStart(2, '0');
                slots.push(`${h}:${m}`);
            }
        }
        return slots;
    }

    const ALL_8TO8_SLOTS = generate8to8Slots(); // 49 slots
    let cachedLoggedSlots = {};

    function getCurrentTimeSlot() {
        const now = new Date();
        const hour = String(now.getHours()).padStart(2, '0');
        const minutes = now.getMinutes();
        const roundedMin = String(Math.floor(minutes / 15) * 15).padStart(2, '0');
        return `${hour}:${roundedMin}`;
    }

    function getCsrfToken() {
        const cookie = document.cookie.split('; ').find(row => row.startsWith('csrftoken='));
        return cookie ? cookie.split('=')[1] : '';
    }

    // ── Switch Column 4 Tabs (Reflection vs Logs) ──
    function setCol4Tab(tab) {
        const isReflection = tab === 'reflection';
        tabReflection.classList.toggle('active', isReflection);
        tabReflection.setAttribute('aria-selected', isReflection ? 'true' : 'false');
        tabLogs.classList.toggle('active', !isReflection);
        tabLogs.setAttribute('aria-selected', isReflection ? 'false' : 'true');

        paneReflection.style.display = isReflection ? 'flex' : 'none';
        paneLogs.style.display = isReflection ? 'none' : 'flex';

        if (reflectionStatus) reflectionStatus.style.display = isReflection ? 'inline' : 'none';
        if (logsCounter) logsCounter.style.display = isReflection ? 'none' : 'inline-block';

        localStorage.setItem('col4_active_tab', tab);

        if (window.syncMobileCol4Tab) {
            window.syncMobileCol4Tab(tab);
        }

        if (!isReflection) {
            loadAuditFeed();
        }
    }
    window.setCol4Tab = setCol4Tab;

    tabReflection.addEventListener('click', () => setCol4Tab('reflection'));
    tabLogs.addEventListener('click', () => setCol4Tab('logs'));

    // ── Render Timeline Feed (8:00 AM to 8:00 PM) ──
    function renderTimelineSlots(slotsMap = {}) {
        if (!timelineFeed) return;
        const currentSlot = getCurrentTimeSlot();
        let loggedCount = 0;

        timelineFeed.innerHTML = ALL_8TO8_SLOTS.map(slot => {
            const item = slotsMap[slot];
            const isLogged = !!(item && item.raw_text && item.raw_text.trim());
            if (isLogged) loggedCount++;

            const textValue = isLogged ? item.raw_text : '';
            const activeCategory = (item && item.category) ? item.category : 'other';
            const isCurrent = slot === currentSlot;

            const optionsHtml = AUDIT_CATEGORIES.map(c => 
                `<option value="${c.code}" ${c.code === activeCategory ? 'selected' : ''}>${c.label}</option>`
            ).join('');

            return `
                <div class="timeline-slot-row ${isCurrent ? 'is-current-slot' : ''} ${isLogged ? 'is-logged' : ''}" data-slot="${slot}">
                    <span class="slot-time-badge">${slot}</span>
                    <input 
                        type="text" 
                        class="slot-input" 
                        data-slot="${slot}" 
                        value="${escapeHtml(textValue)}" 
                        placeholder="${isCurrent ? '⚡ Current: what are you doing?' : 'Log activity...'}" 
                        autocomplete="off"
                    />
                    <select class="slot-cat-select" data-slot="${slot}" title="Category">
                        ${optionsHtml}
                    </select>
                    <span class="slot-save-indicator" id="save-ind-${slot.replace(':', '')}">✓</span>
                </div>
            `;
        }).join('');

        if (logsCounter) {
            logsCounter.textContent = `${loggedCount} logged`;
        }

        // Attach event listeners for slot inputs
        timelineFeed.querySelectorAll('.slot-input').forEach(input => {
            const slot = input.dataset.slot;

            const triggerSave = async () => {
                const text = input.value.trim();
                const row = input.closest('.timeline-slot-row');
                const catSelect = row.querySelector('.slot-cat-select');
                const category = catSelect ? catSelect.value : 'other';
                const indicator = document.getElementById(`save-ind-${slot.replace(':', '')}`);

                const oldEntry = cachedLoggedSlots[slot];
                const oldText = oldEntry ? (oldEntry.raw_text || '').trim() : '';
                if (text === oldText && oldEntry && oldEntry.category === category) return;
                if (!text && !oldText) return;

                try {
                    const res = await fetch('/api/time-audit/save/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCsrfToken()
                        },
                        body: JSON.stringify({
                            date: selectedDate,
                            time_slot: slot,
                            raw_text: text,
                            category: category
                        })
                    });

                    const data = await res.json();
                    if (data.status === 'success') {
                        if (text) {
                            cachedLoggedSlots[slot] = { raw_text: text, category: category };
                            row.classList.add('is-logged');
                        } else {
                            delete cachedLoggedSlots[slot];
                            row.classList.remove('is-logged');
                        }

                        if (indicator) {
                            indicator.classList.add('visible');
                            setTimeout(() => indicator.classList.remove('visible'), 1200);
                        }

                        const currentLogged = Object.values(cachedLoggedSlots).filter(s => s && s.raw_text && s.raw_text.trim()).length;
                        if (logsCounter) {
                            logsCounter.textContent = `${currentLogged} logged`;
                        }
                    }
                } catch (e) {
                    console.error('Failed to save slot log:', e);
                }
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    triggerSave();
                    const nextRow = input.closest('.timeline-slot-row').nextElementSibling;
                    if (nextRow) {
                        const nextInput = nextRow.querySelector('.slot-input');
                        if (nextInput) nextInput.focus();
                    }
                }
            });

            input.addEventListener('blur', triggerSave);
        });

        // Category change listener
        timelineFeed.querySelectorAll('.slot-cat-select').forEach(sel => {
            sel.addEventListener('change', async () => {
                const slot = sel.dataset.slot;
                const row = sel.closest('.timeline-slot-row');
                const textInput = row.querySelector('.slot-input');
                const text = textInput ? textInput.value.trim() : '';
                const newCat = sel.value;

                if (!text) {
                    if (!cachedLoggedSlots[slot]) cachedLoggedSlots[slot] = {};
                    cachedLoggedSlots[slot].category = newCat;
                    return;
                }

                try {
                    const res = await fetch('/api/time-audit/save/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCsrfToken()
                        },
                        body: JSON.stringify({
                            date: selectedDate,
                            time_slot: slot,
                            raw_text: text,
                            category: newCat
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        cachedLoggedSlots[slot] = { raw_text: text, category: newCat };
                        const indicator = document.getElementById(`save-ind-${slot.replace(':', '')}`);
                        if (indicator) {
                            indicator.classList.add('visible');
                            setTimeout(() => indicator.classList.remove('visible'), 1200);
                        }
                    }
                } catch (e) {
                    console.error('Failed to update category:', e);
                }
            });
        });

        // Auto-scroll current slot into view
        const currentSlotEl = timelineFeed.querySelector('.timeline-slot-row.is-current-slot');
        if (currentSlotEl) {
            setTimeout(() => {
                currentSlotEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 250);
        }
    }

    // ── Fetch Audit Data ──
    async function loadAuditFeed() {
        try {
            const dateQuery = selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : '';
            const res = await fetch(`/api/time-audit/today/?slot=${encodeURIComponent(getCurrentTimeSlot())}${dateQuery}`);
            const data = await res.json();
            if (data.status === 'success' && data.slots) {
                cachedLoggedSlots = data.slots;
                renderTimelineSlots(data.slots);
            } else {
                renderTimelineSlots({});
            }
        } catch (e) {
            console.error('Failed to load audit feed:', e);
            renderTimelineSlots({});
        }
    }

    window.loadDailyAuditFeed = loadAuditFeed;

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initialize initial active tab
    const savedTab = localStorage.getItem('col4_active_tab') || 'reflection';
    setCol4Tab(savedTab);
});
