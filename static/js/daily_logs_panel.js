/**
 * daily_logs_panel.js
 * Controls Column 4 merged panel: "How was your day?" (Reflection) & "Logs" (Visual Day Timetable Schedule & 15-min Slots).
 */
document.addEventListener('DOMContentLoaded', () => {
    const tabReflection = document.getElementById('col4TabReflection');
    const tabLogs = document.getElementById('col4TabLogs');
    const paneReflection = document.getElementById('col4PaneReflection');
    const paneLogs = document.getElementById('col4PaneLogs');
    const reflectionStatus = document.getElementById('reflection-save-status');
    const logsCounter = document.getElementById('col4-logs-counter');
    const subviewToggle = document.getElementById('col4SubviewToggle');
    const btnSubTimetable = document.getElementById('col4SubTimetable');
    const btnSubSlots = document.getElementById('col4SubSlots');
    const timetableContainer = document.getElementById('col4TimetableContainer');
    const slotsContainer = document.getElementById('col4SlotsContainer');
    const timelineFeed = document.getElementById('col4TimelineFeed');

    // Timetable canvas elements
    const timetableHoursAxis = document.getElementById('timetableHoursAxis');
    const timetableGridCanvas = document.getElementById('timetableGridCanvas');
    const timetableDayName = document.getElementById('timetableDayName');
    const timetableDayNumber = document.getElementById('timetableDayNumber');
    const timetableMonthYear = document.getElementById('timetableMonthYear');

    // Modal elements
    const modalBackdrop = document.getElementById('timetableModalBackdrop');
    const modalHeaderLabel = document.getElementById('timetableModalHeaderLabel');
    const modalTitleInput = document.getElementById('timetableModalTitleInput');
    const modalStartSelect = document.getElementById('timetableModalStartSlot');
    const modalEndSelect = document.getElementById('timetableModalEndSlot');
    const modalCategorySelect = document.getElementById('timetableModalCategory');
    const btnModalSave = document.getElementById('btnTimetableModalSave');
    const btnModalDelete = document.getElementById('btnTimetableModalDelete');
    const btnModalCancel = document.getElementById('btnTimetableModalCancel');
    const btnModalClose = document.getElementById('btnTimetableModalClose');

    if (!tabReflection || !tabLogs || !paneReflection || !paneLogs) return;

    // Detect selected date from URL or default to today
    const urlParams = new URLSearchParams(window.location.search);
    const selectedDate = urlParams.get('date') || '';

    // Standard categories for time audit
    const AUDIT_CATEGORIES = [
        { code: 'phd', label: 'PhD / Study / Classes', theme: 'theme-coral' },
        { code: 'exercise', label: 'Exercise / Gym', theme: 'theme-blue' },
        { code: 'projects', label: 'Side Projects / Jobs', theme: 'theme-purple' },
        { code: 'spiritual', label: 'Spiritual', theme: 'theme-teal' },
        { code: 'life_skills', label: 'Life Skills', theme: 'theme-teal' },
        { code: 'planning', label: 'Planning', theme: 'theme-coral' },
        { code: 'cooking', label: 'Cooking', theme: 'theme-amber' },
        { code: 'break', label: 'Break', theme: 'theme-amber' },
        { code: 'phone_call', label: 'Phone Call', theme: 'theme-slate' },
        { code: 'driving', label: 'Driving', theme: 'theme-slate' },
        { code: 'getting_ready', label: 'Getting Ready', theme: 'theme-slate' },
        { code: 'distracted', label: 'Distracted', theme: 'theme-slate' },
        { code: 'other', label: 'Other', theme: 'theme-slate' }
    ];

    function getCategoryTheme(categoryCode) {
        const cat = AUDIT_CATEGORIES.find(c => c.code === categoryCode);
        return cat ? cat.theme : 'theme-coral';
    }

    // Generate all 15-min slots from 08:00 to 21:00
    function generate15MinSlots(startH = 8, endH = 21) {
        const slots = [];
        for (let hour = startH; hour <= endH; hour++) {
            for (let min = 0; min < 60; min += 15) {
                if (hour === endH && min > 0) break;
                const h = String(hour).padStart(2, '0');
                const m = String(min).padStart(2, '0');
                slots.push(`${h}:${m}`);
            }
        }
        return slots;
    }

    const ALL_8TO8_SLOTS = generate15MinSlots(8, 20); // 49 slots (08:00 to 20:00)
    const ALL_TIMETABLE_SLOTS = generate15MinSlots(8, 21); // 53 slots (08:00 to 21:00)
    let cachedLoggedSlots = {};
    let activeEditingEvent = null;

    function slotToMinutes(slotStr) {
        const parts = slotStr.split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function minutesToSlot(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

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

    // Populate modal time dropdowns
    function populateModalDropdowns() {
        if (!modalStartSelect || !modalEndSelect) return;
        const startOptions = ALL_TIMETABLE_SLOTS.slice(0, -1).map(s => 
            `<option value="${s}">${s}</option>`
        ).join('');
        const endOptions = ALL_TIMETABLE_SLOTS.slice(1).map(s => 
            `<option value="${s}">${s}</option>`
        ).join('');
        modalStartSelect.innerHTML = startOptions;
        modalEndSelect.innerHTML = endOptions;
    }
    populateModalDropdowns();

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
        if (subviewToggle) subviewToggle.style.display = isReflection ? 'none' : 'inline-flex';

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

    // ── Sub-view Switcher: Timetable Schedule vs 15-min Slots List ──
    function setLogsSubView(view) {
        const isTimetable = view === 'timetable';
        if (btnSubTimetable) btnSubTimetable.classList.toggle('active', isTimetable);
        if (btnSubSlots) btnSubSlots.classList.toggle('active', !isTimetable);

        if (timetableContainer) timetableContainer.style.display = isTimetable ? 'flex' : 'none';
        if (slotsContainer) slotsContainer.style.display = isTimetable ? 'none' : 'flex';

        localStorage.setItem('col4_logs_subview', view);
    }

    if (btnSubTimetable) btnSubTimetable.addEventListener('click', () => setLogsSubView('timetable'));
    if (btnSubSlots) btnSubSlots.addEventListener('click', () => setLogsSubView('slots'));

    // ── Date Header Setup for Timetable ──
    function updateTimetableDateHeader() {
        let targetDate;
        if (selectedDate) {
            const [y, m, d] = selectedDate.split('-');
            targetDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        } else {
            targetDate = new Date();
        }

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (timetableDayName) timetableDayName.textContent = days[targetDate.getDay()];
        if (timetableDayNumber) timetableDayNumber.textContent = targetDate.getDate();
        if (timetableMonthYear) timetableMonthYear.textContent = `${months[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
    }

    // ── Render Timetable Schedule Canvas (Matching Screenshot) ──
    function renderTimetableSchedule(slotsMap = {}) {
        if (!timetableHoursAxis || !timetableGridCanvas) return;
        updateTimetableDateHeader();

        const START_HOUR = 8;
        const END_HOUR = 21;
        const TOTAL_HOURS = END_HOUR - START_HOUR; // 13 hours
        const HOUR_HEIGHT = 60; // 60px per hour => 1px per minute

        // 1. Build Left Hour Axis
        let axisHtml = '';
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            const top = (h - START_HOUR) * HOUR_HEIGHT;
            let labelText;
            let isNoon = false;
            if (h === 12) {
                labelText = 'Noon';
                isNoon = true;
            } else {
                labelText = `${String(h).padStart(2, '0')}:00`;
            }
            axisHtml += `<div class="timetable-hour-label ${isNoon ? 'noon-label' : ''}" style="top: ${top}px;">${labelText}</div>`;
        }
        timetableHoursAxis.innerHTML = axisHtml;

        // 2. Build Grid Lines (hour lines and half-hour dashed lines)
        let gridLinesHtml = '';
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            const top = (h - START_HOUR) * HOUR_HEIGHT;
            gridLinesHtml += `<div class="timetable-grid-line" style="top: ${top}px;"></div>`;
            if (h < END_HOUR) {
                gridLinesHtml += `<div class="timetable-grid-subline" style="top: ${top + 30}px;"></div>`;
            }
        }

        // 3. Current Time "Now" Indicator Line
        let nowLineHtml = '';
        const now = new Date();
        const isToday = !selectedDate || selectedDate === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (isToday) {
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const startMins = START_HOUR * 60;
            const endMins = END_HOUR * 60;
            if (nowMins >= startMins && nowMins <= endMins) {
                const nowTop = nowMins - startMins;
                nowLineHtml = `
                    <div class="timetable-now-indicator" style="top: ${nowTop}px;">
                        <span class="timetable-now-dot"></span>
                    </div>
                `;
            }
        }

        // 4. Group Contiguous Slots with same Title & Category into Single Blocks
        const sortedSlots = Object.keys(slotsMap).sort();
        const eventBlocks = [];
        let currentBlock = null;

        ALL_TIMETABLE_SLOTS.forEach(slot => {
            const entry = slotsMap[slot];
            const text = (entry && entry.raw_text) ? entry.raw_text.trim() : '';
            const category = (entry && entry.category) ? entry.category : 'phd';

            if (text) {
                if (currentBlock && 
                    currentBlock.title.toLowerCase() === text.toLowerCase() && 
                    currentBlock.category === category) {
                    // Extend current contiguous block
                    currentBlock.endSlot = minutesToSlot(slotToMinutes(slot) + 15);
                    currentBlock.slots.push(slot);
                } else {
                    // Finish previous block
                    if (currentBlock) eventBlocks.push(currentBlock);
                    // Start new block
                    currentBlock = {
                        title: text,
                        category: category,
                        startSlot: slot,
                        endSlot: minutesToSlot(slotToMinutes(slot) + 15),
                        slots: [slot]
                    };
                }
            } else {
                if (currentBlock) {
                    eventBlocks.push(currentBlock);
                    currentBlock = null;
                }
            }
        });
        if (currentBlock) {
            eventBlocks.push(currentBlock);
        }

        // 5. Render Event Blocks
        let blocksHtml = '';
        eventBlocks.forEach((block, idx) => {
            const startMins = slotToMinutes(block.startSlot) - (START_HOUR * 60);
            const endMins = slotToMinutes(block.endSlot) - (START_HOUR * 60);
            const top = Math.max(0, startMins);
            const height = Math.max(20, endMins - startMins - 3);
            const themeClass = getCategoryTheme(block.category);

            blocksHtml += `
                <div class="timetable-event-block ${themeClass}" 
                     style="top: ${top}px; height: ${height}px;" 
                     data-event-idx="${idx}"
                     title="${escapeHtml(block.title)} (${block.startSlot}-${block.endSlot})">
                    <div class="timetable-event-title">${escapeHtml(block.title)}</div>
                    <div class="timetable-event-time">${block.startSlot}-${block.endSlot}</div>
                </div>
            `;
        });

        timetableGridCanvas.innerHTML = gridLinesHtml + nowLineHtml + blocksHtml;

        // Attach click listeners to event blocks
        timetableGridCanvas.querySelectorAll('.timetable-event-block').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(el.dataset.eventIdx, 10);
                const block = eventBlocks[idx];
                if (block) {
                    openEditModal(block);
                }
            });
        });

        // Attach click listener to grid canvas for quick log
        timetableGridCanvas.onclick = (e) => {
            if (e.target.closest('.timetable-event-block')) return;
            const rect = timetableGridCanvas.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const clickedMinute = Math.floor(clickY / 15) * 15 + (START_HOUR * 60);
            const clampedStart = Math.max(START_HOUR * 60, Math.min((END_HOUR - 1) * 60 + 45, clickedMinute));
            const startSlot = minutesToSlot(clampedStart);
            const endSlot = minutesToSlot(Math.min(clampedStart + 60, END_HOUR * 60));

            openNewModal(startSlot, endSlot);
        };

        // Auto-scroll to current time on load
        if (isToday) {
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const startMins = START_HOUR * 60;
            const targetScroll = Math.max(0, (nowMins - startMins - 60));
            const viewport = document.getElementById('timetableScrollViewport');
            if (viewport) {
                viewport.scrollTop = targetScroll;
            }
        }
    }

    // ── Timetable Modal Actions ──
    function openNewModal(startSlot = '08:00', endSlot = '09:00') {
        activeEditingEvent = null;
        if (modalHeaderLabel) modalHeaderLabel.textContent = 'Log Schedule Block';
        if (modalTitleInput) modalTitleInput.value = '';
        if (modalStartSelect) modalStartSelect.value = startSlot;
        if (modalEndSelect) modalEndSelect.value = endSlot;
        if (modalCategorySelect) modalCategorySelect.value = 'phd';
        if (btnModalDelete) btnModalDelete.style.display = 'none';

        if (modalBackdrop) modalBackdrop.classList.add('show');
        setTimeout(() => {
            if (modalTitleInput) modalTitleInput.focus();
        }, 100);
    }

    function openEditModal(eventBlock) {
        activeEditingEvent = eventBlock;
        if (modalHeaderLabel) modalHeaderLabel.textContent = 'Edit Schedule Block';
        if (modalTitleInput) modalTitleInput.value = eventBlock.title;
        if (modalStartSelect) modalStartSelect.value = eventBlock.startSlot;
        if (modalEndSelect) modalEndSelect.value = eventBlock.endSlot;
        if (modalCategorySelect) modalCategorySelect.value = eventBlock.category;
        if (btnModalDelete) btnModalDelete.style.display = 'inline-block';

        if (modalBackdrop) modalBackdrop.classList.add('show');
        setTimeout(() => {
            if (modalTitleInput) modalTitleInput.focus();
        }, 100);
    }

    function closeModal() {
        if (modalBackdrop) modalBackdrop.classList.remove('show');
        activeEditingEvent = null;
    }

    if (btnModalClose) btnModalClose.addEventListener('click', closeModal);
    if (btnModalCancel) btnModalCancel.addEventListener('click', closeModal);
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) closeModal();
        });
    }

    // Save block handler
    if (btnModalSave) {
        btnModalSave.addEventListener('click', async () => {
            const title = (modalTitleInput ? modalTitleInput.value : '').trim();
            if (!title) {
                if (modalTitleInput) modalTitleInput.focus();
                return;
            }

            const startSlot = modalStartSelect.value;
            const endSlot = modalEndSelect.value;
            const category = modalCategorySelect.value;

            const startMins = slotToMinutes(startSlot);
            const endMins = slotToMinutes(endSlot);

            if (endMins <= startMins) {
                alert('End time must be after start time.');
                return;
            }

            // Generate covered 15-min slots
            const slotsToSave = [];
            for (let m = startMins; m < endMins; m += 15) {
                slotsToSave.push(minutesToSlot(m));
            }

            // If editing an existing block that covered different slots, clear any removed slots
            if (activeEditingEvent && activeEditingEvent.slots) {
                const removedSlots = activeEditingEvent.slots.filter(s => !slotsToSave.includes(s));
                if (removedSlots.length > 0) {
                    try {
                        await fetch('/api/time-audit/save/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                            body: JSON.stringify({ date: selectedDate, time_slots: removedSlots, raw_text: '' })
                        });
                        removedSlots.forEach(s => delete cachedLoggedSlots[s]);
                    } catch (e) {
                        console.error('Failed to clear removed slots:', e);
                    }
                }
            }

            try {
                const res = await fetch('/api/time-audit/save/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({
                        date: selectedDate,
                        time_slots: slotsToSave,
                        raw_text: title,
                        category: category
                    })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    slotsToSave.forEach(s => {
                        cachedLoggedSlots[s] = { raw_text: title, category: category };
                    });
                    renderTimetableSchedule(cachedLoggedSlots);
                    renderTimelineSlots(cachedLoggedSlots);
                    closeModal();
                } else {
                    alert('Error saving block: ' + (data.message || 'Unknown error'));
                }
            } catch (err) {
                console.error('Failed to save timetable event:', err);
                alert('Failed to save timetable event. Check connection.');
            }
        });
    }

    // Delete block handler
    if (btnModalDelete) {
        btnModalDelete.addEventListener('click', async () => {
            if (!activeEditingEvent || !activeEditingEvent.slots) return;
            if (!confirm(`Delete "${activeEditingEvent.title}" (${activeEditingEvent.startSlot}-${activeEditingEvent.endSlot})?`)) return;

            try {
                const res = await fetch('/api/time-audit/save/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({
                        date: selectedDate,
                        time_slots: activeEditingEvent.slots,
                        raw_text: ''
                    })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    activeEditingEvent.slots.forEach(s => delete cachedLoggedSlots[s]);
                    renderTimetableSchedule(cachedLoggedSlots);
                    renderTimelineSlots(cachedLoggedSlots);
                    closeModal();
                }
            } catch (err) {
                console.error('Failed to delete timetable event:', err);
            }
        });
    }

    // ── Render Timeline Feed (Granular 15-min Slot List) ──
    function renderTimelineSlots(slotsMap = {}) {
        if (!timelineFeed) return;
        const currentSlot = getCurrentTimeSlot();
        let loggedCount = 0;

        timelineFeed.innerHTML = ALL_8TO8_SLOTS.map(slot => {
            const item = slotsMap[slot];
            const isLogged = !!(item && item.raw_text && item.raw_text.trim());
            if (isLogged) loggedCount++;

            const textValue = isLogged ? item.raw_text : '';
            const activeCategory = (item && item.category) ? item.category : 'phd';
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
                        placeholder="${isCurrent ? '⚡ Current block: what are you doing?' : 'Log activity...'}" 
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

        // Attach event listeners for slot row inputs
        timelineFeed.querySelectorAll('.slot-input').forEach(input => {
            const slot = input.dataset.slot;

            const triggerSave = async () => {
                const text = input.value.trim();
                const row = input.closest('.timeline-slot-row');
                const catSelect = row.querySelector('.slot-cat-select');
                const category = catSelect ? catSelect.value : 'phd';
                const indicator = document.getElementById(`save-ind-${slot.replace(':', '')}`);

                const oldEntry = cachedLoggedSlots[slot];
                const oldText = oldEntry ? (oldEntry.raw_text || '').trim() : '';
                if (text === oldText && oldEntry && oldEntry.category === category) return;
                if (!text && !oldText) return;

                try {
                    const res = await fetch('/api/time-audit/save/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
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

                        renderTimetableSchedule(cachedLoggedSlots);
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

        // Category change listeners
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
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
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
                        renderTimetableSchedule(cachedLoggedSlots);
                    }
                } catch (e) {
                    console.error('Failed to update category:', e);
                }
            });
        });
    }

    // ── Fetch Audit Data ──
    async function loadAuditFeed() {
        try {
            const dateQuery = selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : '';
            const res = await fetch(`/api/time-audit/today/?slot=${encodeURIComponent(getCurrentTimeSlot())}${dateQuery}`);
            const data = await res.json();
            if (data.status === 'success' && data.slots) {
                cachedLoggedSlots = data.slots;
                renderTimetableSchedule(data.slots);
                renderTimelineSlots(data.slots);
            } else {
                renderTimetableSchedule({});
                renderTimelineSlots({});
            }
        } catch (e) {
            console.error('Failed to load audit feed:', e);
            renderTimetableSchedule({});
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

    // Initialize subview preference (default to timetable like screenshot)
    const savedSubView = localStorage.getItem('col4_logs_subview') || 'timetable';
    setLogsSubView(savedSubView);

    // Initialize initial active tab
    const savedTab = localStorage.getItem('col4_active_tab') || 'reflection';
    setCol4Tab(savedTab);
});
