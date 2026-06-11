document.addEventListener('DOMContentLoaded', () => {
    const reflectionInput = document.getElementById('reflection-input');
    const saveStatus = document.getElementById('reflection-save-status');
    const analyzeBtn = document.getElementById('analyze-reflection-btn');
    
    const mistakesContent = document.getElementById('mistakes-content');
    const suggestionsContent = document.getElementById('suggestions-content');

    let debounceTimer;

    // Debounced Auto-save
    if (reflectionInput) {
        reflectionInput.addEventListener('input', () => {
            saveStatus.textContent = 'Saving...';
            saveStatus.style.opacity = '0.7';

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    await window.apiPost('/api/reflection/save/', { notes: reflectionInput.value });
                    saveStatus.textContent = 'Saved';
                    saveStatus.style.opacity = '0.5';
                } catch (e) {
                    saveStatus.textContent = 'Error saving';
                    saveStatus.style.opacity = '1';
                }
            }, 800);
        });
    }

    // AI reflection generation
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            if (!reflectionInput.value.trim()) {
                alert('Please write some day notes before running the reflection analyzer.');
                return;
            }

            const originalText = analyzeBtn.textContent;
            analyzeBtn.textContent = 'Analyzing...';
            analyzeBtn.disabled = true;

            try {
                // Ensure text is saved first
                await window.apiPost('/api/reflection/save/', { notes: reflectionInput.value });
                
                // Get AI insights
                const res = await window.apiPost('/api/reflection/generate-suggestions/');
                
                if (res.status === 'success') {
                    // Update content with a smooth transition
                    const mistakesBox = document.getElementById('mistakes-box');
                    const suggestionsBox = document.getElementById('suggestions-box');
                    
                    mistakesBox.style.opacity = '0';
                    suggestionsBox.style.opacity = '0';
                    
                    setTimeout(() => {
                        // Format mistakes (lines to list items)
                        mistakesContent.innerHTML = formatMarkdownBullets(res.mistakes);
                        suggestionsContent.innerHTML = formatMarkdownBullets(res.suggestions);
                        
                        mistakesBox.style.opacity = '1';
                        suggestionsBox.style.opacity = '1';
                    }, 300);
                }
            } catch (e) {
                console.error(e);
            } finally {
                analyzeBtn.textContent = originalText;
                analyzeBtn.disabled = false;
            }
        });
    }

    // Helper to turn markdown bullets into clean styled lines
    function formatMarkdownBullets(text) {
        if (!text || !text.trim()) {
            return '<span class="empty-text">No data returned.</span>';
        }
        
        // Simple regex to parse markdown bullet lists into HTML unordered lists
        const lines = text.split('\n');
        let html = '<ul>';
        let hasItems = false;
        
        lines.forEach(line => {
            const cleaned = line.replace(/^[\-*+•]\s*/, '').trim();
            if (cleaned) {
                html += `<li>${escapeHtml(cleaned)}</li>`;
                hasItems = true;
            }
        });
        
        html += '</ul>';
        return hasItems ? html : escapeHtml(text).replace(/\n/g, '<br>');
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
