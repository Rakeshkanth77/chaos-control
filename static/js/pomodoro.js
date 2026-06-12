document.addEventListener('DOMContentLoaded', () => {
    const timerDigits = document.getElementById('timer-time');
    const startBtn = document.getElementById('timer-start');
    const resetBtn = document.getElementById('timer-reset');
    const progressRing = document.getElementById('timer-progress-ring');
    const sessionCountDisplay = document.getElementById('pomodoro-today-count');

    const TOTAL_SECONDS = 25 * 60; // 25 minutes
    const RING_CIRCUMFERENCE = 377; // 2 * PI * r (r=60)

    let secondsRemaining = TOTAL_SECONDS;
    let timerInterval = null;
    let currentSessionId = null;
    let endTime = null;

    // Reset progress ring
    progressRing.style.strokeDashoffset = RING_CIRCUMFERENCE;

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateProgressRing() {
        const percent = (TOTAL_SECONDS - secondsRemaining) / TOTAL_SECONDS;
        const offset = RING_CIRCUMFERENCE - (percent * RING_CIRCUMFERENCE);
        progressRing.style.strokeDashoffset = offset;
    }

    // Play a gentle notification sound using Web Audio API
    function playAlertSound() {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            
            // Beep 1
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, context.currentTime); // C5 note
            gain.gain.setValueAtTime(0.3, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.4);
            
            osc.start(context.currentTime);
            osc.stop(context.currentTime + 0.4);
            
            // Beep 2 (delayed slightly)
            setTimeout(() => {
                const osc2 = context.createOscillator();
                const gain2 = context.createGain();
                osc2.connect(gain2);
                gain2.connect(context.destination);
                
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(659.25, context.currentTime); // E5 note
                gain2.gain.setValueAtTime(0.3, context.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);
                
                osc2.start(context.currentTime);
                osc2.stop(context.currentTime + 0.5);
            }, 200);
            
        } catch (e) {
            console.warn('Audio Context failed to play sound:', e);
        }
    }

    // Helper to clear localStorage keys
    function clearStorage() {
        localStorage.removeItem('pomodoro_end_time');
        localStorage.removeItem('pomodoro_state');
        localStorage.removeItem('pomodoro_seconds_remaining');
        localStorage.removeItem('pomodoro_session_id');
    }

    async function handleTimerComplete() {
        clearInterval(timerInterval);
        timerInterval = null;
        startBtn.textContent = 'Start';
        secondsRemaining = TOTAL_SECONDS;
        updateProgressRing();
        timerDigits.textContent = formatTime(secondsRemaining);
        
        playAlertSound();

        const completedSessionId = currentSessionId || localStorage.getItem('pomodoro_session_id');
        clearStorage();
        currentSessionId = null;

        // Log complete to server
        if (completedSessionId) {
            try {
                const res = await window.apiPost('/api/pomodoro/complete/', { session_id: completedSessionId });
                if (res.status === 'success') {
                    sessionCountDisplay.textContent = res.count;
                }
            } catch (err) {
                console.error('Failed to log completion:', err);
            }
        }
    }

    async function startTimer() {
        startBtn.textContent = 'Pause';
        
        // Log started session if not already running/resumed
        if (!currentSessionId) {
            try {
                const res = await window.apiPost('/api/pomodoro/start/', { duration_minutes: 25 });
                if (res.status === 'success') {
                    currentSessionId = res.session_id;
                    localStorage.setItem('pomodoro_session_id', currentSessionId);
                }
            } catch (err) {
                console.error(err);
            }
        }

        // Set state to running
        localStorage.setItem('pomodoro_state', 'running');
        endTime = Date.now() + (secondsRemaining * 1000);
        localStorage.setItem('pomodoro_end_time', endTime);

        // Run tick logic immediately to avoid 1-second visual delay
        tick();

        timerInterval = setInterval(tick, 1000);
    }

    function tick() {
        const storedEndTime = localStorage.getItem('pomodoro_end_time');
        if (storedEndTime) {
            endTime = parseInt(storedEndTime, 10);
            secondsRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        } else {
            secondsRemaining--;
        }

        timerDigits.textContent = formatTime(secondsRemaining);
        updateProgressRing();

        if (secondsRemaining <= 0) {
            handleTimerComplete();
        }
    }

    function pauseTimer() {
        startBtn.textContent = 'Start';
        clearInterval(timerInterval);
        timerInterval = null;

        localStorage.setItem('pomodoro_state', 'paused');
        localStorage.setItem('pomodoro_seconds_remaining', secondsRemaining);
    }

    function resetTimer() {
        startBtn.textContent = 'Start';
        clearInterval(timerInterval);
        timerInterval = null;
        
        secondsRemaining = TOTAL_SECONDS;
        timerDigits.textContent = formatTime(secondsRemaining);
        updateProgressRing();
        currentSessionId = null;
        clearStorage();
    }

    startBtn.addEventListener('click', () => {
        if (timerInterval) {
            pauseTimer();
        } else {
            startTimer();
        }
    });

    resetBtn.addEventListener('click', () => {
        resetTimer();
    });

    // Restore state from LocalStorage on page load/wake
    function restoreState() {
        const state = localStorage.getItem('pomodoro_state');
        const storedEndTime = localStorage.getItem('pomodoro_end_time');
        const storedSeconds = localStorage.getItem('pomodoro_seconds_remaining');
        const storedSessionId = localStorage.getItem('pomodoro_session_id');

        if (storedSessionId) {
            currentSessionId = parseInt(storedSessionId, 10);
        }

        if (state === 'running' && storedEndTime) {
            endTime = parseInt(storedEndTime, 10);
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            
            if (remaining > 0) {
                secondsRemaining = remaining;
                timerDigits.textContent = formatTime(secondsRemaining);
                updateProgressRing();
                // Resume countdown interval
                startBtn.textContent = 'Pause';
                timerInterval = setInterval(tick, 1000);
            } else {
                // Finished while user was away!
                handleTimerComplete();
            }
        } else if (state === 'paused' && storedSeconds) {
            secondsRemaining = parseInt(storedSeconds, 10);
            timerDigits.textContent = formatTime(secondsRemaining);
            updateProgressRing();
            startBtn.textContent = 'Start';
        } else {
            // Idle state
            secondsRemaining = TOTAL_SECONDS;
            timerDigits.textContent = formatTime(secondsRemaining);
            updateProgressRing();
            startBtn.textContent = 'Start';
        }
    }

    // Call restoreState initially
    restoreState();

    // Listen to tab focus/visibility events to immediately resync and avoid lag
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Re-sync progress and digits instantly
            const state = localStorage.getItem('pomodoro_state');
            if (state === 'running') {
                const storedEndTime = localStorage.getItem('pomodoro_end_time');
                if (storedEndTime) {
                    endTime = parseInt(storedEndTime, 10);
                    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
                    secondsRemaining = remaining;
                    timerDigits.textContent = formatTime(secondsRemaining);
                    updateProgressRing();
                    
                    if (remaining <= 0) {
                        handleTimerComplete();
                    }
                }
            }
        }
    });
});
