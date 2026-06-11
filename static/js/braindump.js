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

    // Auto-save debouncing
    if (dumpInput) {
        dumpInput.addEventListener('input', () => {
            saveStatus.textContent = 'Saving...';
            saveStatus.style.opacity = '0.7';

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    await apiPost('/api/braindump/save/', { content: dumpInput.value });
                    saveStatus.textContent = 'All changes saved';
                    saveStatus.style.opacity = '0.5';
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
                    // Refresh current page or inject items dynamically
                    // It is safer to reload or dynamically append to keep state in sync
                    // Reloading is simple, clean, and ensures Eisenhower priority columns update correctly
                    window.location.reload();
                }
            } catch (e) {
                generateBtn.textContent = originalText;
                generateBtn.disabled = false;
            }
        });
    }
});
