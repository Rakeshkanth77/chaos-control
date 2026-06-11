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

    // Play a gentle notification sound using Web Audio API (no external file needed!)
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

    async function handleTimerComplete() {
        clearInterval(timerInterval);
        timerInterval = null;
        startBtn.textContent = 'Start';
        secondsRemaining = TOTAL_SECONDS;
        updateProgressRing();
        timerDigits.textContent = formatTime(secondsRemaining);
        
        playAlertSound();

        // Log complete to server
        if (currentSessionId) {
            try {
                const res = await window.apiPost('/api/pomodoro/complete/', { session_id: currentSessionId });
                if (res.status === 'success') {
                    sessionCountDisplay.textContent = res.count;
                }
            } catch (err) {
                console.error('Failed to log completion:', err);
            }
        }
        currentSessionId = null;
    }

    async function startTimer() {
        startBtn.textContent = 'Pause';
        
        // Log started session if not already running/resumed
        if (!currentSessionId) {
            try {
                const res = await window.apiPost('/api/pomodoro/start/', { duration_minutes: 25 });
                if (res.status === 'success') {
                    currentSessionId = res.session_id;
                }
            } catch (err) {
                console.error(err);
            }
        }

        timerInterval = setInterval(() => {
            secondsRemaining--;
            timerDigits.textContent = formatTime(secondsRemaining);
            updateProgressRing();

            if (secondsRemaining <= 0) {
                handleTimerComplete();
            }
        }, 1000);
    }

    function pauseTimer() {
        startBtn.textContent = 'Start';
        clearInterval(timerInterval);
        timerInterval = null;
    }

    startBtn.addEventListener('click', () => {
        if (timerInterval) {
            pauseTimer();
        } else {
            startTimer();
        }
    });

    resetBtn.addEventListener('click', () => {
        pauseTimer();
        secondsRemaining = TOTAL_SECONDS;
        timerDigits.textContent = formatTime(secondsRemaining);
        updateProgressRing();
        currentSessionId = null;
    });
});
