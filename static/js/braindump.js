document.addEventListener('DOMContentLoaded', () => {
    const dumpInput = document.getElementById('braindump-input');
    const saveStatus = document.getElementById('dump-save-status');
    const generateBtn = document.getElementById('generate-todos-btn');

    let debounceTimer;

    // Helper function for POST requests
    window.apiPost = async (url, body = {}) => {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': window.CSRF_TOKEN
                },
                body: JSON.stringify({
                    date: window.SELECTED_DATE,
                    ...body
                })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'API request failed');
            }
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            alert(`Error: ${error.message}`);
            throw error;
        }
    };

    // Undo stack for Brain Dump
    const contentHistory = [];
    const undoBtn = document.getElementById('undo-braindump-btn');

    // Initialize history with initial value
    if (dumpInput && dumpInput.value) {
        contentHistory.push(dumpInput.value);
    }

    function pushHistory(val) {
        // Prevent duplicate consecutive entries in history
        if (contentHistory.length === 0 || contentHistory[contentHistory.length - 1] !== val) {
            contentHistory.push(val);
            if (contentHistory.length > 50) {
                contentHistory.shift();
            }
            updateUndoBtnVisibility();
        }
    }

    function updateUndoBtnVisibility() {
        if (!undoBtn) return;
        if (contentHistory.length > 1) {
            undoBtn.style.display = 'inline-flex';
        } else {
            undoBtn.style.display = 'none';
        }
    }

    // Auto-save debouncing
    if (dumpInput) {
        dumpInput.addEventListener('input', () => {
            saveStatus.textContent = 'Saving...';
            saveStatus.style.opacity = '0.7';

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    const currentContent = dumpInput.value;
                    await apiPost('/api/braindump/save/', { content: currentContent });
                    saveStatus.textContent = 'All changes saved';
                    saveStatus.style.opacity = '0.5';
                    pushHistory(currentContent);
                } catch (e) {
                    saveStatus.textContent = 'Error saving';
                    saveStatus.style.opacity = '1';
                }
            }, 800);
        });
    }

    // Generate Todos button handler
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const originalText = generateBtn.textContent;
            generateBtn.textContent = 'Analyzing...';
            generateBtn.disabled = true;

            try {
                const res = await apiPost('/api/braindump/generate-todos/');
                if (res.status === 'success') {
                    // Set flags to trigger auto-switch and toast on reload
                    localStorage.setItem('auto_switch_to_tasks_tab', 'true');
                    localStorage.setItem('show_extraction_toast', 'true');
                    
                    window.location.reload();
                }
            } catch (e) {
                generateBtn.textContent = originalText;
                generateBtn.disabled = false;
            }
        });
    }

    // Clear Brain Dump button handler
    const clearBtn = document.getElementById('clear-braindump-btn');
    if (clearBtn && dumpInput) {
        clearBtn.addEventListener('click', async () => {
            if (!dumpInput.value.trim()) return; // Already empty

            const confirmed = await window.confirmDialog({
                title: 'Clear Brain Dump',
                message: 'Clear all brain dump text? This cannot be undone.',
                confirmText: 'Clear',
                cancelText: 'Cancel'
            });

            if (confirmed) {
                pushHistory(dumpInput.value); // Store old value
                dumpInput.value = '';
                pushHistory(''); // Store cleared value
                saveStatus.textContent = 'Saving...';
                saveStatus.style.opacity = '0.7';

                try {
                    await apiPost('/api/braindump/save/', { content: '' });
                    saveStatus.textContent = 'Cleared & saved';
                    saveStatus.style.opacity = '0.5';
                } catch (e) {
                    saveStatus.textContent = 'Error saving';
                    saveStatus.style.opacity = '1';
                }
            }
        });
    }

    // Undo button click handler
    if (undoBtn && dumpInput) {
        undoBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (contentHistory.length <= 1) return;

            // Pop current state
            contentHistory.pop();
            // Get previous state
            const prevState = contentHistory[contentHistory.length - 1];

            dumpInput.value = prevState;
            saveStatus.textContent = 'Saving...';
            saveStatus.style.opacity = '0.7';

            try {
                await apiPost('/api/braindump/save/', { content: prevState });
                saveStatus.textContent = 'All changes saved';
                saveStatus.style.opacity = '0.5';
            } catch (e) {
                saveStatus.textContent = 'Error saving';
                saveStatus.style.opacity = '1';
            }

            updateUndoBtnVisibility();
        });
    }

    // Voice Input & Speech Recognition
    const voiceBtn = document.getElementById('voice-input-btn');
    if (voiceBtn && dumpInput) {
        let recognition;
        let isRecording = false;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isRecording = true;
                voiceBtn.classList.add('recording');
                voiceBtn.querySelector('.btn-text').textContent = 'Recording...';
                voiceBtn.querySelector('.mic-icon').style.display = 'none';
                voiceBtn.querySelector('.soundwave-container').style.display = 'flex';
            };

            recognition.onend = () => {
                isRecording = false;
                voiceBtn.classList.remove('recording');
                voiceBtn.querySelector('.btn-text').textContent = 'Voice';
                voiceBtn.querySelector('.mic-icon').style.display = 'inline';
                voiceBtn.querySelector('.soundwave-container').style.display = 'none';
            };

            recognition.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    const currentVal = dumpInput.value;
                    const space = currentVal && !currentVal.endsWith(' ') ? ' ' : '';
                    dumpInput.value = currentVal + space + finalTranscript.trim();
                    
                    // Trigger input event to auto-save!
                    dumpInput.dispatchEvent(new Event('input'));
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                recognition.stop();
            };

            voiceBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isRecording) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            });
        } else {
            // Hide or disable if not supported
            voiceBtn.disabled = true;
            voiceBtn.title = 'Speech recognition not supported in this browser';
            voiceBtn.querySelector('.btn-text').textContent = 'Unsupported';
        }
    }
});
