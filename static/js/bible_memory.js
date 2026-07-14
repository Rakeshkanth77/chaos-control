// ════════════════════════════════════════
//  DAILY PRACTICE — Minimal Friction-Free Controller
//  One word per day. One verse per day. That's it.
// ════════════════════════════════════════

let ALL_WORDS = [];
let ALL_VERSES = [];
let CURRENT_TAB = 'word';
let REVIEW_ITEM = null;

// ════════════════════════════════════════
//  INITIALIZATION
// ════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const savedTab = localStorage.getItem('practice_tab') || 'word';
    switchTab(savedTab);
});

// Helper for CSRF-protected JSON POST
async function practicePost(url, body = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': window.CSRF_TOKEN
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'API request failed');
    }
    return await response.json();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showPracticeToast(msg) {
    const toast = document.getElementById('practice-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ════════════════════════════════════════
//  TAB SWITCHING
// ════════════════════════════════════════

function switchTab(tab) {
    CURRENT_TAB = tab;
    localStorage.setItem('practice_tab', tab);

    // Update tab buttons
    document.getElementById('tab-word').classList.toggle('active', tab === 'word');
    document.getElementById('tab-verse').classList.toggle('active', tab === 'verse');

    // Show/hide panels
    document.getElementById('panel-word').style.display = tab === 'word' ? 'block' : 'none';
    document.getElementById('panel-verse').style.display = tab === 'verse' ? 'block' : 'none';

    // Fetch data for the active tab
    if (tab === 'word') {
        fetchWordOfTheDay();
    } else {
        fetchTodayVerse();
    }
}

// ════════════════════════════════════════
//  WORD OF THE DAY
// ════════════════════════════════════════

async function fetchWordOfTheDay() {
    const loadingEl = document.getElementById('word-loading');
    const cardEl = document.getElementById('word-card');
    const historyEl = document.getElementById('word-history');

    // Show shimmer
    loadingEl.style.display = 'block';
    cardEl.style.display = 'none';

    try {
        // Fetch today's word
        const res = await fetch('/api/bible-memory/word-of-the-day/');
        const data = await res.json();

        if (data.status !== 'success' || !data.word) {
            throw new Error(data.message || 'No word available');
        }

        const word = data.word;

        // Render today's word card
        cardEl.innerHTML = `
            <div class="daily-card">
                <div class="daily-card-hero">
                    <div class="word-title">${escapeHtml(word.reference)}</div>
                    <span class="word-category">${escapeHtml(word.category)}</span>
                </div>
                <div class="daily-card-body">
                    <div class="info-block">
                        <div class="info-block-label">📖 Definition</div>
                        <div class="info-block-value definition">${escapeHtml(word.text)}</div>
                    </div>
                    ${word.hook ? `
                    <div class="info-block">
                        <div class="info-block-label">💡 Memory Hook</div>
                        <div class="info-block-value">${escapeHtml(word.hook)}</div>
                    </div>
                    ` : ''}
                    ${word.context ? `
                    <div class="info-block">
                        <div class="info-block-label">📝 Example</div>
                        <div class="info-block-value" style="font-style: italic;">"${escapeHtml(word.context)}"</div>
                    </div>
                    ` : ''}
                    <button class="learned-btn ${word.mastered ? 'done' : 'primary'}" 
                            id="word-learned-btn"
                            onclick="markLearned(${word.id}, 'word')">
                        ${word.mastered ? '✅ Learned!' : '✅ I\'ve learned this'}
                    </button>
                </div>
            </div>
        `;

        loadingEl.style.display = 'none';
        cardEl.style.display = 'block';

        // Fetch all words for the past list
        await loadPastItems('english');

    } catch (err) {
        console.error('Word of the day error:', err);
        loadingEl.style.display = 'none';
        cardEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-emoji">📚</div>
                <div class="empty-state-text">Could not load today's word. Please check your internet connection and try refreshing.</div>
            </div>
        `;
        cardEl.style.display = 'block';
    }
}

// ════════════════════════════════════════
//  TODAY'S VERSE
// ════════════════════════════════════════

async function fetchTodayVerse() {
    const loadingEl = document.getElementById('verse-loading');
    const cardEl = document.getElementById('verse-card');

    loadingEl.style.display = 'block';
    cardEl.style.display = 'none';

    try {
        const res = await fetch('/api/bible-memory/get-verses/?practice_type=bible');
        const data = await res.json();

        if (data.status !== 'success') {
            throw new Error(data.message || 'Failed to load verses');
        }

        ALL_VERSES = data.verses || [];

        // Find today's verse: first un-mastered one, or the most recently created one
        let todayVerse = ALL_VERSES.find(v => !v.mastered);
        if (!todayVerse && ALL_VERSES.length > 0) {
            todayVerse = ALL_VERSES[ALL_VERSES.length - 1];
        }

        if (!todayVerse) {
            loadingEl.style.display = 'none';
            cardEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-emoji">📖</div>
                    <div class="empty-state-text">No verses in your library yet. You can seed a curated collection to get started.</div>
                    <button class="review-btn" onclick="seedVerses()" style="margin-top: 16px; width: auto; display: inline-flex;">
                        📥 Load Curated Verses
                    </button>
                </div>
            `;
            cardEl.style.display = 'block';
            return;
        }

        cardEl.innerHTML = `
            <div class="daily-card">
                <div class="daily-card-hero">
                    <div class="word-title">${escapeHtml(todayVerse.reference)}</div>
                    <span class="word-category">${escapeHtml(todayVerse.category)}</span>
                </div>
                <div class="daily-card-body">
                    <div class="info-block">
                        <div class="info-block-label">📖 Scripture</div>
                        <div class="info-block-value verse-text">${escapeHtml(todayVerse.text)}</div>
                    </div>
                    ${todayVerse.hook ? `
                    <div class="info-block">
                        <div class="info-block-label">💡 Memory Hook</div>
                        <div class="info-block-value">${escapeHtml(todayVerse.hook)}</div>
                    </div>
                    ` : ''}
                    ${todayVerse.context ? `
                    <div class="info-block">
                        <div class="info-block-label">📝 Context</div>
                        <div class="info-block-value">${escapeHtml(todayVerse.context)}</div>
                    </div>
                    ` : ''}
                    <button class="learned-btn ${todayVerse.mastered ? 'done' : 'primary'}" 
                            id="verse-learned-btn"
                            onclick="markLearned(${todayVerse.id}, 'verse')">
                        ${todayVerse.mastered ? '✅ Learned!' : '✅ I\'ve learned this'}
                    </button>
                </div>
            </div>
        `;

        loadingEl.style.display = 'none';
        cardEl.style.display = 'block';

        // Load past items
        renderPastItems('bible', ALL_VERSES);

    } catch (err) {
        console.error('Verse fetch error:', err);
        loadingEl.style.display = 'none';
        cardEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-emoji">📖</div>
                <div class="empty-state-text">Could not load today's verse. Please try refreshing.</div>
            </div>
        `;
        cardEl.style.display = 'block';
    }
}

// ════════════════════════════════════════
//  MARK AS LEARNED
// ════════════════════════════════════════

async function markLearned(id, type) {
    const btnId = type === 'word' ? 'word-learned-btn' : 'verse-learned-btn';
    const btn = document.getElementById(btnId);
    if (!btn || btn.classList.contains('done')) return;

    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        await practicePost('/api/bible-memory/rate/', { id, rating: 4 });

        btn.textContent = '✅ Learned!';
        btn.classList.remove('primary');
        btn.classList.add('done');
        btn.disabled = false;

        // Update streak in localStorage
        const streakKey = `practice_streak_${type}`;
        const lastDateKey = `practice_last_${type}`;
        const today = new Date().toDateString();
        const lastDate = localStorage.getItem(lastDateKey);

        if (lastDate !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const currentStreak = parseInt(localStorage.getItem(streakKey) || '0');

            if (lastDate === yesterday.toDateString()) {
                localStorage.setItem(streakKey, String(currentStreak + 1));
            } else {
                localStorage.setItem(streakKey, '1');
            }
            localStorage.setItem(lastDateKey, today);
        }

        showPracticeToast('🎉 Great job! Word retained.');

        // Refresh past items
        if (type === 'word') {
            await loadPastItems('english');
        } else {
            // Update local data and re-render
            const v = ALL_VERSES.find(item => item.id === id);
            if (v) v.mastered = true;
            renderPastItems('bible', ALL_VERSES);
        }

    } catch (err) {
        console.error(err);
        btn.textContent = '✅ I\'ve learned this';
        btn.disabled = false;
        showPracticeToast('❌ Error saving. Please try again.');
    }
}

// ════════════════════════════════════════
//  PAST ITEMS & STREAK
// ════════════════════════════════════════

async function loadPastItems(practiceType) {
    try {
        const res = await fetch(`/api/bible-memory/get-verses/?practice_type=${practiceType}`);
        const data = await res.json();
        if (data.status === 'success') {
            const items = data.verses || [];
            if (practiceType === 'english') {
                ALL_WORDS = items;
            } else {
                ALL_VERSES = items;
            }
            renderPastItems(practiceType, items);
        }
    } catch (err) {
        console.error('Error loading past items:', err);
    }
}

function renderPastItems(practiceType, items) {
    const isWord = practiceType === 'english';
    const listEl = document.getElementById(isWord ? 'word-past-list' : 'verse-past-list');
    const historyEl = document.getElementById(isWord ? 'word-history' : 'verse-history');
    const streakEl = document.getElementById(isWord ? 'word-streak' : 'verse-streak');
    const reviewBtn = document.getElementById(isWord ? 'word-review-btn' : 'verse-review-btn');

    if (!listEl || !historyEl) return;

    // Sort by created_at descending, take last 7
    const sorted = [...items].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB - dateA;
    });
    const recent = sorted.slice(0, 7);

    if (recent.length === 0) {
        historyEl.style.display = 'none';
        return;
    }

    historyEl.style.display = 'block';

    // Streak display
    const type = isWord ? 'word' : 'verse';
    const streak = parseInt(localStorage.getItem(`practice_streak_${type}`) || '0');
    if (streak > 0) {
        streakEl.innerHTML = `<div class="streak-badge">🔥 ${streak} day${streak !== 1 ? 's' : ''} streak</div>`;
    } else {
        streakEl.innerHTML = '';
    }

    // Render past items
    const today = new Date();
    let html = '';
    recent.forEach(item => {
        const createdDate = item.created_at ? new Date(item.created_at) : null;
        let dateLabel = '';
        if (createdDate) {
            const diffDays = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) dateLabel = 'Today';
            else if (diffDays === 1) dateLabel = 'Yesterday';
            else dateLabel = `${diffDays}d ago`;
        }

        const statusClass = item.mastered ? 'mastered' : 'learning';
        const statusText = item.mastered ? '✓ learned' : 'learning';

        html += `
            <div class="past-item">
                <div class="past-item-left">
                    <span class="past-item-date">${dateLabel}</span>
                    <span class="past-item-word">${escapeHtml(item.reference)}</span>
                </div>
                <span class="past-item-status ${statusClass}">${statusText}</span>
            </div>
        `;
    });
    listEl.innerHTML = html;

    // Show review button if there are mastered items
    const masteredItems = items.filter(v => v.mastered);
    if (reviewBtn) {
        reviewBtn.style.display = masteredItems.length > 0 ? 'flex' : 'none';
    }
}

// ════════════════════════════════════════
//  FLASHCARD QUICK REVIEW
// ════════════════════════════════════════

function startReview(practiceType) {
    const items = practiceType === 'english' ? ALL_WORDS : ALL_VERSES;
    const mastered = items.filter(v => v.mastered);

    if (mastered.length === 0) {
        showPracticeToast('No items to review yet. Learn some first!');
        return;
    }

    // Pick a random mastered item
    REVIEW_ITEM = mastered[Math.floor(Math.random() * mastered.length)];
    REVIEW_ITEM._practiceType = practiceType;

    const overlay = document.getElementById('flashcard-overlay');
    const wordEl = document.getElementById('flashcard-word');
    const promptEl = document.getElementById('flashcard-prompt');
    const answerEl = document.getElementById('flashcard-answer');
    const defEl = document.getElementById('flashcard-definition');
    const actionsEl = document.getElementById('flashcard-actions');

    // Set front
    wordEl.textContent = REVIEW_ITEM.reference;
    promptEl.textContent = practiceType === 'english'
        ? 'Do you remember what this word means?'
        : 'Can you recall this verse?';

    // Set back
    defEl.textContent = REVIEW_ITEM.text;

    // Reset state
    answerEl.classList.remove('revealed');
    actionsEl.innerHTML = `
        <button class="flashcard-btn reveal" onclick="revealFlashcard()">
            Tap to Reveal
        </button>
    `;

    overlay.classList.add('visible');
}

function revealFlashcard() {
    const answerEl = document.getElementById('flashcard-answer');
    const actionsEl = document.getElementById('flashcard-actions');

    answerEl.classList.add('revealed');

    actionsEl.innerHTML = `
        <button class="flashcard-btn forgot" onclick="rateReview(1)">
            😰 Forgot
        </button>
        <button class="flashcard-btn got-it" onclick="rateReview(4)">
            ✅ Got it!
        </button>
    `;
}

async function rateReview(rating) {
    if (!REVIEW_ITEM) return;

    try {
        await practicePost('/api/bible-memory/rate/', {
            id: REVIEW_ITEM.id,
            rating: rating
        });

        closeReview();

        if (rating >= 4) {
            showPracticeToast('🎉 Great recall!');
        } else {
            showPracticeToast('📖 Keep practicing — you\'ll get it!');
        }
    } catch (err) {
        console.error(err);
        showPracticeToast('❌ Error saving review.');
    }
}

function closeReview() {
    const overlay = document.getElementById('flashcard-overlay');
    overlay.classList.remove('visible');
    REVIEW_ITEM = null;
}

// ════════════════════════════════════════
//  SEED VERSES HELPER
// ════════════════════════════════════════

async function seedVerses() {
    try {
        showPracticeToast('📥 Loading curated verses...');
        await practicePost('/api/bible-memory/seed/');
        showPracticeToast('✅ Verses loaded! Refreshing...');
        setTimeout(() => location.reload(), 800);
    } catch (err) {
        console.error(err);
        showPracticeToast('❌ Error loading verses.');
    }
}
