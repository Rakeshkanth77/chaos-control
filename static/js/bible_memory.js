// ════════════════════════════════════════
//  BIBLE MEMORY CONTROLLER (SPA BEHAVIOR)
// ════════════════════════════════════════

let ALL_VERSES = [];
let GOAL_TARGET = 500;
let SELECTED_CATEGORY = 'all';
let SEARCH_QUERY = '';

// Session state variables
let sessionMode = 'learn';
let sessionQueue = [];
let sessionIdx = 0;
let sessionMastered = 0;
let currentV = null;

// Learn step 1 read counter
let readStep = 0;

// Cloze test variables
let clozeHidden = new Set();

// ════════════════════════════════════════
//  DOM INITIALIZATION & DATA LOADING
// ════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();

    // Attach search event
    const searchBox = document.getElementById('verse-search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => {
            SEARCH_QUERY = e.target.value.toLowerCase();
            applyFilters();
        });
    }

    // Attach goal click handler
    const goalLabel = document.getElementById('goal-label-display');
    if (goalLabel) {
        goalLabel.addEventListener('click', editGoalTarget);
    }
});

// Helper for CSRF-protected JSON POST
async function bibleApiPost(url, body = {}) {
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

async function loadLibrary() {
    try {
        const response = await fetch('/api/bible-memory/get-verses/');
        const data = await response.json();
        if (data.status === 'success') {
            ALL_VERSES = data.verses;
            GOAL_TARGET = data.goal;
            updateOverviewStats();
            renderCategoryChips();
            applyFilters();
        } else {
            showToast('❌ Error loading scripture library.');
        }
    } catch (err) {
        console.error(err);
        showToast('❌ Could not connect to the database.');
    }
}

// ════════════════════════════════════════
//  OVERVIEW & LIBRARY RENDERING
// ════════════════════════════════════════

function updateOverviewStats() {
    const total = ALL_VERSES.length;
    const mastered = ALL_VERSES.filter(v => v.mastered).length;
    
    // Calculate Due Count
    const now = new Date();
    const dueCount = ALL_VERSES.filter(v => {
        // A verse is due if not mastered, or if it is scheduled for review now/past
        const nextReviewDate = new Date(v.next_review);
        return nextReviewDate <= now;
    }).length;

    // UI counts
    document.getElementById('mastered-count-display').textContent = mastered;
    document.getElementById('goal-count-display').textContent = GOAL_TARGET;
    document.getElementById('stat-due-count').textContent = dueCount;
    document.getElementById('stat-total-count').textContent = total;
    document.getElementById('library-count-label').textContent = `${total} verse${total !== 1 ? 's' : ''}`;

    // Update Mode review button label
    const modeBadgeDue = document.getElementById('mode-badge-due');
    if (modeBadgeDue) {
        modeBadgeDue.textContent = `${dueCount} due`;
        if (dueCount > 0) {
            modeBadgeDue.className = 'bm-mode-badge bm-badge-red';
        } else {
            modeBadgeDue.className = 'bm-mode-badge bm-badge-green';
        }
    }

    // Progress Bar
    const pct = Math.min(100, total > 0 ? (mastered / GOAL_TARGET) * 100 : 0);
    document.getElementById('hero-progress-bar').style.width = `${pct}%`;
    document.getElementById('progress-percent-label').textContent = `${Math.round(pct)}% of goal reached`;
}

function renderCategoryChips() {
    // Get unique categories
    const categories = ['all', ...new Set(ALL_VERSES.map(v => v.category).filter(Boolean))];
    const container = document.getElementById('category-chips-container');
    if (!container) return;

    let html = '';
    categories.forEach(cat => {
        const count = cat === 'all' 
            ? ALL_VERSES.length 
            : ALL_VERSES.filter(v => v.category === cat).length;
        
        const activeClass = SELECTED_CATEGORY === cat ? 'active' : '';
        const displayName = cat === 'all' ? 'All' : cat;
        
        html += `
            <div class="bm-chip ${activeClass}" data-category="${cat}" onclick="filterByCategory('${cat}', this)">
                ${displayName} <span class="bm-chip-count">${count}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

function filterByCategory(cat, el) {
    SELECTED_CATEGORY = cat;
    document.querySelectorAll('.bm-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    applyFilters();
}

function applyFilters() {
    const tableBody = document.getElementById('verse-table-body');
    if (!tableBody) return;

    let filtered = ALL_VERSES;

    // Category Filter
    if (SELECTED_CATEGORY !== 'all') {
        filtered = filtered.filter(v => v.category === SELECTED_CATEGORY);
    }

    // Search Query Filter
    if (SEARCH_QUERY) {
        filtered = filtered.filter(v => 
            v.reference.toLowerCase().includes(SEARCH_QUERY) || 
            v.text.toLowerCase().includes(SEARCH_QUERY) ||
            v.category.toLowerCase().includes(SEARCH_QUERY)
        );
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center" style="color: var(--text-secondary); padding: 30px;">
                    No verses found matching the active filters.
                </td>
            </tr>
        `;
        return;
    }

    const now = new Date();
    let html = '';
    filtered.forEach(v => {
        // Status tag
        let statusTag = '';
        const nextReviewDate = new Date(v.next_review);
        if (v.mastered) {
            statusTag = `<span class="bm-verse-status-tag status-mastered">Mastered</span>`;
        } else if (nextReviewDate <= now) {
            statusTag = `<span class="bm-verse-status-tag status-due">Due Review</span>`;
        } else {
            statusTag = `<span class="bm-verse-status-tag status-learning">Learning</span>`;
        }

        const excerpt = v.text.length > 50 ? v.text.substring(0, 47) + '...' : v.text;

        html += `
            <tr data-id="${v.id}">
                <td><span class="bm-verse-ref">${escapeHtml(v.reference)}</span></td>
                <td><span class="bm-verse-text-excerpt" title="${escapeHtml(v.text)}">${escapeHtml(excerpt)}</span></td>
                <td><span class="bm-verse-cat-tag">${escapeHtml(v.category)}</span></td>
                <td>${statusTag}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="action-btn" onclick="editVerse(${v.id})" title="Edit Verse">✏️</button>
                    <button class="action-btn delete" onclick="deleteVerse(${v.id})" title="Delete Verse">🗑️</button>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// ════════════════════════════════════════
//  VERSE ADD / EDIT / DELETE ACTIONS
// ════════════════════════════════════════

function toggleCustomCategory(select) {
    const customInput = document.getElementById('verse-category-custom-input');
    if (select.value === 'Custom') {
        customInput.style.display = 'block';
        customInput.required = true;
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }
}

async function autoFetchVerseText() {
    const refInput = document.getElementById('verse-ref-input');
    const ref = refInput.value.trim();
    if (!ref) {
        showToast('⚠️ Please enter a reference first (e.g. Joshua 1:9).');
        refInput.focus();
        return;
    }

    const fetchBtn = document.getElementById('fetch-verse-btn');
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Searching...';

    try {
        const response = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=kjv`);
        if (!response.ok) throw new Error('Scripture reference not found');
        const data = await response.json();
        
        document.getElementById('verse-text-input').value = data.text.trim();
        showToast(`✓ Fetched text for ${data.reference}`);
    } catch (err) {
        console.error(err);
        showToast('❌ Could not auto-fill. Please type scripture manually.');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Auto-Fill 🔍';
    }
}

async function handleVerseSubmit(e) {
    e.preventDefault();

    const idVal = document.getElementById('edit-verse-id').value;
    const reference = document.getElementById('verse-ref-input').value.trim();
    const text = document.getElementById('verse-text-input').value.trim();
    const catSelect = document.getElementById('verse-category-input');
    let category = catSelect.value;
    
    if (category === 'Custom') {
        category = document.getElementById('verse-category-custom-input').value.trim();
    }
    const hook = document.getElementById('verse-hook-input').value.trim();
    const context = document.getElementById('verse-context-input').value.trim();

    if (!reference || !text) {
        showToast('⚠️ Reference and Scripture text are required.');
        return;
    }

    const saveBtn = document.getElementById('save-verse-btn');
    saveBtn.disabled = true;

    try {
        if (idVal) {
            // Edit mode
            const res = await bibleApiPost('/api/bible-memory/update-verse/', {
                id: parseInt(idVal),
                reference,
                text,
                category,
                hook,
                context
            });
            if (res.status === 'success') {
                showToast(`✓ Updated ${reference}`);
                // Refresh local model
                const idx = ALL_VERSES.findIndex(v => v.id === res.verse.id);
                if (idx !== -1) {
                    ALL_VERSES[idx] = { ...ALL_VERSES[idx], ...res.verse };
                }
            }
        } else {
            // Add mode
            const res = await bibleApiPost('/api/bible-memory/add-verse/', {
                reference,
                text,
                category,
                hook,
                context
            });
            if (res.status === 'success') {
                showToast(`✓ Added ${reference} to library`);
                ALL_VERSES.push(res.verse);
            }
        }

        // Clean UI form and refresh
        resetVerseForm();
        updateOverviewStats();
        renderCategoryChips();
        applyFilters();

    } catch (err) {
        console.error(err);
        showToast(`❌ Error: ${err.message}`);
    } finally {
        saveBtn.disabled = false;
    }
}

function editVerse(id) {
    const v = ALL_VERSES.find(item => item.id === id);
    if (!v) return;

    // Switch form state
    document.getElementById('verse-form-title').textContent = 'Edit Memory Verse';
    document.getElementById('save-verse-btn').textContent = 'Save Changes';
    document.getElementById('edit-verse-id').value = v.id;
    document.getElementById('verse-ref-input').value = v.reference;
    document.getElementById('verse-text-input').value = v.text;
    document.getElementById('verse-hook-input').value = v.hook || '';
    document.getElementById('verse-context-input').value = v.context || '';
    document.getElementById('clear-form-btn').style.display = 'block';

    const catSelect = document.getElementById('verse-category-input');
    const customInput = document.getElementById('verse-category-custom-input');
    
    // Check if category matches dropdown
    const options = Array.from(catSelect.options).map(o => o.value);
    if (options.includes(v.category)) {
        catSelect.value = v.category;
        customInput.style.display = 'none';
        customInput.value = '';
    } else {
        catSelect.value = 'Custom';
        customInput.style.display = 'block';
        customInput.value = v.category;
    }
    
    // Scroll smoothly to the form
    document.getElementById('verse-form').scrollIntoView({ behavior: 'smooth' });
}

async function deleteVerse(id) {
    const v = ALL_VERSES.find(item => item.id === id);
    if (!v) return;

    const confirmed = await window.confirmDialog({
        title: 'Delete Verse',
        message: `Are you sure you want to remove ${v.reference} from your memory library?`,
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });

    if (confirmed) {
        try {
            const res = await bibleApiPost('/api/bible-memory/delete-verse/', { id });
            if (res.status === 'success') {
                showToast(`Deleted ${v.reference}`);
                ALL_VERSES = ALL_VERSES.filter(item => item.id !== id);
                
                // Clear form if we deleted the verse being edited
                const editingId = document.getElementById('edit-verse-id').value;
                if (editingId && parseInt(editingId) === id) {
                    resetVerseForm();
                }

                updateOverviewStats();
                renderCategoryChips();
                applyFilters();
            }
        } catch (err) {
            console.error(err);
            showToast('❌ Error deleting verse.');
        }
    }
}

function resetVerseForm() {
    document.getElementById('verse-form-title').textContent = 'Add Memory Verse';
    document.getElementById('save-verse-btn').textContent = '+ Add Verse';
    document.getElementById('edit-verse-id').value = '';
    document.getElementById('verse-ref-input').value = '';
    document.getElementById('verse-text-input').value = '';
    document.getElementById('verse-hook-input').value = '';
    document.getElementById('verse-context-input').value = '';
    document.getElementById('clear-form-btn').style.display = 'none';
    
    const catSelect = document.getElementById('verse-category-input');
    catSelect.value = 'Fear';
    toggleCustomCategory(catSelect);
}

async function editGoalTarget() {
    const goalStr = prompt('Enter your target number of verses to memorize:', GOAL_TARGET);
    if (goalStr === null) return;
    
    const goal = parseInt(goalStr);
    if (isNaN(goal) || goal <= 0) {
        alert('Please enter a valid positive number.');
        return;
    }

    try {
        const res = await bibleApiPost('/api/bible-memory/update-goal/', { goal });
        if (res.status === 'success') {
            GOAL_TARGET = res.goal;
            updateOverviewStats();
            showToast(`Goal updated to ${GOAL_TARGET} verses!`);
        }
    } catch (err) {
        console.error(err);
        showToast('❌ Error updating goal.');
    }
}

async function seedDefaultCollection() {
    const confirmed = await window.confirmDialog({
        title: 'Seed Default Scriptures',
        message: 'This will seed 15 popular verses across categories like Fear, Worship, Courage, Peace, and Strength. Continue?',
        confirmText: 'Seed',
        cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
        showToast('Seeding database...');
        const res = await bibleApiPost('/api/bible-memory/seed/');
        if (res.status === 'success') {
            showToast(`✓ Seeding complete! Seeded ${res.seeded_count} new verses.`);
            loadLibrary();
        }
    } catch (err) {
        console.error(err);
        showToast('❌ Error seeding verses.');
    }
}

// ════════════════════════════════════════
//  DRILL WORKSPACE CONTROLLER
// ════════════════════════════════════════

function startSession(mode) {
    sessionMode = mode;
    sessionQueue = [];
    sessionIdx = 0;
    sessionMastered = 0;
    currentV = null;

    const now = new Date();

    if (mode === 'review') {
        // Verses that are due review (next_review <= now)
        sessionQueue = ALL_VERSES.filter(v => new Date(v.next_review) <= now);
        if (sessionQueue.length === 0) {
            showToast('🎉 No verses due review today! Select another mode.');
            return;
        }
        shuffle(sessionQueue);
    } else if (mode === 'learn') {
        // Verses that haven't been reviewed yet or have lowest review count
        sessionQueue = ALL_VERSES.filter(v => v.review_count === 0 && !v.mastered);
        if (sessionQueue.length === 0) {
            // Fallback: load any unmastered verses
            sessionQueue = ALL_VERSES.filter(v => !v.mastered);
        }
        if (sessionQueue.length === 0) {
            showToast('🏆 You have mastered all verses in your library! Add more verses to learn.');
            return;
        }
        shuffle(sessionQueue);
    } else {
        // Quick recall or type cold (applies to all library verses)
        sessionQueue = [...ALL_VERSES];
        if (sessionQueue.length === 0) {
            showToast('⚠️ Your library is empty. Please add some verses first.');
            return;
        }
        shuffle(sessionQueue);
    }

    // Toggle views
    document.getElementById('bm-main-view').style.display = 'none';
    document.getElementById('bm-drill-view').style.display = 'block';
    
    // Set headers
    const modeNames = {
        learn: 'Learn Verse',
        review: 'Review Due',
        quick: 'Quick Recall (Oral)',
        type: 'Type Cold'
    };
    document.getElementById('drill-title-lbl').textContent = modeNames[mode] || 'Study Session';

    loadNextVerse();
}

function loadNextVerse() {
    showPhase('phase-loading');
    document.getElementById('drill-loading-msg').textContent = 'Preparing next scripture...';

    if (sessionQueue.length > sessionIdx) {
        currentV = sessionQueue[sessionIdx];
        renderActivePhase();
    } else {
        showCelebration();
    }
}

function renderActivePhase() {
    const tot = sessionQueue.length;
    document.getElementById('drill-progress-bar').style.width = `${(sessionIdx / tot) * 100}%`;
    document.getElementById('drill-counter-lbl').textContent = `${sessionIdx + 1} / ${tot} (✓ ${sessionMastered} mastered)`;

    if (sessionMode === 'learn') {
        startReadPhase();
    } else if (sessionMode === 'quick' || sessionMode === 'review') {
        startQuickPhase();
    } else if (sessionMode === 'type') {
        startTypePhase();
    }
}

function showPhase(phaseId) {
    document.querySelectorAll('.bm-phase-box').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(phaseId);
    if (target) target.classList.add('active');
}

function exitDrill() {
    document.getElementById('bm-drill-view').style.display = 'none';
    document.getElementById('bm-main-view').style.display = 'block';
    loadLibrary(); // refresh statistics and lists
}

// ── STEP 1: READ PHASE ──
function startReadPhase() {
    readStep = 0;
    renderDrillSteps('read-steps-indicator', 1);

    document.getElementById('read-ref-lbl').textContent = `${currentV.reference} · Category: ${currentV.category}`;
    document.getElementById('read-text-lbl').innerHTML = highlightKeywords(currentV.text);

    // Show optional info
    const hookStrip = document.getElementById('read-hook-strip');
    const hookLbl = document.getElementById('read-hook-lbl');
    if (currentV.hook) {
        hookStrip.style.display = 'block';
        hookLbl.textContent = currentV.hook;
    } else {
        hookStrip.style.display = 'none';
    }

    const contextStrip = document.getElementById('read-context-strip');
    const contextLbl = document.getElementById('read-context-lbl');
    if (currentV.context) {
        contextStrip.style.display = 'block';
        contextLbl.textContent = currentV.context;
    } else {
        contextStrip.style.display = 'none';
    }

    updateReadDots();
    document.getElementById('read-next-btn').textContent = 'Read Again →';
    showPhase('phase-read');
}

function highlightKeywords(text) {
    const common = new Set([
        'which', 'their', 'shall', 'that', 'thou', 'thee', 'they', 'have', 'from', 'with', 'this', 'into',
        'unto', 'upon', 'were', 'also', 'when', 'then', 'there', 'being', 'these', 'those', 'them', 'your',
        'been', 'will', 'said', 'more', 'even', 'only', 'about', 'before', 'after', 'every'
    ]);
    return text.split(/\s+/).map(w => {
        const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (clean.length > 4 && !common.has(clean)) {
            return `<span class="highlight-word">${w}</span>`;
        }
        return w;
    }).join(' ');
}

function updateReadDots() {
    const dots = document.querySelectorAll('#read-dots-container .bm-read-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i <= readStep);
    });

    const messages = [
        'Read it carefully. Take in the wording.',
        'Read it again — emphasize the keywords.',
        'One more time. Commit the flow to memory.'
    ];
    document.getElementById('read-status-msg').textContent = messages[readStep] || '';
}

function advanceRead() {
    readStep++;
    if (readStep < 3) {
        updateReadDots();
        if (readStep === 2) {
            document.getElementById('read-next-btn').textContent = 'Next: Fill Blanks →';
        }
    } else {
        startClozePhase();
    }
}

// ── STEP 2: CLOZE PHASE ──
function startClozePhase() {
    renderDrillSteps('cloze-steps-indicator', 2);
    document.getElementById('cloze-ref-lbl').textContent = currentV.reference;
    document.getElementById('cloze-hook-lbl').textContent = currentV.hook ? `Hook: ${currentV.hook}` : '';

    const words = currentV.text.split(/\s+/);
    const tiny = new Set(['a', 'an', 'the', 'of', 'in', 'is', 'to', 'and', 'or', 'but', 'for', 'not', 'my', 'me', 'he', 'we', 'be', 'it', 'at', 'by', 'do', 'go', 'no', 'so', 'up', 'as', 'on', 'if', 'i']);
    
    // Select candidates to hide
    const candidates = words
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => w.replace(/[^a-zA-Z]/g, '').length > 2 && !tiny.has(w.replace(/[^a-zA-Z]/g, '').toLowerCase()));

    // Hide up to 40% of candidate words
    const hideCount = Math.max(2, Math.floor(candidates.length * 0.4));
    const shuffledCands = shuffle([...candidates]);
    const pickedIdx = shuffledCands.slice(0, hideCount).map(c => c.i);
    clozeHidden = new Set(pickedIdx);

    // Render HTML with inputs
    let html = '';
    words.forEach((w, i) => {
        if (clozeHidden.has(i)) {
            const bare = w.replace(/[^a-zA-Z']/g, '');
            const trail = w.replace(/[a-zA-Z']/g, '');
            const width = Math.max(60, bare.length * 13) + 'px';
            html += `<input class="bm-blank-input" id="c-input-${i}" data-idx="${i}" data-word="${bare}" style="width:${width}" maxlength="${bare.length + 2}" autocomplete="off" autocorrect="off" spellcheck="false">${trail} `;
        } else {
            html += w + ' ';
        }
    });

    document.getElementById('cloze-verse-container').innerHTML = html;
    document.getElementById('cloze-status-lbl').textContent = 'Fill in the blanks';
    document.getElementById('cloze-status-lbl').style.color = '';
    document.getElementById('cloze-next-btn').disabled = true;

    // Add event listeners to blanks
    clozeHidden.forEach(i => {
        const inp = document.getElementById(`c-input-${i}`);
        if (inp) {
            inp.addEventListener('input', checkClozeInput);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') focusNextBlank(i);
            });
        }
    });

    showPhase('phase-cloze');
    
    // Auto-focus first blank
    const sortedBlanks = [...clozeHidden].sort((a, b) => a - b);
    setTimeout(() => {
        const firstInput = document.getElementById(`c-input-${sortedBlanks[0]}`);
        if (firstInput) firstInput.focus();
    }, 150);
}

function checkClozeInput(e) {
    const inp = e.target;
    const target = inp.dataset.word.toLowerCase();
    const val = inp.value.replace(/[^a-zA-Z']/g, '').toLowerCase();

    if (val === target) {
        inp.classList.add('correct');
        inp.classList.remove('wrong');
    } else if (val.length >= target.length) {
        inp.classList.add('wrong');
        inp.classList.remove('correct');
    } else {
        inp.classList.remove('correct', 'wrong');
    }

    // Verify all correct
    const allCorrect = [...clozeHidden].every(i => {
        const el = document.getElementById(`c-input-${i}`);
        return el && el.classList.contains('correct');
    });

    if (allCorrect) {
        document.getElementById('cloze-status-lbl').textContent = '✓ All blanks filled correctly!';
        document.getElementById('cloze-status-lbl').style.color = '#10b981';
        document.getElementById('cloze-next-btn').disabled = false;
    } else {
        const countCorrect = [...clozeHidden].filter(i => {
            const el = document.getElementById(`c-input-${i}`);
            return el && el.classList.contains('correct');
        }).length;
        document.getElementById('cloze-status-lbl').textContent = `${countCorrect} / ${clozeHidden.size} correct`;
        document.getElementById('cloze-status-lbl').style.color = '';
    }
}

function focusNextBlank(currIdx) {
    const sorted = [...clozeHidden].sort((a, b) => a - b);
    const pos = sorted.indexOf(currIdx);
    if (pos < sorted.length - 1) {
        const nextInp = document.getElementById(`c-input-${sorted[pos + 1]}`);
        if (nextInp) nextInp.focus();
    } else {
        // If last blank, check if we can submit
        const nextBtn = document.getElementById('cloze-next-btn');
        if (!nextBtn.disabled) {
            nextBtn.click();
        }
    }
}

function clozeHint() {
    [...clozeHidden].forEach(i => {
        const inp = document.getElementById(`c-input-${i}`);
        if (inp && !inp.classList.contains('correct')) {
            const word = inp.dataset.word;
            if (!inp.value) inp.value = word[0]; // Seed first letter
            inp.dispatchEvent(new Event('input'));
        }
    });
}

function gotoClozeNext() {
    // Fill all remaining with correct values (reveal corrections)
    [...clozeHidden].forEach(i => {
        const inp = document.getElementById(`c-input-${i}`);
        if (inp && !inp.classList.contains('correct')) {
            inp.value = inp.dataset.word;
            inp.classList.add('correct');
        }
    });

    setTimeout(() => {
        startTypePhase();
    }, 300);
}

// ── STEP 3: TYPE PHASE ──
function startTypePhase() {
    if (sessionMode === 'learn') {
        renderDrillSteps('type-steps-indicator', 3);
    } else {
        // Hide steps if we went straight here
        const indicator = document.getElementById('type-steps-indicator');
        if (indicator) indicator.innerHTML = '';
    }

    document.getElementById('type-ref-lbl').textContent = currentV.reference;
    document.getElementById('type-attempt-input').value = '';

    const hookStrip = document.getElementById('type-hook-strip');
    const hookLbl = document.getElementById('type-hook-lbl');
    if (currentV.hook) {
        hookStrip.style.display = 'block';
        hookLbl.textContent = currentV.hook;
    } else {
        hookStrip.style.display = 'none';
    }

    showPhase('phase-type');
    
    setTimeout(() => {
        const textarea = document.getElementById('type-attempt-input');
        if (textarea) textarea.focus();
    }, 150);
}

function checkTyped() {
    const attempt = document.getElementById('type-attempt-input').value.trim();
    if (!attempt) {
        showToast('⚠️ Type your attempt, even if you guess!');
        return;
    }

    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanAttemptWords = attempt.split(/\s+/).filter(Boolean);
    const cleanKJVWords = currentV.text.split(/\s+/).filter(Boolean);

    // Calculate match score
    let matches = 0;
    cleanKJVWords.forEach((word, idx) => {
        if (cleanAttemptWords[idx] && clean(cleanAttemptWords[idx]) === clean(word)) {
            matches++;
        }
    });
    const score = Math.round((matches / cleanKJVWords.length) * 100);

    // Generate comparison html
    const compareHtml = cleanKJVWords.map((word, idx) => {
        const match = cleanAttemptWords[idx] && clean(cleanAttemptWords[idx]) === clean(word);
        return match 
            ? `<span class="match">${word}</span>` 
            : `<span class="miss">${word}</span>`;
    }).join(' ');

    const scoreColor = score >= 85 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    const scoreDesc = score >= 85 ? 'Excellent!' : score >= 50 ? 'Getting closer...' : 'Needs review!';

    const card = document.getElementById('compare-results-card');
    card.innerHTML = `
        <div class="bm-compare-sec">
            <p class="bm-compare-lbl">Your Attempt</p>
            <p class="bm-compare-text" style="color: var(--text-secondary); font-style: italic;">${escapeHtml(attempt)}</p>
        </div>
        <div class="bm-compare-sec">
            <p class="bm-compare-lbl">KJV — ${escapeHtml(currentV.reference)}</p>
            <p class="bm-compare-text">${compareHtml}</p>
        </div>
        <div class="bm-score-badge">
            <p class="bm-score-pct" style="color: ${scoreColor}">${score}%</p>
            <p class="bm-score-desc">${scoreDesc}</p>
        </div>
    `;

    showPhase('phase-compare');
}

// ── STEP 4: ORAL QUICK RECALL PHASE ──
function startQuickPhase() {
    document.getElementById('quick-ref-lbl').textContent = `${currentV.reference} · Category: ${currentV.category}`;
    
    const hookStrip = document.getElementById('quick-hook-strip');
    const hookLbl = document.getElementById('quick-hook-lbl');
    if (currentV.hook) {
        hookStrip.style.display = 'block';
        hookLbl.textContent = currentV.hook;
    } else {
        hookStrip.style.display = 'none';
    }

    document.getElementById('quick-revealed-section').style.display = 'none';
    document.getElementById('quick-reveal-btn').style.display = 'block';

    showPhase('phase-quick');
}

function revealQuickVerse() {
    document.getElementById('quick-text-lbl').textContent = currentV.text;
    document.getElementById('quick-revealed-section').style.display = 'block';
    document.getElementById('quick-reveal-btn').style.display = 'none';
}

// ── RATINGS & RECORDING PROGRESS ──
async function rateVerse(rating) {
    try {
        const res = await bibleApiPost('/api/bible-memory/rate/', {
            id: currentV.id,
            rating: rating
        });

        if (res.status === 'success') {
            // Update local memory cache values
            const idx = ALL_VERSES.findIndex(v => v.id === res.verse.id);
            if (idx !== -1) {
                ALL_VERSES[idx].mastered = res.verse.mastered;
                ALL_VERSES[idx].next_review = res.verse.next_review;
                ALL_VERSES[idx].interval_days = res.verse.interval_days;
            }

            if (rating === 4) {
                sessionMastered++;
                showToast(`✓ Mastered ${res.verse.reference}!`);
            } else if (rating === 1) {
                // Fail: add back into session queue 2 slots later to review again
                sessionQueue.splice(sessionIdx + 2, 0, currentV);
                showToast('Added back to session. You will see it again soon.');
            } else {
                showToast('Review recorded.');
            }

            sessionIdx++;
            
            // Limit session blocks: show Done screen after completing 5 verses
            if (sessionIdx > 0 && sessionIdx % 5 === 0) {
                showCelebration();
            } else {
                loadNextVerse();
            }
        }
    } catch (err) {
        console.error(err);
        showToast('❌ Error updating spaced repetition status.');
    }
}

function skipVerse() {
    sessionIdx++;
    loadNextVerse();
}

function showCelebration() {
    const masteredCount = sessionMastered;
    const doneMsg = masteredCount === 0
        ? "Review session completed. Consistency is key to remembering!"
        : `Well done! You mastered ${masteredCount} verse${masteredCount !== 1 ? 's' : ''} in this session!`;
        
    document.getElementById('done-message-lbl').textContent = doneMsg;
    showPhase('phase-done');
}

function continueSession() {
    if (sessionIdx >= sessionQueue.length) {
        // No more remaining: restart a new block
        startSession(sessionMode);
    } else {
        // Keep going with queue
        loadNextVerse();
    }
}

// ════════════════════════════════════════
//  DRILL LAYOUT HELPERS
// ════════════════════════════════════════

function renderDrillSteps(elId, activeStep) {
    const steps = [
        { n: 1, lbl: 'Read' },
        { n: 2, lbl: 'Cloze' },
        { n: 3, lbl: 'Type' }
    ];
    const el = document.getElementById(elId);
    if (!el) return;

    el.innerHTML = steps.map(s => {
        let cls = '';
        let dotVal = s.n;
        if (s.n < activeStep) {
            cls = 'done';
            dotVal = '✓';
        } else if (s.n === activeStep) {
            cls = 'active';
        }
        return `
            <div class="bm-step-node ${cls}">
                <div class="bm-step-dot">${dotVal}</div>
                <div class="bm-step-lbl">${s.lbl}</div>
            </div>
        `;
    }).join('');
}

// ════════════════════════════════════════
//  GENERIC UTILITY OPERATIONS
// ════════════════════════════════════════

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

let toastTimeout;
function showToast(msg) {
    const toast = document.getElementById('bm-toast-element');
    if (!toast) return;

    toast.textContent = msg;
    toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}
