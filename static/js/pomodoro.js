document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const pomoNavBtn = document.getElementById('pomo-nav-btn');
    const pomoNavTimer = document.getElementById('pomo-nav-timer');
    const mobilePomoNavBtn = document.getElementById('mobile-pomo-nav-btn');
    const mobilePomoNavBadge = document.getElementById('mobile-pomo-nav-badge');
    const pomoMiniWidget = document.getElementById('pomoMiniWidget');
    const pomoMiniTimerText = document.getElementById('pomoMiniTimerText');
    const pomoPipBtn = document.getElementById('pomoPipBtn');
    
    const pomoPopup = document.getElementById('pomoPopup');
    const pomoPopupOverlay = document.getElementById('pomoPopupOverlay');
    const closePomoPopup = document.getElementById('close-pomo-popup');
    
    const pomoProgressRing = document.getElementById('pomoProgressRing');
    const pomoTimerText = document.getElementById('pomoTimerText');
    const pomoSessionStatus = document.getElementById('pomoSessionStatus');
    
    const pomoSetupControls = document.getElementById('pomoSetupControls');
    const pomoRunningControls = document.getElementById('pomoRunningControls');
    const pomoCancelBtn = document.getElementById('pomoCancelBtn');
    const pomoPauseBtn = document.getElementById('pomoPauseBtn');
    const pomoPauseIcon = document.getElementById('pomoPauseIcon');
    const pomoPauseText = document.getElementById('pomoPauseText');
    const pomoFinishEarlyBtn = document.getElementById('pomoFinishEarlyBtn');
    const pomoExtend5Btn = document.getElementById('pomoExtend5Btn');
    const pomoExtend10Btn = document.getElementById('pomoExtend10Btn');
    const pomoTaskSelect = document.getElementById('pomoTaskSelect');
    const pomoActiveTaskBanner = document.getElementById('pomoActiveTaskBanner');
    
    const pomoCustomMins = document.getElementById('pomoCustomMins');
    const pomoStartCustomBtn = document.getElementById('pomoStartCustomBtn');
    const pomoPresetBtns = document.querySelectorAll('.pomo-preset-btn');
    
    const pomoLogsList = document.getElementById('pomoLogsList');
    const pomoLogCount = document.getElementById('pomo-log-count');
    
    const pomoPromptOverlay = document.getElementById('pomoPromptOverlay');
    const pomoPromptModal = document.getElementById('pomoPromptModal');
    const promptSessionMins = document.getElementById('promptSessionMins');
    const pomoPromptLogInput = document.getElementById('pomoPromptLogInput');
    const pomoPromptSaveBtn = document.getElementById('pomoPromptSaveBtn');
    const pomoPromptSkipBtn = document.getElementById('pomoPromptSkipBtn');

    // Day/Week/Month Focus History modal DOM refs
    const dayViewOverlay = document.getElementById('dayViewOverlay');
    const dayViewModal = document.getElementById('dayViewModal');
    const dayViewDateEl = document.getElementById('dayViewDate');
    const dayRuler = document.getElementById('dayRuler');
    const dayTrack = document.getElementById('dayTrack');
    const dayNowLine = document.getElementById('dayNowLine');
    const dayDetailEmpty = document.getElementById('dayDetailEmpty');
    const dayDetailContent = document.getElementById('dayDetailContent');
    const dayDetailTime = document.getElementById('dayDetailTime');
    const dayDetailDuration = document.getElementById('dayDetailDuration');
    const dayDetailLog = document.getElementById('dayDetailLog');
    const openDayViewBtn = document.getElementById('openDayViewBtn');
    const closeDayViewBtn = document.getElementById('closeDayViewBtn');

    const focusViewTabDay = document.getElementById('focusViewTabDay');
    const focusViewTabWeek = document.getElementById('focusViewTabWeek');
    const focusViewTabMonth = document.getElementById('focusViewTabMonth');
    const focusNavPrevBtn = document.getElementById('focusNavPrevBtn');
    const focusNavNextBtn = document.getElementById('focusNavNextBtn');
    const focusNavTodayBtn = document.getElementById('focusNavTodayBtn');
    const focusDateDisplay = document.getElementById('focusDateDisplay');
    const focusPanelDay = document.getElementById('focusPanelDay');
    const focusPanelWeek = document.getElementById('focusPanelWeek');
    const focusPanelMonth = document.getElementById('focusPanelMonth');
    const weekStatsRow = document.getElementById('weekStatsRow');
    const weekChartContainer = document.getElementById('weekChartContainer');
    const weekHistoryList = document.getElementById('weekHistoryList');
    const monthStatsRow = document.getElementById('monthStatsRow');
    const monthCalendarGrid = document.getElementById('monthCalendarGrid');
    const monthHistoryList = document.getElementById('monthHistoryList');

    // Circle progress ring math
    const ringCircumference = 282.7; // 2 * pi * 45

    // Local state variables
    let countdownInterval = null;
    let currentSessionId = null;
    let durationSeconds = 0;
    let endTimestamp = 0;
    let isTimerPaused = false;
    let promptSessionId = null;
    let isStatusPollingActive = false;
    let xOffset = 0;
    let yOffset = 0;
    let pipWindowInstance = null;
    let completedLogs = []; // cached from last syncStatus
    let dayViewNowInterval = null;
    let isGracePeriodActive = false;
    let graceCountdownInterval = null;
    let focusHistoryView = 'day';
    let focusHistoryDate = new Date();
    const isPipSupported = 'documentPictureInPicture' in window;

    // Helper to post API data
    async function apiPost(url, data = {}) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.CSRF_TOKEN
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'API request failed');
        }
        return await response.json();
    }

    // Modal Drawer Toggle Controls
    function openPomoPopup() {
        pomoPopup.classList.add('open');
        pomoPopupOverlay.classList.add('open');
        document.body.style.overflow = 'hidden'; // lock scroll
        syncStatus();
    }

    function closePomoPopupPanel() {
        pomoPopup.classList.remove('open');
        pomoPopupOverlay.classList.remove('open');
        document.body.style.overflow = ''; // restore scroll
    }

    if (pomoNavBtn) pomoNavBtn.addEventListener('click', openPomoPopup);
    if (mobilePomoNavBtn) mobilePomoNavBtn.addEventListener('click', openPomoPopup);
    if (closePomoPopup) closePomoPopup.addEventListener('click', closePomoPopupPanel);
    if (pomoPopupOverlay) pomoPopupOverlay.addEventListener('click', closePomoPopupPanel);

    // Audio chime notification fallback (Web Audio API)
    function playChime() {
        const audio = document.getElementById('pomoAlertSound');
        if (audio) {
            audio.play().catch(() => {
                synthesizeSound();
            });
        } else {
            synthesizeSound();
        }
    }

    function synthesizeSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Generate two pleasant chimes (C5 and E5)
            const playTone = (freq, delay, dur) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
                
                gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
                gain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + delay + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + dur);
                
                osc.start(audioCtx.currentTime + delay);
                osc.stop(audioCtx.currentTime + delay + dur);
            };
            
            playTone(523.25, 0, 1.0);     // C5
            playTone(659.25, 0.15, 1.2);  // E5
        } catch (e) {
            console.warn('Web Audio synthesis failed:', e);
        }
    }

    // Format seconds into MM:SS
    function formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // Update circular progress ring
    function updateProgressRing(remaining, total) {
        if (!pomoProgressRing) return;
        if (total <= 0) {
            pomoProgressRing.style.strokeDashoffset = 0;
            return;
        }
        const fraction = remaining / total;
        const offset = (1 - fraction) * ringCircumference;
        pomoProgressRing.style.strokeDashoffset = offset;
    }

    // Starts local timer loop
    function startLocalTimer(remSecs, totalSecs) {
        clearInterval(countdownInterval);
        
        durationSeconds = totalSecs;
        endTimestamp = Date.now() + remSecs * 1000;
        
        updateTimerUI();
        
        countdownInterval = setInterval(() => {
            updateTimerUI();
        }, 200);
    }

    // Ticks down UI local view
    function updateTimerUI() {
        if (isTimerPaused) {
            pomoSessionStatus.textContent = '⏸️ PAUSED — Taking a breather';
            if (pomoPauseIcon) pomoPauseIcon.textContent = '▶️';
            if (pomoPauseText) pomoPauseText.textContent = 'Resume';
            return;
        }

        if (pomoPauseIcon) pomoPauseIcon.textContent = '⏸️';
        if (pomoPauseText) pomoPauseText.textContent = 'Pause';

        const remaining = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
        
        pomoTimerText.textContent = formatTime(remaining);
        updateProgressRing(remaining, durationSeconds);

        // Header indicator update
        if (pomoNavTimer) {
            pomoNavTimer.textContent = formatTime(remaining);
            pomoNavTimer.style.display = 'inline-block';
        }
        if (pomoNavBtn) {
            pomoNavBtn.classList.add('active-timer');
        }
        if (mobilePomoNavBadge) {
            mobilePomoNavBadge.style.display = 'block';
        }

        // Mini widget PiP update
        if (pomoMiniTimerText) {
            pomoMiniTimerText.textContent = formatTime(remaining);
        }
        if (pomoMiniWidget && window.innerWidth <= 1024 && pomoMiniWidget.style.display !== 'flex') {
            pomoMiniWidget.style.display = 'flex';
        }

        // System PiP window update
        if (pipWindowInstance) {
            const pipTimeEl = pipWindowInstance.document.getElementById('pomoPipTime');
            if (pipTimeEl) {
                pipTimeEl.textContent = formatTime(remaining);
            }
        }

        // Timer finished -> Enter 60-second grace window before auto-logging
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            startGracePeriod(60);
        }
    }

    // Starts 60-second grace period after sprint ends allowing user to extend or log accomplishment
    function startGracePeriod(remGraceSecs = 60) {
        if (isGracePeriodActive) return;
        isGracePeriodActive = true;
        clearInterval(countdownInterval);
        
        playChime();
        pomoSessionStatus.textContent = '🎉 Sprint Complete! Extend or Save Log';
        if (pomoPauseBtn) pomoPauseBtn.style.display = 'none';
        updatePipPauseIcon();

        const graceEndTimestamp = Date.now() + remGraceSecs * 1000;

        function updateGraceUI() {
            const rem = Math.max(0, Math.ceil((graceEndTimestamp - Date.now()) / 1000));
            pomoTimerText.textContent = formatTime(rem);
            updateProgressRing(rem, 60);

            if (pomoNavTimer) {
                pomoNavTimer.textContent = formatTime(rem);
                pomoNavTimer.style.display = 'inline-block';
            }
            if (pomoMiniTimerText) {
                pomoMiniTimerText.textContent = formatTime(rem);
            }
            if (pipWindowInstance) {
                const pipTimeEl = pipWindowInstance.document.getElementById('pomoPipTime');
                if (pipTimeEl) pipTimeEl.textContent = formatTime(rem);
            }

            if (rem <= 0) {
                clearInterval(graceCountdownInterval);
                isGracePeriodActive = false;
                handleFinishedTimer();
            }
        }

        updateGraceUI();
        clearInterval(graceCountdownInterval);
        graceCountdownInterval = setInterval(updateGraceUI, 200);
    }

    // Timer local complete triggers API verification
    async function handleFinishedTimer() {
        clearTimerUI();

        pomoSessionStatus.textContent = 'Completing session...';
        
        try {
            if (currentSessionId) {
                await apiPost('/api/pomodoro/complete/', { session_id: currentSessionId });
            }
            if (window.showToast) {
                window.showToast('Focus session complete! Log your accomplishment.');
            }
        } catch (e) {
            console.error('Failed to complete session on server:', e);
        } finally {
            syncStatus();
        }
    }

    function clearTimerUI() {
        clearInterval(countdownInterval);
        clearInterval(graceCountdownInterval);
        isGracePeriodActive = false;
        
        pomoTimerText.textContent = '25:00';
        updateProgressRing(100, 100);
        pomoSessionStatus.textContent = 'Ready to focus?';
        if (pomoPauseBtn) pomoPauseBtn.style.display = 'flex';
        if (pomoActiveTaskBanner) {
            pomoActiveTaskBanner.style.display = 'none';
            pomoActiveTaskBanner.textContent = '';
        }
        
        if (pomoNavTimer) {
            pomoNavTimer.style.display = 'none';
        }
        if (pomoNavBtn) {
            pomoNavBtn.classList.remove('active-timer');
        }
        if (mobilePomoNavBadge) {
            mobilePomoNavBadge.style.display = 'none';
        }

        // Hide mini-widget
        if (pomoMiniWidget) {
            pomoMiniWidget.style.display = 'none';
            pomoMiniWidget.style.transform = '';
            xOffset = 0;
            yOffset = 0;
        }

        // Close system PiP window
        if (pipWindowInstance) {
            pipWindowInstance.close();
            pipWindowInstance = null;
        }
        
        pomoSetupControls.style.display = 'block';
        pomoRunningControls.style.display = 'none';
        
        currentSessionId = null;
    }

    // Focus Category & Duration Setup State
    let selectedPomoCategory = 'phd';
    let selectedDurationMins = 25;

    const pomoCatPhdBtn = document.getElementById('pomoCatPhdBtn');
    const pomoCatOtherBtn = document.getElementById('pomoCatOtherBtn');
    const pomoConfirmStartBtn = document.getElementById('pomoConfirmStartBtn');

    function updateStartButtonUI() {
        if (!pomoConfirmStartBtn) return;
        const catLabel = selectedPomoCategory === 'phd' ? 'PhD' : 'Other';
        pomoConfirmStartBtn.textContent = `🚀 Start ${catLabel} Sprint (${selectedDurationMins} min)`;
    }

    function setPomoCategory(cat) {
        selectedPomoCategory = cat;
        if (pomoCatPhdBtn) {
            pomoCatPhdBtn.classList.toggle('active', cat === 'phd');
            pomoCatPhdBtn.style.background = cat === 'phd' ? '#2dd4bf' : 'transparent';
            pomoCatPhdBtn.style.color = cat === 'phd' ? '#061614' : 'rgba(255,255,255,0.6)';
        }
        if (pomoCatOtherBtn) {
            pomoCatOtherBtn.classList.toggle('active', cat === 'other');
            pomoCatOtherBtn.style.background = cat === 'other' ? '#3b82f6' : 'transparent';
            pomoCatOtherBtn.style.color = cat === 'other' ? '#ffffff' : 'rgba(255,255,255,0.6)';
        }
        updateStartButtonUI();
    }

    if (pomoCatPhdBtn) pomoCatPhdBtn.addEventListener('click', () => setPomoCategory('phd'));
    if (pomoCatOtherBtn) pomoCatOtherBtn.addEventListener('click', () => setPomoCategory('other'));

    function setSelectedDuration(mins, activeBtn = null) {
        selectedDurationMins = mins;
        pomoPresetBtns.forEach(btn => {
            const isMatch = activeBtn ? (btn === activeBtn) : (parseInt(btn.dataset.mins) === mins);
            if (isMatch) {
                btn.style.background = 'rgba(45, 212, 191, 0.25)';
                btn.style.borderColor = '#2dd4bf';
                btn.style.fontWeight = '700';
            } else {
                btn.style.background = 'rgba(45, 212, 191, 0.08)';
                btn.style.borderColor = 'rgba(45, 212, 191, 0.25)';
                btn.style.fontWeight = '600';
            }
        });
        updateStartButtonUI();
    }

    // Presets Setup (Selection only — does not start automatically)
    pomoPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.dataset.mins);
            setSelectedDuration(mins, btn);
        });
    });

    // Custom duration applies as it is typed — no separate "Set" button needed.
    if (pomoCustomMins) {
        pomoCustomMins.addEventListener('input', () => {
            const mins = parseInt(pomoCustomMins.value);
            if (!isNaN(mins) && mins >= 1 && mins <= 180) {
                setSelectedDuration(mins);
            }
        });
    }

    // Confirm & Start Focus Sprint Button Listener
    if (pomoConfirmStartBtn) {
        pomoConfirmStartBtn.addEventListener('click', () => {
            startTimer(selectedDurationMins);
        });
    }

    // Start Pomodoro Request
    async function startTimer(mins) {
        if (isNaN(mins) || mins <= 0 || mins > 180) {
            alert('Please enter a duration between 1 and 180 minutes.');
            return;
        }

        pomoSessionStatus.textContent = 'Starting session...';
        const taskId = pomoTaskSelect ? pomoTaskSelect.value : null;
        const selectedOptText = pomoTaskSelect && pomoTaskSelect.selectedIndex > 0 ? pomoTaskSelect.options[pomoTaskSelect.selectedIndex].textContent.replace('🎯 ', '') : '';

        try {
            const data = await apiPost('/api/pomodoro/start/', {
                duration_minutes: mins,
                task_id: taskId || null,
                task_title: selectedOptText || '',
                category: selectedPomoCategory || 'phd'
            });
            if (data.status === 'success') {
                currentSessionId = data.session_id;
                pomoSetupControls.style.display = 'none';
                pomoRunningControls.style.display = 'flex';
                if (pomoPipBtn && isPipSupported) {
                    pomoPipBtn.style.display = 'block';
                }
                pomoSessionStatus.textContent = 'Deep Focus Active';
                if (data.task_title && pomoActiveTaskBanner) {
                    pomoActiveTaskBanner.textContent = `🎯 Focusing on: ${data.task_title}`;
                    pomoActiveTaskBanner.style.display = 'block';
                }
                
                // Start local timer
                const totalSeconds = mins * 60;
                startLocalTimer(totalSeconds, totalSeconds);
                
                // Close popup after starting to let them focus
                setTimeout(closePomoPopupPanel, 800);
            }
        } catch (e) {
            console.error('Failed to start Pomodoro session:', e);
            pomoSessionStatus.textContent = 'Error starting timer.';
        }
    }

    // Pause / Resume Toggle Request
    async function togglePause() {
        if (!currentSessionId) return;
        try {
            if (isTimerPaused) {
                const data = await apiPost('/api/pomodoro/resume/');
                if (data.status === 'success') {
                    isTimerPaused = false;
                    pomoSessionStatus.textContent = 'Deep Focus Active';
                    updatePipPauseIcon();
                    syncStatus();
                }
            } else {
                const data = await apiPost('/api/pomodoro/pause/');
                if (data.status === 'success') {
                    isTimerPaused = true;
                    pomoSessionStatus.textContent = '⏸️ PAUSED — Taking a breather';
                    updatePipPauseIcon();
                    updateTimerUI();
                }
            }
        } catch (e) {
            console.error('Failed to toggle pause:', e);
        }
    }

    if (pomoPauseBtn) pomoPauseBtn.addEventListener('click', togglePause);

    // Extend Sprint Duration (+5m or +10m)
    async function extendSprint(extraMins) {
        if (!currentSessionId) return;
        try {
            const data = await apiPost('/api/pomodoro/extend/', { extra_minutes: extraMins });
            if (data.status === 'success') {
                if (isGracePeriodActive) {
                    clearInterval(graceCountdownInterval);
                    isGracePeriodActive = false;
                    if (pomoPauseBtn) pomoPauseBtn.style.display = 'flex';
                }
                durationSeconds += extraMins * 60;
                endTimestamp += extraMins * 60 * 1000;
                if (window.showToast) {
                    window.showToast(`Sprint extended by +${extraMins} mins! 🚀`);
                }
                syncStatus();
            }
        } catch (e) {
            console.error('Failed to extend sprint:', e);
        }
    }

    if (pomoExtend5Btn) pomoExtend5Btn.addEventListener('click', () => extendSprint(5));
    if (pomoExtend10Btn) pomoExtend10Btn.addEventListener('click', () => extendSprint(10));

    // Finish Sprint Early & Save Log
    async function finishEarly() {
        if (!currentSessionId) return;
        if (!isGracePeriodActive && !confirm('Finished your focus task early? Save log and complete sprint now?')) return;
        
        try {
            clearInterval(graceCountdownInterval);
            isGracePeriodActive = false;
            const data = await apiPost('/api/pomodoro/finish-early/');
            if (data.status === 'success') {
                clearTimerUI();
                playChime();
                if (window.showToast) {
                    window.showToast(`Sprint completed! (${data.duration_minutes} min focus logged)`);
                }
                syncStatus();
            }
        } catch (e) {
            console.error('Failed to finish sprint early:', e);
        }
    }

    if (pomoFinishEarlyBtn) pomoFinishEarlyBtn.addEventListener('click', finishEarly);

    // Cancel Pomodoro Request
    async function cancelTimer() {
        if (!confirm('Are you sure you want to cancel the current focus sprint?')) return;
        
        pomoSessionStatus.textContent = 'Cancelling session...';
        
        try {
            await apiPost('/api/pomodoro/cancel/');
            clearTimerUI();
            if (window.showToast) {
                window.showToast('Focus session cancelled.');
            }
        } catch (e) {
            console.error('Failed to cancel session:', e);
        } finally {
            syncStatus();
        }
    }

    if (pomoCancelBtn) pomoCancelBtn.addEventListener('click', cancelTimer);

    // Sync status and load today's log lists
    async function syncStatus() {
        if (isStatusPollingActive) return;
        isStatusPollingActive = true;
        
        try {
            const response = await fetch('/api/pomodoro/status/');
            const data = await response.json();
            
            if (data.status === 'success') {
                if (data.pending_tasks) {
                    populateTaskSelect(data.pending_tasks);
                }

                // 1. Sync active session state
                if (data.active_session) {
                    currentSessionId = data.active_session.id;
                    isTimerPaused = data.active_session.is_paused || false;
                    pomoSetupControls.style.display = 'none';
                    pomoRunningControls.style.display = 'flex';
                    if (pomoPipBtn && isPipSupported) {
                        pomoPipBtn.style.display = 'block';
                    }
                    
                    if (data.active_session.task_title && pomoActiveTaskBanner) {
                        pomoActiveTaskBanner.textContent = `🎯 Focusing on: ${data.active_session.task_title}`;
                        pomoActiveTaskBanner.style.display = 'block';
                    } else if (pomoActiveTaskBanner) {
                        pomoActiveTaskBanner.style.display = 'none';
                    }
                    
                    if (data.active_session.in_grace_period) {
                        startGracePeriod(data.active_session.grace_remaining_seconds);
                    } else if (isTimerPaused) {
                        pomoSessionStatus.textContent = '⏸️ PAUSED — Taking a breather';
                        if (pomoPauseIcon) pomoPauseIcon.textContent = '▶️';
                        if (pomoPauseText) pomoPauseText.textContent = 'Resume';
                    } else {
                        pomoSessionStatus.textContent = 'Deep Focus Active';
                        if (pomoPauseIcon) pomoPauseIcon.textContent = '⏸️';
                        if (pomoPauseText) pomoPauseText.textContent = 'Pause';
                    }
                    
                    if (!data.active_session.in_grace_period) {
                        const rem = data.active_session.remaining_seconds;
                        const tot = data.active_session.duration_minutes * 60;
                        startLocalTimer(rem, tot);
                    }
                    if (pomoMiniWidget && window.innerWidth <= 1024) {
                        pomoMiniWidget.style.display = 'flex';
                    }
                } else {
                    // No active session is running
                    if (countdownInterval) {
                        clearTimerUI();
                    }
                }

                // 2. Load today's log list
                renderCompletedLogs(data.completed_logs);

                // 3. Trigger prompt if a session finished and lacks log details
                if (data.prompt_log_session && promptSessionId !== data.prompt_log_session.id) {
                    promptSessionId = data.prompt_log_session.id;
                    promptSessionMins.textContent = data.prompt_log_session.duration_minutes;
                    pomoPromptLogInput.value = '';
                    
                    // Show Prompt Overlays
                    pomoPromptOverlay.classList.add('open');
                    pomoPromptModal.classList.add('open');
                }
            }
        } catch (e) {
            console.error('Error syncing Pomodoro status:', e);
        } finally {
            isStatusPollingActive = false;
        }
    }

    function formatPauseLabel(totalPausedSec) {
        if (!totalPausedSec || totalPausedSec <= 0) return '';
        const pMins = Math.floor(totalPausedSec / 60);
        const pSecs = totalPausedSec % 60;
        if (pMins > 0 && pSecs > 0) {
            return ` • ⏸️ ${pMins}m ${pSecs}s paused`;
        } else if (pMins > 0) {
            return ` • ⏸️ ${pMins}m paused`;
        } else {
            return ` • ⏸️ ${pSecs}s paused`;
        }
    }

    // Render focus logs list inside popup
    function renderCompletedLogs(logs) {
        if (!pomoLogsList) return;
        pomoLogsList.innerHTML = '';
        completedLogs = logs; // cache for day-view
        
        if (pomoLogCount) {
            pomoLogCount.textContent = `${logs.length} done`;
        }

        if (logs.length === 0) {
            pomoLogsList.innerHTML = '<div class="pomo-log-empty">No focus sessions completed today yet. Start one above!</div>';
            return;
        }

        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'pomo-log-item';
            
            const logText = log.focus_log ? log.focus_log : '<em style="opacity: 0.5;">No details logged (click to add)</em>';
            const timeRange = log.ended_at ? `${log.started_at} → ${log.ended_at}` : log.started_at;
            const pauseLabel = formatPauseLabel(log.total_paused_seconds);

            item.innerHTML = `
                <div class="pomo-log-time">${timeRange}</div>
                <div class="pomo-log-details">
                    <span class="pomo-log-desc" style="cursor: pointer;" data-id="${log.id}">${escapeHtml(logText)}</span>
                    <span class="pomo-log-meta">${log.duration_minutes} min focus session${pauseLabel}</span>
                </div>
            `;
            
            const descEl = item.querySelector('.pomo-log-desc');
            descEl.addEventListener('click', () => {
                editLogDetails(log.id, log.focus_log);
            });

            pomoLogsList.appendChild(item);
        });
    }

    // ─── 24-Hour Day View ───────────────────────────────────────────────

    function buildRuler() {
        if (!dayRuler) return;
        dayRuler.innerHTML = '';
        for (let h = 0; h <= 23; h++) {
            const mark = document.createElement('div');
            mark.className = 'day-ruler-mark';
            mark.textContent = `${String(h).padStart(2, '0')}:00`;
            dayRuler.appendChild(mark);
        }
    }

    function updateNowLine() {
        if (!dayNowLine) return;
        const now = new Date();
        const totalMins = now.getHours() * 60 + now.getMinutes();
        const pct = (totalMins / 1440) * 100;
        dayNowLine.style.left = `${pct}%`;
        dayNowLine.style.display = 'block';
    }

    function renderDayTimeline(logs) {
        if (!dayTrack) return;
        // Remove old session blocks (keep the now-line)
        dayTrack.querySelectorAll('.day-session-block').forEach(el => el.remove());

        logs.forEach(log => {
            const startPct = ((log.started_at_minutes ?? 0) / 1440) * 100;
            const endMins = log.ended_at_minutes ?? (log.started_at_minutes + log.duration_minutes);
            const widthPct = Math.max(((endMins - (log.started_at_minutes ?? 0)) / 1440) * 100, 0.4);

            const block = document.createElement('div');
            block.className = 'day-session-block';
            block.style.left = `${startPct}%`;
            block.style.width = `${widthPct}%`;
            block.title = `${log.started_at} → ${log.ended_at || ''} (${log.duration_minutes} min)`;

            // Show duration label only if block is wide enough
            if (widthPct > 3) {
                const label = document.createElement('span');
                label.className = 'day-session-block-label';
                label.textContent = `${log.duration_minutes}m`;
                block.appendChild(label);
            }

            block.addEventListener('click', () => selectDayBlock(block, log));
            dayTrack.appendChild(block);
        });

        updateNowLine();
    }

    function selectDayBlock(blockEl, log) {
        // Deselect any previously selected block
        dayTrack.querySelectorAll('.day-session-block.selected').forEach(el => el.classList.remove('selected'));
        blockEl.classList.add('selected');

        // Populate detail panel
        if (dayDetailEmpty) dayDetailEmpty.style.display = 'none';
        if (dayDetailContent) dayDetailContent.style.display = 'flex';

        if (dayDetailTime) dayDetailTime.textContent = `${log.started_at} → ${log.ended_at || '?'}`;
        
        let durationText = `${log.duration_minutes} minutes focus`;
        if (log.total_paused_seconds && log.total_paused_seconds > 0) {
            const pMins = Math.floor(log.total_paused_seconds / 60);
            const pSecs = log.total_paused_seconds % 60;
            durationText += pMins > 0 ? ` (⏸️ ${pMins}m ${pSecs}s paused)` : ` (⏸️ ${pSecs}s paused)`;
        }
        if (dayDetailDuration) dayDetailDuration.textContent = durationText;

        if (dayDetailLog) {
            dayDetailLog.textContent = log.focus_log && log.focus_log !== 'Focus Session'
                ? log.focus_log
                : '(No log details recorded)';
        }
    }

    // ── Timeline Zoom Controls ──
    let timelineZoomLevel = 100;
    const timelineZoomOutBtn = document.getElementById('timelineZoomOutBtn');
    const timelineZoomInBtn = document.getElementById('timelineZoomInBtn');
    const timelineZoomResetBtn = document.getElementById('timelineZoomResetBtn');
    const timelineZoomValue = document.getElementById('timelineZoomValue');

    function applyTimelineZoom(newZoom) {
        timelineZoomLevel = Math.max(100, Math.min(350, newZoom));
        if (timelineZoomValue) timelineZoomValue.textContent = `${timelineZoomLevel}%`;

        if (dayRuler && dayTrack) {
            dayRuler.style.width = `${timelineZoomLevel}%`;
            dayTrack.style.width = `${timelineZoomLevel}%`;
            dayRuler.style.minWidth = `${timelineZoomLevel}%`;
            dayTrack.style.minWidth = `${timelineZoomLevel}%`;
        }
    }

    if (timelineZoomInBtn) {
        timelineZoomInBtn.addEventListener('click', () => applyTimelineZoom(timelineZoomLevel + 50));
    }
    if (timelineZoomOutBtn) {
        timelineZoomOutBtn.addEventListener('click', () => applyTimelineZoom(timelineZoomLevel - 50));
    }
    if (timelineZoomResetBtn) {
        timelineZoomResetBtn.addEventListener('click', () => applyTimelineZoom(100));
    }

    const dayRulerWrapper = document.querySelector('.day-ruler-wrapper');
    if (dayRulerWrapper) {
        dayRulerWrapper.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 25 : -25;
                applyTimelineZoom(timelineZoomLevel + delta);
            }
        }, { passive: false });
    }

    // ─── Focus History Views (Day / Week / Month) & Navigation ───────

    function formatDateIso(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function changeFocusHistoryDate(delta) {
        if (focusHistoryView === 'day') {
            focusHistoryDate.setDate(focusHistoryDate.getDate() + delta);
        } else if (focusHistoryView === 'week') {
            focusHistoryDate.setDate(focusHistoryDate.getDate() + (delta * 7));
        } else if (focusHistoryView === 'month') {
            focusHistoryDate.setMonth(focusHistoryDate.getMonth() + delta);
        }
        fetchAndRenderFocusHistory();
    }

    function resetFocusHistoryToday() {
        focusHistoryDate = new Date();
        fetchAndRenderFocusHistory();
    }

    function switchFocusHistoryView(newView) {
        focusHistoryView = newView;
        [focusViewTabDay, focusViewTabWeek, focusViewTabMonth].forEach(tab => {
            if (tab) tab.classList.toggle('active', tab.dataset.view === newView);
        });
        [focusPanelDay, focusPanelWeek, focusPanelMonth].forEach(panel => {
            if (panel) panel.style.display = 'none';
        });

        if (newView === 'day' && focusPanelDay) focusPanelDay.style.display = 'block';
        if (newView === 'week' && focusPanelWeek) focusPanelWeek.style.display = 'block';
        if (newView === 'month' && focusPanelMonth) focusPanelMonth.style.display = 'block';

        fetchAndRenderFocusHistory();
    }

    async function fetchAndRenderFocusHistory() {
        const dateStr = formatDateIso(focusHistoryDate);
        try {
            const res = await fetch(`/api/pomodoro/history/?view=${focusHistoryView}&date=${dateStr}`);
            const data = await res.json();
            if (data.status !== 'success') return;

            if (focusHistoryView === 'day') {
                if (focusDateDisplay) focusDateDisplay.textContent = data.formatted_date;
                renderDayStats(data);
                buildRuler();
                renderDayTimeline(data.logs);
                if (dayDetailEmpty) dayDetailEmpty.style.display = 'flex';
                if (dayDetailContent) dayDetailContent.style.display = 'none';
            } else if (focusHistoryView === 'week') {
                if (focusDateDisplay) focusDateDisplay.textContent = data.formatted_range;
                renderWeekPanel(data);
            } else if (focusHistoryView === 'month') {
                if (focusDateDisplay) focusDateDisplay.textContent = data.formatted_month;
                renderMonthPanel(data);
            }
        } catch (e) {
            console.error('Failed to fetch focus history:', e);
        }
    }

    function formatMinsToHoursMins(minutes) {
        if (!minutes || minutes <= 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    function renderDayStats(data) {
        const dayStatsRow = document.getElementById('dayStatsRow');
        if (!dayStatsRow) return;
        const focusMins = data.total_focus_minutes || 0;
        const oppMins = data.total_opportunity_minutes ?? (data.total_gap_minutes || 0);
        const focusFormatted = formatMinsToHoursMins(focusMins);
        const oppFormatted = formatMinsToHoursMins(oppMins);
        const spanText = (data.first_session_start && data.last_session_end)
            ? `${data.first_session_start} → ${data.last_session_end}`
            : 'No sessions today';

        dayStatsRow.innerHTML = `
            <div class="focus-stat-card">
                <span class="focus-stat-value">${focusFormatted}</span>
                <span class="focus-stat-label">Total Focus Time</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value" style="color: #ef4444;">${oppFormatted}</span>
                <span class="focus-stat-label">Opportunity Time</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value" style="font-size: 1.05rem;">${spanText}</span>
                <span class="focus-stat-label">Active Focus Span</span>
            </div>
        `;
    }

    function renderWeekPanel(data) {
        if (!weekStatsRow || !weekChartContainer || !weekHistoryList) return;
        
        const focusFormatted = formatMinsToHoursMins(data.total_focus_minutes);
        const oppFormatted = formatMinsToHoursMins(data.total_opportunity_minutes ?? data.total_gap_minutes);
        weekStatsRow.innerHTML = `
            <div class="focus-stat-card">
                <span class="focus-stat-value">${focusFormatted}</span>
                <span class="focus-stat-label">Total Focus</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value" style="color: #ef4444;">${oppFormatted}</span>
                <span class="focus-stat-label">Total Opportunity</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value">${data.total_sessions}</span>
                <span class="focus-stat-label">Sprints Completed</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value">${data.avg_daily_minutes}m</span>
                <span class="focus-stat-label">Avg Daily Focus</span>
            </div>
        `;

        const maxMins = Math.max(...data.days.map(d => d.focus_minutes), 60);
        weekChartContainer.innerHTML = '';
        data.days.forEach(d => {
            const pct = Math.round((d.focus_minutes / maxMins) * 100);
            const col = document.createElement('div');
            col.className = `week-bar-column ${d.is_today ? 'is-today' : ''}`;
            col.innerHTML = `
                <span class="week-bar-val">${d.focus_minutes > 0 ? d.focus_minutes + 'm' : ''}</span>
                <div class="week-bar-track">
                    <div class="week-bar-fill" style="height: ${Math.max(pct, 4)}%;"></div>
                </div>
                <span class="week-bar-day">${d.day_name}</span>
            `;
            col.addEventListener('click', () => {
                focusHistoryView = 'day';
                focusHistoryDate = new Date(d.date);
                switchFocusHistoryView('day');
            });
            weekChartContainer.appendChild(col);
        });

        weekHistoryList.innerHTML = '';
        const daysWithLogs = data.days.filter(d => d.logs && d.logs.length > 0);
        if (daysWithLogs.length === 0) {
            weekHistoryList.innerHTML = '<div class="pomo-log-empty">No focus sessions recorded for this week.</div>';
            return;
        }

        daysWithLogs.forEach(d => {
            const group = document.createElement('div');
            group.className = 'focus-history-day-group';
            const oppMins = d.opportunity_minutes ?? d.gap_minutes ?? 0;
            const oppLabel = oppMins > 0 ? ` • <span style="color:#ef4444;">${oppMins}m Opportunity</span>` : '';
            group.innerHTML = `
                <div class="focus-history-day-header" title="Click to expand / collapse timeline">
                    <div>
                        <span class="history-toggle-icon">▼</span>
                        <span>${d.day_name}, ${d.date}</span>
                    </div>
                    <span style="font-size: 0.78rem; opacity: 0.85; font-weight: 500;">${d.focus_minutes}m focus${oppLabel} (${d.session_count} sprint${d.session_count === 1 ? '' : 's'})</span>
                </div>
                <div class="focus-history-day-logs">
                    ${d.logs.map(log => `
                        <div class="pomo-log-item" style="padding: 6px 0; border: none;">
                            <div class="pomo-log-time" style="font-size: 0.72rem;">${log.started_at} → ${log.ended_at}</div>
                            <div class="pomo-log-details">
                                <span class="pomo-log-desc">${escapeHtml(log.focus_log || 'Focus Session')}</span>
                                <span class="pomo-log-meta">${log.duration_minutes}m focus${formatPauseLabel(log.total_paused_seconds)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            const header = group.querySelector('.focus-history-day-header');
            const logsDiv = group.querySelector('.focus-history-day-logs');
            const icon = group.querySelector('.history-toggle-icon');
            header.addEventListener('click', () => {
                const isCollapsed = logsDiv.classList.toggle('collapsed');
                icon.textContent = isCollapsed ? '▶' : '▼';
            });

            weekHistoryList.appendChild(group);
        });
    }

    function renderMonthPanel(data) {
        if (!monthStatsRow || !monthCalendarGrid || !monthHistoryList) return;

        const focusFormatted = formatMinsToHoursMins(data.total_focus_minutes);
        const oppFormatted = formatMinsToHoursMins(data.total_opportunity_minutes ?? data.total_gap_minutes);
        monthStatsRow.innerHTML = `
            <div class="focus-stat-card">
                <span class="focus-stat-value">${focusFormatted}</span>
                <span class="focus-stat-label">Monthly Focus</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value" style="color: #ef4444;">${oppFormatted}</span>
                <span class="focus-stat-label">Total Opportunity</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value">${data.active_days} / ${data.total_days}</span>
                <span class="focus-stat-label">Active Days</span>
            </div>
            <div class="focus-stat-card">
                <span class="focus-stat-value">${data.total_sessions}</span>
                <span class="focus-stat-label">Total Sprints</span>
            </div>
        `;

        monthCalendarGrid.innerHTML = '';
        for (let i = 0; i < data.start_weekday; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'month-day-cell empty';
            monthCalendarGrid.appendChild(emptyCell);
        }

        data.days.forEach(d => {
            const cell = document.createElement('div');
            let classes = ['month-day-cell'];
            if (d.is_today) classes.push('is-today');
            if (d.focus_minutes >= 60) classes.push('high-focus');
            else if (d.focus_minutes > 0) classes.push('has-focus');

            cell.className = classes.join(' ');
            cell.innerHTML = `
                <span>${d.day_num}</span>
                ${d.focus_minutes > 0 ? `<span class="month-cell-badge">${d.focus_minutes}m</span>` : ''}
            `;
            cell.addEventListener('click', () => {
                focusHistoryView = 'day';
                focusHistoryDate = new Date(d.date);
                switchFocusHistoryView('day');
            });
            monthCalendarGrid.appendChild(cell);
        });

        monthHistoryList.innerHTML = '';
        const daysWithLogs = data.days.filter(d => d.logs && d.logs.length > 0);
        if (daysWithLogs.length === 0) {
            monthHistoryList.innerHTML = '<div class="pomo-log-empty">No focus sessions recorded for this month.</div>';
            return;
        }

        daysWithLogs.forEach(d => {
            const group = document.createElement('div');
            group.className = 'focus-history-day-group';
            const oppMins = d.opportunity_minutes ?? d.gap_minutes ?? 0;
            const oppLabel = oppMins > 0 ? ` • <span style="color:#ef4444;">${oppMins}m Opportunity</span>` : '';
            group.innerHTML = `
                <div class="focus-history-day-header" title="Click to expand / collapse timeline">
                    <div>
                        <span class="history-toggle-icon">▼</span>
                        <span>${d.weekday_name}, ${d.date}</span>
                    </div>
                    <span style="font-size: 0.78rem; opacity: 0.85; font-weight: 500;">${d.focus_minutes}m focus${oppLabel} (${d.session_count} sprint${d.session_count === 1 ? '' : 's'})</span>
                </div>
                <div class="focus-history-day-logs">
                    ${d.logs.map(log => `
                        <div class="pomo-log-item" style="padding: 6px 0; border: none;">
                            <div class="pomo-log-time" style="font-size: 0.72rem;">${log.started_at} → ${log.ended_at}</div>
                            <div class="pomo-log-details">
                                <span class="pomo-log-desc">${escapeHtml(log.focus_log || 'Focus Session')}</span>
                                <span class="pomo-log-meta">${log.duration_minutes}m focus${formatPauseLabel(log.total_paused_seconds)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            const header = group.querySelector('.focus-history-day-header');
            const logsDiv = group.querySelector('.focus-history-day-logs');
            const icon = group.querySelector('.history-toggle-icon');
            header.addEventListener('click', () => {
                const isCollapsed = logsDiv.classList.toggle('collapsed');
                icon.textContent = isCollapsed ? '▶' : '▼';
            });

            monthHistoryList.appendChild(group);
        });
    }

    function openDayView() {
        if (!dayViewModal || !dayViewOverlay) return;
        focusHistoryDate = new Date();
        focusHistoryView = 'day';
        switchFocusHistoryView('day');

        dayViewOverlay.classList.add('open');
        dayViewModal.classList.add('open');
        document.body.style.overflow = 'hidden';

        clearInterval(dayViewNowInterval);
        dayViewNowInterval = setInterval(updateNowLine, 60000);
    }

    function closeDayView() {
        if (!dayViewModal || !dayViewOverlay) return;
        dayViewOverlay.classList.remove('open');
        dayViewModal.classList.remove('open');
        document.body.style.overflow = '';
        clearInterval(dayViewNowInterval);
        dayViewNowInterval = null;
    }

    // Today's focus log is review, not action — collapsed until asked for.
    const pomoLogsToggle = document.getElementById('pomoLogsToggle');
    const pomoLogsPanel = document.getElementById('pomoLogsPanel');
    const pomoLogsCaret = document.getElementById('pomoLogsCaret');
    if (pomoLogsToggle && pomoLogsPanel) {
        pomoLogsToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = pomoLogsPanel.style.display !== 'none';
            pomoLogsPanel.style.display = isOpen ? 'none' : 'block';
            pomoLogsToggle.setAttribute('aria-expanded', String(!isOpen));
            if (pomoLogsCaret) pomoLogsCaret.textContent = isOpen ? '▸' : '▾';
        });
    }

    if (openDayViewBtn) openDayViewBtn.addEventListener('click', openDayView);
    if (closeDayViewBtn) closeDayViewBtn.addEventListener('click', closeDayView);
    if (dayViewOverlay) dayViewOverlay.addEventListener('click', closeDayView);

    // Tab Event Listeners
    if (focusViewTabDay) focusViewTabDay.addEventListener('click', () => switchFocusHistoryView('day'));
    if (focusViewTabWeek) focusViewTabWeek.addEventListener('click', () => switchFocusHistoryView('week'));
    if (focusViewTabMonth) focusViewTabMonth.addEventListener('click', () => switchFocusHistoryView('month'));

    // Navigator Event Listeners
    if (focusNavPrevBtn) focusNavPrevBtn.addEventListener('click', () => changeFocusHistoryDate(-1));
    if (focusNavNextBtn) focusNavNextBtn.addEventListener('click', () => changeFocusHistoryDate(1));
    if (focusNavTodayBtn) focusNavTodayBtn.addEventListener('click', resetFocusHistoryToday);

    // ────────────────────────────────────────────────────────────────────

    // Edit Log Details Inline Prompt
    async function editLogDetails(id, currentText) {
        const text = prompt('Update details of what you achieved in this focus session:', currentText);
        if (text === null) return; // cancelled
        
        try {
            await apiPost('/api/pomodoro/save-log/', { session_id: id, focus_log: text });
            syncStatus();
        } catch (e) {
            alert('Failed to update log: ' + e.message);
        }
    }

    // Prompt Logging Handlers
    let pomoPromptDebounceTimer;
    const autoSaveFocusLog = async () => {
        clearTimeout(pomoPromptDebounceTimer);
        const logText = pomoPromptLogInput.value.trim();
        if (promptSessionId) {
            try {
                await apiPost('/api/pomodoro/save-log/', { 
                    session_id: promptSessionId, 
                    focus_log: logText || 'Focus Session' 
                });
            } catch (e) {
                console.error('Failed to auto-save focus log:', e);
            }
        }
    };

    if (pomoPromptLogInput) {
        pomoPromptLogInput.addEventListener('input', () => {
            clearTimeout(pomoPromptDebounceTimer);
            pomoPromptDebounceTimer = setTimeout(autoSaveFocusLog, 800);
        });
        pomoPromptLogInput.addEventListener('blur', autoSaveFocusLog);
    }

    if (pomoPromptSaveBtn) {
        pomoPromptSaveBtn.addEventListener('click', async () => {
            const logText = pomoPromptLogInput.value.trim();
            if (promptSessionId) {
                try {
                    clearTimeout(pomoPromptDebounceTimer);
                    await apiPost('/api/pomodoro/save-log/', { 
                        session_id: promptSessionId, 
                        focus_log: logText || 'Focus Session' 
                    });
                    
                    // Close prompts
                    pomoPromptOverlay.classList.remove('open');
                    pomoPromptModal.classList.remove('open');
                    promptSessionId = null;
                    
                    syncStatus();
                    
                    // Update Completed Pomodoros counter in the Main Banner dynamically
                    const bannerCompletedEl = document.querySelector('.banner-stat #banner-done-tasks');
                    if (bannerCompletedEl && window.location.pathname === '/') {
                        // refresh page stats or sync
                        setTimeout(() => {
                            if (window.updateBannerStats) window.updateBannerStats();
                        }, 500);
                    }
                } catch (e) {
                    console.error('Error saving prompt log:', e);
                    alert('Error saving log: ' + e.message);
                }
            }
        });
    }

    if (pomoPromptSkipBtn) {
        pomoPromptSkipBtn.addEventListener('click', async () => {
            if (promptSessionId) {
                try {
                    clearTimeout(pomoPromptDebounceTimer);
                    await apiPost('/api/pomodoro/save-log/', { 
                        session_id: promptSessionId, 
                        focus_log: 'Focus Session' 
                    });
                    
                    pomoPromptOverlay.classList.remove('open');
                    pomoPromptModal.classList.remove('open');
                    promptSessionId = null;
                    
                    syncStatus();
                } catch (e) {
                    console.error('Error skipping prompt log:', e);
                }
            }
        });
    }

    // Helper: Escape HTML string
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.innerHTML = str;
        return div.innerText;
    }

    // System-level Picture-in-Picture window launcher
    async function openPipWindow() {
        if (!isPipSupported || pipWindowInstance) return;
        
        try {
            pipWindowInstance = await window.documentPictureInPicture.requestWindow({
                width: 240,
                height: 120
            });
            
            const pipDoc = pipWindowInstance.document;
            pipDoc.body.className = 'pomo-pip-body';
            
            // Inject app stylesheets so the PiP window loads CSS rules
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                    const style = pipDoc.createElement('style');
                    style.textContent = cssRules;
                    pipDoc.head.appendChild(style);
                } catch (e) {
                    const link = pipDoc.createElement('link');
                    link.rel = 'stylesheet';
                    link.type = styleSheet.type;
                    link.media = styleSheet.media.mediaText;
                    link.href = styleSheet.href;
                    pipDoc.head.appendChild(link);
                }
            });
            
            const container = pipDoc.createElement('div');
            container.style.textAlign = 'center';

            const pauseSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
            const playSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

            const remaining = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
            container.innerHTML = `
                <div class="pomo-pip-time" id="pomoPipTime">${formatTime(remaining)}</div>
                <div class="pomo-pip-controls">
                    <button id="pomoPipPauseBtn" class="pomo-pip-icon-btn" title="Pause / Resume">
                        <span id="pomoPipPauseIcon" style="display: flex; align-items: center; justify-content: center;">${isTimerPaused ? playSvg : pauseSvg}</span>
                    </button>
                    <button id="pomoPipFinishBtn" class="pomo-pip-icon-btn" title="Finish &amp; Save">${checkSvg}</button>
                </div>
            `;

            pipDoc.body.appendChild(container);

            pipDoc.getElementById('pomoPipPauseBtn').addEventListener('click', togglePause);
            pipDoc.getElementById('pomoPipFinishBtn').addEventListener('click', finishEarly);
            updatePipPauseIcon();

            // Handle native window closing
            pipWindowInstance.addEventListener('pagehide', () => {
                pipWindowInstance = null;
            });
        } catch (e) {
            console.error('Failed to launch Picture-in-Picture window:', e);
        }
    }

    // Keeps the PiP pause/resume icon and visibility in sync with the main timer state
    function updatePipPauseIcon() {
        if (!pipWindowInstance) return;
        const pipPauseBtn = pipWindowInstance.document.getElementById('pomoPipPauseBtn');
        const pipPauseIcon = pipWindowInstance.document.getElementById('pomoPipPauseIcon');
        const pauseSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
        const playSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

        if (pipPauseBtn) {
            pipPauseBtn.style.display = isGracePeriodActive ? 'none' : 'inline-flex';
        }
        if (pipPauseIcon) {
            pipPauseIcon.innerHTML = isTimerPaused ? playSvg : pauseSvg;
        }
    }

    if (pomoPipBtn) {
        pomoPipBtn.addEventListener('click', openPipWindow);
    }

    // Periodic synchronization check (when page is active)
    setInterval(() => {
        if (!document.hidden && !promptSessionId) {
            syncStatus();
        }
    }, 12000);

    // Immediate sync on tab visibility focus
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncStatus();
        }
    });

    // Drag-to-reposition logic for the mini-widget
    let isDraggingWidget = false;
    let widgetHasMoved = false;

    if (pomoMiniWidget) {
        let activeDrag = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        pomoMiniWidget.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        pomoMiniWidget.addEventListener('touchstart', dragStart, { passive: true });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);

        function dragStart(e) {
            widgetHasMoved = false;
            let clientX, clientY;
            
            if (e.type === "touchstart") {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            initialX = clientX - xOffset;
            initialY = clientY - yOffset;

            if (e.target === pomoMiniWidget || pomoMiniWidget.contains(e.target)) {
                activeDrag = true;
                isDraggingWidget = true;
            }
        }

        function dragMove(e) {
            if (activeDrag) {
                widgetHasMoved = true;
                
                let clientX, clientY;
                if (e.type === "touchmove") {
                    e.preventDefault(); // Prevent scrolling page on mobile while dragging timer
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                } else {
                    clientX = e.clientX;
                    clientY = e.clientY;
                }

                currentX = clientX - initialX;
                currentY = clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                setTranslate(currentX, currentY, pomoMiniWidget);
            }
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        }

        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            activeDrag = false;
            setTimeout(() => {
                isDraggingWidget = false;
            }, 50);
        }

        // Open main Pomodoro popup when tapping/clicking without dragging
        pomoMiniWidget.addEventListener('click', (e) => {
            if (!widgetHasMoved) {
                openPomoPopup();
            }
        });
    }

    function populateTaskSelect(pendingTasks) {
        if (!pomoTaskSelect) return;
        const currentVal = pomoTaskSelect.value;
        pomoTaskSelect.innerHTML = '<option value="">-- General Focus Sprint --</option>';
        if (pendingTasks && pendingTasks.length > 0) {
            pendingTasks.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `🎯 ${t.title}`;
                pomoTaskSelect.appendChild(opt);
            });
        }
        if (currentVal) {
            pomoTaskSelect.value = currentVal;
        }
    }

    function openPomoWithTask(taskId, taskTitle) {
        if (typeof openPomoPopupPanel === 'function') {
            openPomoPopupPanel();
        } else {
            const pomoPopup = document.getElementById('pomoPopup');
            const pomoPopupOverlay = document.getElementById('pomoPopupOverlay');
            if (pomoPopup) pomoPopup.classList.add('open');
            if (pomoPopupOverlay) pomoPopupOverlay.classList.add('open');
        }
        if (pomoTaskSelect) {
            let found = false;
            for (let i = 0; i < pomoTaskSelect.options.length; i++) {
                if (pomoTaskSelect.options[i].value == taskId) {
                    pomoTaskSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found && taskId && taskTitle) {
                const opt = document.createElement('option');
                opt.value = taskId;
                opt.textContent = `🎯 ${taskTitle}`;
                pomoTaskSelect.appendChild(opt);
                pomoTaskSelect.value = taskId;
            }
        }
        if (window.showToast) {
            window.showToast(`Selected task: "${taskTitle}" for Focus Sprint! 🚀`);
        }
    }

    // Global listener for "Focus" button clicks on task cards
    document.addEventListener('click', (e) => {
        const focusBtn = e.target.closest('.action-btn.focus-pomo');
        if (!focusBtn) return;
        const todoItem = focusBtn.closest('.todo-item');
        if (!todoItem) return;
        const taskId = todoItem.dataset.id;
        const taskTitle = todoItem.querySelector('.todo-text') ? todoItem.querySelector('.todo-text').textContent.trim() : '';
        openPomoWithTask(taskId, taskTitle);
    });

    // Start: Perform initial sync on page load
    syncStatus();
});
