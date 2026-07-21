document.addEventListener('DOMContentLoaded', () => {
    const todoLists = document.querySelectorAll('.priority-list');
    const quickAddForm = document.getElementById('quick-add-todo');
    const newTodoInput = document.getElementById('new-todo-title');

    // Update the counter badges for each priority block
    function updatePriorityCounts() {
        const counts = {
            'stop_todo': 0,
            'urgent_important': 0,
            'important_not_urgent': 0,
            'urgent_not_important': 0,
            'neither': 0
        };

        Object.keys(counts).forEach(priority => {
            const list = document.getElementById(`list-${priority}`);
            if (list) {
                // Only count active (incomplete) todos
                const activeCount = list.querySelectorAll('.todo-item:not(.completed)').length;
                counts[priority] = activeCount;
                
                const badge = document.getElementById(`count-${priority}`);
                if (badge) {
                    badge.textContent = activeCount;
                }
            }
        });
    }

    // Helper to toggle is-unassigned class and apply dot wrappers (global)
    function syncSelectClasses() {
        document.querySelectorAll('.todo-priority-select').forEach(select => {
            // Set data-priority attribute for reference
            select.dataset.priority = select.value;

            if (select.value === 'unassigned') {
                select.classList.add('is-unassigned');
                // Unwrap if previously wrapped
                const wrapper = select.parentElement;
                if (wrapper && wrapper.classList.contains('priority-dot-wrapper')) {
                    wrapper.replaceWith(select);
                }
            } else {
                select.classList.remove('is-unassigned');
                // Wrap in colored dot span if not already wrapped
                const wrapper = select.parentElement;
                if (wrapper && wrapper.classList.contains('priority-dot-wrapper')) {
                    // Already wrapped — just update color
                    wrapper.dataset.priority = select.value;
                } else {
                    const dot = document.createElement('span');
                    dot.className = 'priority-dot-wrapper';
                    dot.dataset.priority = select.value;
                    select.parentNode.insertBefore(dot, select);
                    dot.appendChild(select);
                }
            }
        });
    }

    // Initialize counts on load
    updatePriorityCounts();
    syncSelectClasses();
    window.updatePriorityCounts = updatePriorityCounts;
    window.syncSelectClasses = syncSelectClasses;

    // Toggle todo complete handler (using delegation)
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('todo-checkbox')) {
            const todoItem = e.target.closest('.todo-item');
            const id = todoItem.dataset.id;
            
            todoItem.classList.toggle('completed', e.target.checked);
            
            try {
                await window.apiPost('/api/todo/toggle/', { id });
                updatePriorityCounts();
            } catch (err) {
                e.target.checked = !e.target.checked;
                todoItem.classList.toggle('completed', e.target.checked);
            }
        }
    });

    // Delete todo handler (using delegation)
    document.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const todoItem = deleteBtn.closest('.todo-item');
            if (!todoItem) return;
            const id = todoItem.dataset.id;
            
            const confirmed = await window.confirmDialog({
                title: 'Delete Task',
                message: 'Are you sure you want to delete this task?',
                confirmText: 'Delete',
                cancelText: 'Cancel'
            });
            
            if (confirmed) {
                try {
                    await window.apiPost('/api/todo/delete/', { id });
                    todoItem.style.opacity = '0';
                    setTimeout(() => {
                        todoItem.remove();
                        updatePriorityCounts();
                    }, 300);
                } catch (err) {
                    console.error(err);
                }
            }
        }
    });

    // Edit todo handler (using delegation)
    document.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            const todoItem = editBtn.closest('.todo-item');
            if (!todoItem || todoItem.querySelector('.todo-inline-edit-wrapper')) return;
            
            const id = todoItem.dataset.id;
            const textSpan = todoItem.querySelector('.todo-text');
            const oldTitle = textSpan.textContent.trim();
            
            const contentWrapper = todoItem.querySelector('.todo-content-wrapper');
            const actionsWrapper = todoItem.querySelector('.todo-actions');
            
            // Hide normal UI
            contentWrapper.style.display = 'none';
            actionsWrapper.style.display = 'none';
            todoItem.setAttribute('draggable', 'false');
            
            // Create inline edit interface
            const editWrapper = document.createElement('div');
            editWrapper.className = 'todo-inline-edit-wrapper';
            editWrapper.style.cssText = 'display: flex; align-items: center; width: 100%; gap: 8px;';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'inline-input todo-edit-input';
            input.value = oldTitle;
            input.style.cssText = 'flex-grow: 1; font-size: 0.88rem; padding: 4px 8px; margin: 0;';
            
            const saveBtn = document.createElement('button');
            saveBtn.className = 'action-btn save-edit';
            saveBtn.style.cssText = 'color: var(--neither-text); font-size: 0.95rem; font-weight: bold; padding: 4px 8px; cursor: pointer;';
            saveBtn.textContent = '✓';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'action-btn cancel-edit';
            cancelBtn.style.cssText = 'color: var(--urgent-important-text); font-size: 0.95rem; font-weight: bold; padding: 4px 8px; cursor: pointer;';
            cancelBtn.textContent = '✗';
            
            editWrapper.appendChild(input);
            editWrapper.appendChild(saveBtn);
            editWrapper.appendChild(cancelBtn);
            todoItem.appendChild(editWrapper);
            
            // Focus and set cursor to the end
            input.focus();
            const valLen = input.value.length;
            input.setSelectionRange(valLen, valLen);
            
            let isSaving = false;
            
            const saveChange = async () => {
                if (isSaving) return;
                isSaving = true;
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== oldTitle) {
                    try {
                        const response = await window.apiPost('/api/todo/update-title/', {
                            id: id,
                            title: newTitle
                        });
                        if (response.status === 'success') {
                            textSpan.textContent = response.title;
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
                restoreOriginal();
            };
            
            const restoreOriginal = () => {
                editWrapper.remove();
                contentWrapper.style.display = '';
                actionsWrapper.style.display = '';
                todoItem.setAttribute('draggable', 'true');
            };
            
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    saveChange();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    restoreOriginal();
                }
            });
            
            saveBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                saveChange();
            });
            
            cancelBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                restoreOriginal();
            });
            
            input.addEventListener('blur', () => {
                // Short timeout to let button click trigger first
                setTimeout(() => {
                    if (document.activeElement !== saveBtn && document.activeElement !== cancelBtn) {
                        if (editWrapper.parentNode) {
                            saveChange();
                        }
                    }
                }, 180);
            });
        }
    });

    // Quick add todo form handler
    if (quickAddForm) {
        quickAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = newTodoInput.value.trim();
            if (!title) return;

            try {
                const response = await window.apiPost('/api/todo/add/', { title, priority: 'unassigned' });
                
                if (response.status === 'success') {
                    // Append item dynamically
                    const todo = response.todo;
                    const itemHtml = `
                        <div class="todo-item" data-id="${todo.id}">
                            <div class="todo-content-wrapper">
                                <input type="checkbox" class="todo-checkbox">
                                <span class="todo-text">${todo.title}</span>
                                <select class="todo-priority-select" data-id="${todo.id}" title="Change priority">
                                    <option value="unassigned" selected>Prioritize</option>
                                    <option value="stop_todo">⛔ Stop-Do</option>
                                    <option value="urgent_important">Urgent &amp; Important</option>
                                    <option value="important_not_urgent">Important &amp; Not Urgent</option>
                                    <option value="urgent_not_important">Urgent &amp; Not Important</option>
                                    <option value="neither">Neither</option>
                                </select>
                            </div>
                            <div class="todo-actions">
                                <button class="action-btn focus-pomo" title="Focus on this task in Pomodoro">▶️ focus</button>
                                <button class="action-btn edit">edit</button>
                                <button class="action-btn delete">delete</button>
                            </div>
                        </div>
                    `;
                    
                    const listContainer = document.getElementById('unassigned-todo-list');
                    
                    // Remove empty message if any
                    const emptyMsg = listContainer.querySelector('.empty-state-message');
                    if (emptyMsg) emptyMsg.remove();
                    
                    listContainer.insertAdjacentHTML('beforeend', itemHtml);
                    
                    // Sync select styling class
                    syncSelectClasses();
                    
                    // Clear input
                    newTodoInput.value = '';
                    updatePriorityCounts();
                }
            } catch (err) {
                console.error(err);
            }
        });
    }



    // ── Handle Priority Change via Native Dropdown Selector ──
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('todo-priority-select')) {
            const select = e.target;
            const todoId = select.dataset.id;
            const newPriority = select.value;
            const todoItem = select.closest('.todo-item');

            if (!todoItem) return;

            try {
                // Call Django update-priority API
                const response = await window.apiPost('/api/todo/update-priority/', {
                    id: todoId,
                    priority: newPriority
                });

                if (response.status === 'success') {
                    // Trigger slide out animation in the list!
                    todoItem.classList.add('moving-priority');

                    // Wait for 600ms transition
                    setTimeout(() => {
                        // Identify target list in DOM
                        const targetListId = newPriority === 'unassigned' ? 'unassigned-todo-list' : `list-${newPriority}`;
                        const targetList = document.getElementById(targetListId);
                        
                        if (targetList) {
                            // Remove empty state message
                            const emptyMsg = targetList.querySelector('.empty-state-message');
                            if (emptyMsg) emptyMsg.remove();

                            // Move the todo item card to the new list
                            targetList.appendChild(todoItem);

                            // Ensure count badges update
                            updatePriorityCounts();

                            // Sync select styling class
                            syncSelectClasses();

                            // Sync priority selector value inside the detail sheet if it's open for this todo
                            const detailPanelSelect = document.querySelector(`.breakdown-priority-selector .p-btn[data-priority-val="${newPriority}"]`);
                            if (detailPanelSelect && window.currentTodoId === todoId) {
                                document.querySelectorAll('.breakdown-priority-selector .p-btn').forEach(b => b.classList.remove('active'));
                                detailPanelSelect.classList.add('active');
                            }
                        }

                        // Remove animation class so it fades back in smoothly
                        todoItem.classList.remove('moving-priority');
                    }, 600);

                    if (window.showToast) {
                        const linkHtml = newPriority !== 'unassigned'
                            ? ` <a href="#" onclick="event.preventDefault(); window.switchMobileTab('2');" style="color: #2dd4bf; text-decoration: underline; margin-left: 6px; font-weight: 600;">Go to Focus</a>`
                            : ` <a href="#" onclick="event.preventDefault(); window.switchMobileTab('1');" style="color: #2dd4bf; text-decoration: underline; margin-left: 6px; font-weight: 600;">Go to Tasks</a>`;
                        window.showToast(`Priority updated.${linkHtml}`);
                    }
                }
            } catch (err) {
                console.error('Failed to update priority via select:', err);
                window.location.reload();
            }
        }
    });

    // Handle inline creation of tasks in specific priority groups
    document.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.add-priority-task-btn');
        if (!addBtn) return;
        
        const priority = addBtn.dataset.priority;
        const listId = priority === 'unassigned' ? 'unassigned-todo-list' : `list-${priority}`;
        const targetList = document.getElementById(listId);
        if (!targetList) return;
        
        // If there's already an active inline input wrapper in this list, focus it and do nothing else
        const existingInputWrapper = targetList.querySelector('.inline-add-input-wrapper');
        if (existingInputWrapper) {
            existingInputWrapper.querySelector('input').focus();
            return;
        }
        
        // Otherwise, create the input element
        const wrapper = document.createElement('div');
        wrapper.className = 'inline-add-input-wrapper';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-add-input';
        input.placeholder = 'Add task to this category...';
        input.autocomplete = 'off';
        
        wrapper.appendChild(input);
        
        // Prepend it to the target list (before existing todo items)
        targetList.insertBefore(wrapper, targetList.firstChild);
        input.focus();
        
        // Handle saving or cancelling on keydown / blur
        let isSaving = false;
        const submitTask = async () => {
            if (isSaving) return;
            isSaving = true;
            const title = input.value.trim();
            if (!title) {
                wrapper.remove();
                return;
            }
            
            try {
                // Disable input during request to prevent double submit
                input.disabled = true;
                const response = await window.apiPost('/api/todo/add/', { title, priority: priority });
                if (response.status === 'success') {
                    const todo = response.todo;
                    
                    // Generate new todo element HTML matching standard focus column items
                    const itemHtml = `
                        <div class="todo-item" data-id="${todo.id}">
                            <div class="todo-content-wrapper">
                                <input type="checkbox" class="todo-checkbox">
                                <span class="todo-text">${todo.title}</span>
                                <select class="todo-priority-select" data-id="${todo.id}" title="Change priority">
                                    <option value="unassigned" ${todo.priority === 'unassigned' ? 'selected' : ''}>Prioritize</option>
                                    <option value="stop_todo" ${todo.priority === 'stop_todo' ? 'selected' : ''}>⛔ Stop-Do</option>
                                    <option value="urgent_important" ${todo.priority === 'urgent_important' ? 'selected' : ''}>Urgent &amp; Important</option>
                                    <option value="important_not_urgent" ${todo.priority === 'important_not_urgent' ? 'selected' : ''}>Important &amp; Not Urgent</option>
                                    <option value="urgent_not_important" ${todo.priority === 'urgent_not_important' ? 'selected' : ''}>Urgent &amp; Not Important</option>
                                    <option value="neither" ${todo.priority === 'neither' ? 'selected' : ''}>Neither</option>
                                </select>
                            </div>
                            <div class="todo-actions">
                                <button class="action-btn focus-pomo" title="Focus on this task in Pomodoro">▶️ focus</button>
                                <button class="action-btn edit">edit</button>
                                <button class="action-btn breakdown">details</button>
                                <button class="action-btn delete">delete</button>
                            </div>
                        </div>
                    `;
                    
                    // Remove empty message if any
                    const emptyMsg = targetList.querySelector('.empty-state-message');
                    if (emptyMsg) emptyMsg.remove();
                    
                    // Insert the new todo item right after the wrapper
                    wrapper.insertAdjacentHTML('afterend', itemHtml);
                    
                    // Sync select styling class and update counts
                    syncSelectClasses();
                    updatePriorityCounts();
                    
                    // Show a toast
                    if (window.showToast) {
                        window.showToast('✨ Task added directly to this category!');
                    }
                }
            } catch (err) {
                console.error('Error adding direct task:', err);
            } finally {
                wrapper.remove();
            }
        };
        
        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                submitTask();
            } else if (evt.key === 'Escape') {
                wrapper.remove();
            }
        });
        
        input.addEventListener('blur', () => {
            // Wait slightly in case user cancels or clicks away
            setTimeout(() => {
                if (document.body.contains(wrapper)) {
                    submitTask();
                }
            }, 150);
    // ── Eisenhower View Mode Switcher (Matrix vs Signal & Noise) ──
    const viewModeMatrixBtn = document.getElementById('viewModeMatrixBtn');
    const viewModeSignalBtn = document.getElementById('viewModeSignalBtn');
    const eisenhowerColumn = document.querySelector('.eisenhower-column');

    function setEisenhowerViewMode(mode) {
        if (!eisenhowerColumn) return;
        const isSignal = mode === 'signal';
        eisenhowerColumn.classList.toggle('mode-signal', isSignal);
        if (viewModeMatrixBtn) viewModeMatrixBtn.classList.toggle('active', !isSignal);
        if (viewModeSignalBtn) viewModeSignalBtn.classList.toggle('active', isSignal);
        localStorage.setItem('eisenhower_view_mode', mode);
    }

    if (viewModeMatrixBtn) {
        viewModeMatrixBtn.addEventListener('click', () => setEisenhowerViewMode('matrix'));
    }
    if (viewModeSignalBtn) {
        viewModeSignalBtn.addEventListener('click', () => setEisenhowerViewMode('signal'));
    }

    // Restore saved view mode
    const savedMode = localStorage.getItem('eisenhower_view_mode') || 'matrix';
    setEisenhowerViewMode(savedMode);
});



