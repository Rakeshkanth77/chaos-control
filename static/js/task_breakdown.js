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

    // ── Mobile detection ─────────────────────────────────────────────────────
    function isMobile() {
        return window.innerWidth <= 768;
    }

    // ── Create / get mobile backdrop ──────────────────────────────────────────
    function getMobileBackdrop() {
        let backdrop = document.getElementById('mobile-breakdown-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'mobile-breakdown-backdrop';
            backdrop.className = 'mobile-breakdown-backdrop';
            document.body.appendChild(backdrop);
            backdrop.addEventListener('click', closeTaskBreakdown);
        }
        return backdrop;
    }

    // ── Status helpers ────────────────────────────────────────────────────────
    function showSaving() {
        if (saveStatus) {
            saveStatus.textContent = 'Saving...';
            saveStatus.style.opacity = '0.8';
        }
    }

    function showSaved() {
        if (saveStatus) {
            saveStatus.textContent = 'Saved';
            saveStatus.style.opacity = '0.5';
        }
    }

    function showError() {
        if (saveStatus) {
            saveStatus.textContent = 'Error saving changes';
            saveStatus.style.opacity = '1';
        }
    }

    // ── Auto-grow textarea height ─────────────────────────────────────────────
    function autoGrow(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // ── Open breakdown panel ──────────────────────────────────────────────────
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
            const domEl = document.querySelector(`.todo-item[data-id="${todoId}"]`);
            if (domEl) domEl.classList.add('active-breakdown');
        }

        currentTodoId = todoId;
        localStorage.setItem('active_breakdown_todo_id', todoId);

        // Highlight the current priority badge based on DOM position
        const activeTodoEl = todoElement || document.querySelector(`.todo-item[data-id="${todoId}"]`);
        if (activeTodoEl) {
            const listParent = activeTodoEl.closest('.priority-list');
            const rawPriority = listParent ? (listParent.dataset.priority || 'unassigned') : 'unassigned';
            // Map internal priorities to visual Signal/Noise categories
            // Signal: urgent_important + important_not_urgent
            // Noise: neither + urgent_not_important + stop_todo
            const SIGNAL_PRIORITIES = ['urgent_important', 'important_not_urgent'];
            const NOISE_PRIORITIES = ['neither', 'urgent_not_important', 'stop_todo'];
            let visualPriority = rawPriority;
            if (SIGNAL_PRIORITIES.includes(rawPriority)) {
                visualPriority = 'urgent_important';
            } else if (NOISE_PRIORITIES.includes(rawPriority)) {
                visualPriority = 'neither';
            }
            document.querySelectorAll('.breakdown-priority-selector .p-btn').forEach(btn => {
                if (btn.dataset.priorityVal === visualPriority) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Update title
        if (taskTitleSpan) {
            taskTitleSpan.textContent = todoTitle;
        }

        if (isMobile()) {
            // ── Mobile: show as bottom-sheet modal ────────────────────────────
            const backdrop = getMobileBackdrop();

            if (breakdownCol) {
                breakdownCol.style.display = 'flex';
            }
            // Do NOT add breakdown-open class on mobile (keeps grid at 1fr)
            // but body gets a class to lock scrolling
            document.body.classList.add('breakdown-open-mobile');

            // Trigger backdrop fade-in on next frame
            requestAnimationFrame(() => {
                backdrop.classList.add('active');
            });

        } else {
            // ── Desktop/Tablet: show as additional grid column ─────────────────
            if (breakdownCol) {
                breakdownCol.style.display = 'flex';
            }
            if (gridContainer) {
                gridContainer.classList.add('breakdown-open');
            }
        }

        // Clear textareas while loading
        if (whatTextarea) whatTextarea.value = '';
        if (definitionTextarea) definitionTextarea.value = '';
        if (stepsTextarea) stepsTextarea.value = '';
        if (challengesTextarea) challengesTextarea.value = '';

        // Fetch task details from API
        try {
            const res = await fetch(`/api/todo/breakdown/${todoId}/`);
            if (!res.ok) throw new Error('Failed to fetch breakdown details');
            const data = await res.json();

            if (data.status === 'success') {
                // Only populate if we're still looking at the same task
                if (currentTodoId === todoId) {
                    // Auto-populate "what" with task title if blank — saves re-typing
                    if (whatTextarea) whatTextarea.value = data.what || todoTitle;
                    if (definitionTextarea) definitionTextarea.value = data.definition || '';
                    if (stepsTextarea) stepsTextarea.value = data.steps || '';
                    if (challengesTextarea) challengesTextarea.value = data.challenges || '';

                    // Resize all textareas after population
                    [whatTextarea, definitionTextarea, stepsTextarea, challengesTextarea].forEach(autoGrow);

                    showSaved();
                }
            }
        } catch (err) {
            console.error(err);
            if (currentTodoId === todoId) {
                // Still pre-fill "what" with the task title on error
                if (whatTextarea) whatTextarea.value = todoTitle;
                if (definitionTextarea) definitionTextarea.value = '';
                if (stepsTextarea) stepsTextarea.value = '';
                if (challengesTextarea) challengesTextarea.value = '';
                [whatTextarea, definitionTextarea, stepsTextarea, challengesTextarea].forEach(autoGrow);
                if (saveStatus) {
                    saveStatus.textContent = 'Failed to load data';
                    saveStatus.style.opacity = '1';
                }
            }
        }
    }

    // ── Close breakdown panel ─────────────────────────────────────────────────
    function closeTaskBreakdown() {
        currentTodoId = null;
        currentTodoTitle = null;
        localStorage.removeItem('active_breakdown_todo_id');

        document.querySelectorAll('.todo-item').forEach(item => {
            item.classList.remove('active-breakdown');
        });

        if (isMobile()) {
            // Mobile: hide backdrop and sheet
            const backdrop = document.getElementById('mobile-breakdown-backdrop');
            if (backdrop) {
                backdrop.classList.remove('active');
            }
            document.body.classList.remove('breakdown-open-mobile');

            // Delay hiding the sheet to allow fade animation
            setTimeout(() => {
                if (breakdownCol) {
                    breakdownCol.style.display = 'none';
                }
            }, 300);
        } else {
            // Desktop/tablet: remove grid column
            if (breakdownCol) {
                breakdownCol.style.display = 'none';
            }
            if (gridContainer) {
                gridContainer.classList.remove('breakdown-open');
            }
        }

        // Clear values
        if (whatTextarea) whatTextarea.value = '';
        if (definitionTextarea) definitionTextarea.value = '';
        if (stepsTextarea) stepsTextarea.value = '';
        if (challengesTextarea) challengesTextarea.value = '';
    }

    // ── Auto-save on input (debounced) ────────────────────────────────────────
    function handleInput(e) {
        if (!currentTodoId) return;

        // Auto-grow the textarea that was just typed in
        autoGrow(e.target);

        showSaving();
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
            const payload = {
                id: currentTodoId,
                what: whatTextarea ? whatTextarea.value : '',
                definition: definitionTextarea ? definitionTextarea.value : '',
                steps: stepsTextarea ? stepsTextarea.value : '',
                challenges: challengesTextarea ? challengesTextarea.value : '',
            };

            try {
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

    // Attach textarea input listeners
    [whatTextarea, definitionTextarea, stepsTextarea, challengesTextarea].forEach(textarea => {
        if (textarea) {
            textarea.addEventListener('input', handleInput);
        }
    });

    // Close button handler
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTaskBreakdown);
    }

    // ── Priority Selector Button Click Handler ─────────────────────────────────
    document.querySelectorAll('.breakdown-priority-selector .p-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const newPriority = btn.dataset.priorityVal;
            if (!currentTodoId) return;

            // Optimistically update active button class
            document.querySelectorAll('.breakdown-priority-selector .p-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            try {
                // Call Django update priority API
                const response = await window.apiPost('/api/todo/update-priority/', {
                    id: currentTodoId,
                    priority: newPriority
                });

                if (response.status === 'success') {
                    // Find the todo element and move it to the corresponding list
                    const todoElement = document.querySelector(`.todo-item[data-id="${currentTodoId}"]`);
                    if (todoElement) {
                        const targetListId = newPriority === 'unassigned' ? 'unassigned-todo-list' : `list-${newPriority}`;
                        const targetList = document.getElementById(targetListId);
                        if (targetList) {
                            // Clean up empty state message
                            const emptyMsg = targetList.querySelector('.empty-state-message');
                            if (emptyMsg) emptyMsg.remove();

                            // Move item
                            targetList.appendChild(todoElement);

                            // Sync dropdown selector value
                            const selectEl = todoElement.querySelector('.todo-priority-select');
                            if (selectEl) {
                                selectEl.value = newPriority;
                            }

                            if (window.syncSelectClasses) {
                                window.syncSelectClasses();
                            }

                            // Trigger counts update
                            if (window.updatePriorityCounts) {
                                window.updatePriorityCounts();
                            }
                        }
                    }
                    if (window.showToast) {
                        const linkHtml = newPriority !== 'unassigned'
                            ? ` <a href="#" onclick="event.preventDefault(); window.switchMobileTab('3');" style="color: #2dd4bf; text-decoration: underline; margin-left: 6px; font-weight: 600;">Go to Focus 🎯</a>`
                            : ` <a href="#" onclick="event.preventDefault(); window.switchMobileTab('2');" style="color: #2dd4bf; text-decoration: underline; margin-left: 6px; font-weight: 600;">Go to Tasks 📝</a>`;
                        window.showToast(`✨ Priority successfully updated!${linkHtml}`);
                    }
                }
            } catch (err) {
                console.error('Failed to update priority:', err);
                if (window.showToast) {
                    window.showToast('❌ Error updating priority');
                }
            }
        });
    });

    // ── Global delegation for "details" button clicks on todo items ───────────
    document.addEventListener('click', (e) => {
        // Specifically handle "details" button click
        const detailsBtn = e.target.closest('.action-btn.breakdown');
        if (detailsBtn) {
            e.stopPropagation();
            const todoItem = detailsBtn.closest('.todo-item');
            if (!todoItem) return;
            const id = todoItem.dataset.id;
            const titleSpan = todoItem.querySelector('.todo-text');
            const title = titleSpan ? titleSpan.textContent.trim() : 'Task Breakdown';
            openTaskBreakdown(id, title, todoItem);
            return;
        }

        // Also handle clicking anywhere on a todo item (but not on action buttons)
        const todoItem = e.target.closest('.todo-item');
        if (!todoItem) return;

        // Skip details sheet for unassigned inbox tasks or pending dropdown tasks
        if (todoItem.closest('#unassigned-todo-list') || todoItem.closest('.pending-dropdown-list')) {
            return;
        }

        // Skip interactive input elements inside the todo item
        if (e.target.closest('.todo-checkbox') ||
            e.target.closest('.todo-edit-input') ||
            e.target.closest('.action-btn.edit') ||
            e.target.closest('.action-btn.delete') ||
            e.target.closest('.todo-inline-edit-wrapper') ||
            e.target.closest('.action-btn')) {
            return;
        }

        const id = todoItem.dataset.id;
        const titleSpan = todoItem.querySelector('.todo-text');
        const title = titleSpan ? titleSpan.textContent.trim() : 'Task Breakdown';

        openTaskBreakdown(id, title, todoItem);
    });

    // ── Handle resize between mobile and desktop ──────────────────────────────
    // If user rotates device, clean up the layout
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // If a breakdown is open, re-open in the correct mode
            if (currentTodoId) {
                const todoEl = document.querySelector(`.todo-item[data-id="${currentTodoId}"]`);
                const title = currentTodoTitle || 'Task Breakdown';

                // Close silently then reopen in the new mode
                const savedId = currentTodoId;
                const savedTitle = title;

                // Clean up without clearing the currentTodoId
                if (isMobile()) {
                    // Was desktop mode, switch to mobile
                    if (gridContainer) gridContainer.classList.remove('breakdown-open');
                    if (breakdownCol) {
                        breakdownCol.style.display = 'flex';
                    }
                    const backdrop = getMobileBackdrop();
                    backdrop.classList.add('active');
                    document.body.classList.add('breakdown-open-mobile');
                } else {
                    // Was mobile mode, switch to desktop
                    const backdrop = document.getElementById('mobile-breakdown-backdrop');
                    if (backdrop) backdrop.classList.remove('active');
                    document.body.classList.remove('breakdown-open-mobile');
                    if (breakdownCol) breakdownCol.style.display = 'flex';
                    if (gridContainer) gridContainer.classList.add('breakdown-open');
                }
            }
        }, 200);
    });

    // ── Escape key to close ───────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentTodoId) {
            closeTaskBreakdown();
        }
    });

    // ── Restore last active breakdown on page load ────────────────────────────
    const lastActiveTodoId = localStorage.getItem('active_breakdown_todo_id');
    if (lastActiveTodoId) {
        setTimeout(() => {
            const targetTodo = document.querySelector(`.todo-item[data-id="${lastActiveTodoId}"]`);
            if (targetTodo) {
                const titleSpan = targetTodo.querySelector('.todo-text');
                const title = titleSpan ? titleSpan.textContent.trim() : 'Task Breakdown';
                openTaskBreakdown(lastActiveTodoId, title, targetTodo);
            } else {
                localStorage.removeItem('active_breakdown_todo_id');
            }
        }, 300);
    }

    // ── End-of-day auto-clear ─────────────────────────────────────────────────
    function scheduleBreakdownEODClear() {
        const now = new Date();
        const eod = new Date();
        eod.setHours(23, 59, 0, 0);

        let msUntilEOD = eod - now;
        if (msUntilEOD <= 0) {
            msUntilEOD += 24 * 60 * 60 * 1000;
        }

        setTimeout(() => {
            closeTaskBreakdown();
            scheduleBreakdownEODClear();
        }, msUntilEOD);
    }

    scheduleBreakdownEODClear();
});
