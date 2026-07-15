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

    // Circle progress ring math
    const ringCircumference = 282.7; // 2 * pi * 45

    // Local state variables
    let countdownInterval = null;
    let currentSessionId = null;
    let durationSeconds = 0;
    let endTimestamp = 0;
    let promptSessionId = null;
    let isStatusPollingActive = false;
    let xOffset = 0;
    let yOffset = 0;
    let pipWindowInstance = null;
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
        if (pomoMiniWidget && window.innerWidth <= 768 && pomoMiniWidget.style.display !== 'flex') {
            pomoMiniWidget.style.display = 'flex';
        }

        // System PiP window update
        if (pipWindowInstance) {
            const pipTimeEl = pipWindowInstance.document.getElementById('pomoPipTime');
            if (pipTimeEl) {
                pipTimeEl.textContent = formatTime(remaining);
            }
        }

        // Timer finished
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            handleFinishedTimer();
        }
    }

    // Timer local complete triggers API verification
    async function handleFinishedTimer() {
        // Reset timer button UI
        clearTimerUI();

        pomoSessionStatus.textContent = 'Completing session...';
        
        try {
            // Signal completeness to the server
            if (currentSessionId) {
                await apiPost('/api/pomodoro/complete/', { session_id: currentSessionId });
            }
            playChime();
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
        
        pomoTimerText.textContent = '25:00';
        updateProgressRing(100, 100);
        pomoSessionStatus.textContent = 'Ready to focus?';
        
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

    // Start Pomodoro Request
    async function startTimer(mins) {
        if (isNaN(mins) || mins <= 0 || mins > 180) {
            alert('Please enter a duration between 1 and 180 minutes.');
            return;
        }

        pomoSessionStatus.textContent = 'Starting session...';

        try {
            const data = await apiPost('/api/pomodoro/start/', { duration_minutes: mins });
            if (data.status === 'success') {
                currentSessionId = data.session_id;
                pomoSetupControls.style.display = 'none';
                pomoRunningControls.style.display = 'block';
                if (pomoPipBtn && isPipSupported) {
                    pomoPipBtn.style.display = 'block';
                }
                pomoSessionStatus.textContent = 'Deep Focus Active';
                
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

    // Presets Setup
    pomoPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.dataset.mins);
            startTimer(mins);
        });
    });

    // Custom Time Setup
    if (pomoStartCustomBtn) {
        pomoStartCustomBtn.addEventListener('click', () => {
            const mins = parseInt(pomoCustomMins.value);
            startTimer(mins);
            pomoCustomMins.value = ''; // clear input
        });
    }

    // Sync status and load today's log lists
    async function syncStatus() {
        if (isStatusPollingActive) return;
        isStatusPollingActive = true;
        
        try {
            const response = await fetch('/api/pomodoro/status/');
            const data = await response.json();
            
            if (data.status === 'success') {
                // 1. Sync active session state
                if (data.active_session) {
                    currentSessionId = data.active_session.id;
                    pomoSetupControls.style.display = 'none';
                    pomoRunningControls.style.display = 'block';
                    if (pomoPipBtn && isPipSupported) {
                        pomoPipBtn.style.display = 'block';
                    }
                    pomoSessionStatus.textContent = 'Deep Focus Active';
                    
                    const rem = data.active_session.remaining_seconds;
                    const tot = data.active_session.duration_minutes * 60;
                    startLocalTimer(rem, tot);
                    if (pomoMiniWidget && window.innerWidth <= 768) {
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

    // Render focus logs list inside popup
    function renderCompletedLogs(logs) {
        if (!pomoLogsList) return;
        pomoLogsList.innerHTML = '';
        
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
            
            item.innerHTML = `
                <div class="pomo-log-time">${log.started_at}</div>
                <div class="pomo-log-details">
                    <span class="pomo-log-desc" style="cursor: pointer;" data-id="${log.id}">${escapeHtml(logText)}</span>
                    <span class="pomo-log-meta">${log.duration_minutes} min focus session</span>
                </div>
            `;
            
            // Allow clicking log description to edit/add accomplishments details
            const descEl = item.querySelector('.pomo-log-desc');
            descEl.addEventListener('click', () => {
                editLogDetails(log.id, log.focus_log);
            });

            pomoLogsList.appendChild(item);
        });
    }

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
            
            const remaining = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
            container.innerHTML = `
                <div class="pomo-pip-time" id="pomoPipTime">${formatTime(remaining)}</div>
                <div class="pomo-pip-label">Focus Sprint</div>
            `;
            
            pipDoc.body.appendChild(container);
            
            // Handle native window closing
            pipWindowInstance.addEventListener('pagehide', () => {
                pipWindowInstance = null;
            });
        } catch (e) {
            console.error('Failed to launch Picture-in-Picture window:', e);
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

    // Start: Perform initial sync on page load
    syncStatus();
});
