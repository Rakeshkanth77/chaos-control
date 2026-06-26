document.addEventListener('DOMContentLoaded', () => {
    const breakdownCol = document.getElementById('task-breakdown-col');
    const closeBtn = document.getElementById('breakdown-close-btn');
    const taskTitleSpan = document.getElementById('breakdown-task-title');
    const saveStatus = document.getElementById('breakdown-save-status');
    const gridContainer = document.querySelector('.dashboard-grid');

    const whatTextarea = document.getElementById('breakdown-what');
    const definitionTextarea = document.getElementById('breakdown-definition');
    const stepsTextarea = document.getElementById('breakdown-steps');
    const challengesTextarea = document.getElementById('breakdown-challenges');

    let currentTodoId = null;
    let currentTodoTitle = null;
    let debounceTimer = null;

    // Helper to get CSRF token (if needed, but apiPost handles it)
    // apiPost is attached to window in base.html

    /**
     * Show saving status in the indicator
     */
    function showSaving() {
        if (saveStatus) {
            saveStatus.textContent = 'Saving...';
            saveStatus.style.opacity = '0.8';
        }
    }

    /**
     * Show saved status in the indicator
     */
    function showSaved() {
        if (saveStatus) {
            saveStatus.textContent = 'Saved';
            saveStatus.style.opacity = '0.5';
        }
    }

    /**
     * Show error status in the indicator
     */
    function showError() {
        if (saveStatus) {
            saveStatus.textContent = 'Error saving changes';
            saveStatus.style.opacity = '1';
        }
    }

    /**
     * Auto-grow a textarea to fit its content height.
     * Resets to auto first so shrinking also works.
     */
    function autoGrow(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    /**
     * Open the breakdown panel for a specific task
     */
    async function openTaskBreakdown(todoId, todoTitle, todoElement) {
        if (!todoId) return;

        currentTodoTitle = todoTitle;

        // Clear active states on all items and set this one as active
        document.querySelectorAll('.todo-item').forEach(item => {
            item.classList.remove('active-breakdown');
        });
        if (todoElement) {
            todoElement.classList.add('active-breakdown');
        } else {
            // Find in DOM if opened from page load
            const domEl = document.querySelector(`.todo-item[data-id="${todoId}"]`);
            if (domEl) domEl.classList.add('active-breakdown');
        }

        currentTodoId = todoId;
        localStorage.setItem('active_breakdown_todo_id', todoId);

        // Update Title
        if (taskTitleSpan) {
            taskTitleSpan.textContent = todoTitle;
        }

        // Show panel
        if (breakdownCol) {
            breakdownCol.style.display = 'flex';
        }
        if (gridContainer) {
            gridContainer.classList.add('breakdown-open');
        }

        // Clear textareas while loading
        whatTextarea.value = '';
        definitionTextarea.value = '';
        stepsTextarea.value = '';
        challengesTextarea.value = '';

        // Fetch task details from API
        try {
            const res = await fetch(`/api/todo/breakdown/${todoId}/`);
            if (!res.ok) throw new Error('Failed to fetch breakdown details');
            const data = await res.json();

            if (data.status === 'success') {
                // Only populate if we're still looking at the same task
                if (currentTodoId === todoId) {
                    // Auto-populate "what" with task title if blank — saves re-typing
                    whatTextarea.value = data.what || todoTitle;
                    definitionTextarea.value = data.definition || '';
                    stepsTextarea.value = data.steps || '';
                    challengesTextarea.value = data.challenges || '';

                    // Resize all textareas after population
                    [whatTextarea, definitionTextarea, stepsTextarea, challengesTextarea].forEach(autoGrow);

                    showSaved();
                }
            }
        } catch (err) {
            console.error(err);
            if (currentTodoId === todoId) {
                // Still pre-fill "what" with the task title on error
                whatTextarea.value = todoTitle;
                definitionTextarea.value = '';
                stepsTextarea.value = '';
                challengesTextarea.value = '';
                [whatTextarea, definitionTextarea, stepsTextarea, challengesTextarea].forEach(autoGrow);
                saveStatus.textContent = 'Failed to load data';
                saveStatus.style.opacity = '1';
            }
        }
    }

    /**
     * Close the task breakdown panel
     */
    function closeTaskBreakdown() {
        currentTodoId = null;
        currentTodoTitle = null;
        localStorage.removeItem('active_breakdown_todo_id');

        document.querySelectorAll('.todo-item').forEach(item => {
            item.classList.remove('active-breakdown');
        });

        if (breakdownCol) {
            breakdownCol.style.display = 'none';
        }
        if (gridContainer) {
            gridContainer.classList.remove('breakdown-open');
        }

        // Clear values to avoid quick flashes next time
        whatTextarea.value = '';
        definitionTextarea.value = '';
        stepsTextarea.value = '';
        challengesTextarea.value = '';
    }

    /**
     * Handle input auto-save changes (debounced)
     */
    function handleInput(e) {
        if (!currentTodoId) return;

        // Auto-grow the textarea that was just typed in
        autoGrow(e.target);

        showSaving();
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
            const payload = {
                id: currentTodoId,
                what: whatTextarea.value,
                definition: definitionTextarea.value,
                steps: stepsTextarea.value,
                challenges: challengesTextarea.value,
            };

            try {
                // Utilizing window.apiPost configured globally in dashboard
                const response = await window.apiPost('/api/todo/breakdown/save/', payload);
                if (response.status === 'success') {
                    showSaved();
                } else {
                    showError();
                }
            } catch (err) {
                console.error(err);
                showError();
            }
        }, 800);
    }

    // Attach text area input event listeners
    [whatTextarea, definitionTextarea, stepsTextarea, challengesTextarea].forEach(textarea => {
        if (textarea) {
            textarea.addEventListener('input', handleInput);
        }
    });

    // Close button click handler
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTaskBreakdown);
    }

    // Global document event delegation for todo item selection
    document.addEventListener('click', (e) => {
        const todoItem = e.target.closest('.todo-item');
        if (!todoItem) return;

        // Skip interactive input elements inside the todo item so they don't open the breakdown
        if (e.target.closest('.todo-checkbox') ||
            e.target.closest('.todo-edit-input') ||
            e.target.closest('.action-btn.edit') ||
            e.target.closest('.action-btn.delete') ||
            e.target.closest('.todo-inline-edit-wrapper')) {
            return;
        }

        const id = todoItem.dataset.id;
        const titleSpan = todoItem.querySelector('.todo-text');
        const title = titleSpan ? titleSpan.textContent.trim() : 'Task Breakdown';

        openTaskBreakdown(id, title, todoItem);
    });

    // Check if there was an active breakdown open previously and restore it
    const lastActiveTodoId = localStorage.getItem('active_breakdown_todo_id');
    if (lastActiveTodoId) {
        // Run after a tiny delay so other scripts have loaded / initialized
        setTimeout(() => {
            const targetTodo = document.querySelector(`.todo-item[data-id="${lastActiveTodoId}"]`);
            if (targetTodo) {
                const titleSpan = targetTodo.querySelector('.todo-text');
                const title = titleSpan ? titleSpan.textContent.trim() : 'Task Breakdown';
                openTaskBreakdown(lastActiveTodoId, title, targetTodo);
            } else {
                // If todo was completed/deleted in the meantime, clean localStorage
                localStorage.removeItem('active_breakdown_todo_id');
            }
        }, 300);
    }
});
