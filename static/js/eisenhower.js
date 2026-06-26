document.addEventListener('DOMContentLoaded', () => {
    const todoLists = document.querySelectorAll('.priority-list');
    const quickAddForm = document.getElementById('quick-add-todo');
    const newTodoInput = document.getElementById('new-todo-title');

    // Update the counter badges for each priority block
    function updatePriorityCounts() {
        const counts = {
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

    // Initialize counts on load
    updatePriorityCounts();

    // Set up drag events on existing todo items
    function initDragEvents(todoItem) {
        todoItem.addEventListener('dragstart', (e) => {
            todoItem.classList.add('dragging');
            e.dataTransfer.setData('text/plain', todoItem.dataset.id);
        });

        todoItem.addEventListener('dragend', () => {
            todoItem.classList.remove('dragging');
            todoLists.forEach(list => list.classList.remove('drag-over'));
        });
    }

    // Apply drag to loaded items
    document.querySelectorAll('.todo-item').forEach(initDragEvents);

    // List event listeners for dragover/drop
    todoLists.forEach(list => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            list.classList.add('drag-over');
            
            // Reordering insertion check
            const draggingItem = document.querySelector('.todo-item.dragging');
            const afterElement = getDragAfterElement(list, e.clientY);
            if (afterElement == null) {
                list.appendChild(draggingItem);
            } else {
                list.insertBefore(draggingItem, afterElement);
            }
        });

        list.addEventListener('dragleave', () => {
            list.classList.remove('drag-over');
        });

        list.addEventListener('drop', async (e) => {
            e.preventDefault();
            list.classList.remove('drag-over');
            
            const todoId = e.dataTransfer.getData('text/plain');
            const priority = list.dataset.priority;
            
            // Gather all todo IDs in this list in their current order
            const orderedIds = Array.from(list.querySelectorAll('.todo-item')).map(item => item.dataset.id);

            try {
                await window.apiPost('/api/todo/update-priority/', {
                    id: todoId,
                    priority: priority,
                    ordered_ids: orderedIds
                });
                
                // If it dropped in empty state list, remove empty state message
                const emptyMsg = list.querySelector('.empty-state-message');
                if (emptyMsg) {
                    emptyMsg.remove();
                }
                
                updatePriorityCounts();
            } catch (err) {
                // If failed, reload to revert visual UI state
                window.location.reload();
            }
        });
    });

    // Helper to determine sorting position during drag
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.todo-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

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
                        <div class="todo-item" draggable="true" data-id="${todo.id}">
                            <div class="todo-content-wrapper">
                                <input type="checkbox" class="todo-checkbox">
                                <span class="todo-text">${todo.title}</span>
                            </div>
                            <div class="todo-actions">
                                <button class="action-btn edit">edit</button>
                                <button class="action-btn breakdown">details</button>
                                <button class="action-btn delete">delete</button>
                            </div>
                        </div>
                    `;
                    
                    const listContainer = document.getElementById('unassigned-todo-list');
                    
                    // Remove empty message if any
                    const emptyMsg = listContainer.querySelector('.empty-state-message');
                    if (emptyMsg) emptyMsg.remove();
                    
                    listContainer.insertAdjacentHTML('beforeend', itemHtml);
                    
                    // Initialize drag events on new element
                    const newEl = listContainer.lastElementChild;
                    initDragEvents(newEl);
                    initTouchDrag(newEl);
                    
                    // Clear input
                    newTodoInput.value = '';
                    updatePriorityCounts();
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // ========== MOBILE TOUCH DRAG-AND-DROP ==========
    let touchDragItem = null;
    let touchClone = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentList = null;

    function initTouchDrag(todoItem) {
        todoItem.addEventListener('touchstart', handleTouchStart, { passive: false });
        todoItem.addEventListener('touchmove', handleTouchMove, { passive: false });
        todoItem.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    function handleTouchStart(e) {
        // Only handle single-finger touches
        if (e.touches.length !== 1) return;
        
        // Ignore if touching checkbox or action buttons
        const target = e.target;
        if (target.classList.contains('todo-checkbox') || 
            target.classList.contains('action-btn') ||
            target.closest('.todo-actions')) return;
        
        const touch = e.touches[0];
        touchDragItem = e.currentTarget;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        // Delay to differentiate scroll from drag
        touchDragItem._touchTimeout = setTimeout(() => {
            touchDragItem.classList.add('dragging');
            
            // Create a visual clone for dragging feedback
            touchClone = touchDragItem.cloneNode(true);
            touchClone.classList.add('touch-drag-clone');
            touchClone.style.position = 'fixed';
            touchClone.style.width = touchDragItem.offsetWidth + 'px';
            touchClone.style.left = touch.clientX - touchDragItem.offsetWidth / 2 + 'px';
            touchClone.style.top = touch.clientY - 20 + 'px';
            touchClone.style.zIndex = '9999';
            touchClone.style.opacity = '0.85';
            touchClone.style.pointerEvents = 'none';
            touchClone.style.transform = 'scale(1.03)';
            touchClone.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
            document.body.appendChild(touchClone);
            
            touchDragItem.style.opacity = '0.3';
        }, 200);
    }

    function handleTouchMove(e) {
        if (!touchDragItem) return;
        
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - touchStartX);
        const dy = Math.abs(touch.clientY - touchStartY);
        
        // If dragging hasn't been initiated yet and movement is mostly horizontal or significant
        if (!touchDragItem.classList.contains('dragging')) {
            if (dy > 10 && dx < 10) {
                // User is scrolling vertically, cancel drag
                clearTimeout(touchDragItem._touchTimeout);
                touchDragItem = null;
                return;
            }
            if (dx < 5 && dy < 5) return; // Not enough movement yet
        }
        
        e.preventDefault(); // Prevent scroll while dragging
        
        if (!touchClone) return;
        
        // Move clone with finger
        touchClone.style.left = touch.clientX - touchClone.offsetWidth / 2 + 'px';
        touchClone.style.top = touch.clientY - 20 + 'px';
        
        // Find which priority list is under the finger
        // Temporarily hide clone to find element underneath
        touchClone.style.display = 'none';
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        touchClone.style.display = '';
        
        // Clear all drag-over highlights
        todoLists.forEach(list => list.classList.remove('drag-over'));
        touchCurrentList = null;
        
        if (elementBelow) {
            const targetList = elementBelow.closest('.priority-list');
            if (targetList) {
                targetList.classList.add('drag-over');
                touchCurrentList = targetList;
                
                // Reorder: find insertion position
                const afterElement = getDragAfterElement(targetList, touch.clientY);
                if (afterElement == null) {
                    targetList.appendChild(touchDragItem);
                } else {
                    targetList.insertBefore(touchDragItem, afterElement);
                }
            }
        }
    }

    async function handleTouchEnd(e) {
        clearTimeout(touchDragItem?._touchTimeout);
        
        if (!touchDragItem) return;
        
        const wasDragging = touchDragItem.classList.contains('dragging');
        touchDragItem.classList.remove('dragging');
        touchDragItem.style.opacity = '';
        
        if (touchClone) {
            touchClone.remove();
            touchClone = null;
        }
        
        // Clear all drag-over highlights
        todoLists.forEach(list => list.classList.remove('drag-over'));
        
        if (wasDragging && touchCurrentList) {
            const todoId = touchDragItem.dataset.id;
            const priority = touchCurrentList.dataset.priority;
            const orderedIds = Array.from(touchCurrentList.querySelectorAll('.todo-item')).map(item => item.dataset.id);
            
            try {
                await window.apiPost('/api/todo/update-priority/', {
                    id: todoId,
                    priority: priority,
                    ordered_ids: orderedIds
                });
                
                // Remove empty state message if present
                const emptyMsg = touchCurrentList.querySelector('.empty-state-message');
                if (emptyMsg) emptyMsg.remove();
                
                updatePriorityCounts();
            } catch (err) {
                window.location.reload();
            }
        }
        
        touchDragItem = null;
        touchCurrentList = null;
    }

    // Apply touch drag to all existing todo items
    document.querySelectorAll('.todo-item').forEach(initTouchDrag);

    // ========== EISENHOWER ACCORDION COLLAPSE/EXPAND MODE ==========
    const priorityBlocks = document.querySelectorAll('.priority-block');
    const eisenhowerColumn = document.querySelector('.eisenhower-column');

    priorityBlocks.forEach(block => {
        block.addEventListener('click', (e) => {
            // FIX: Always let checkbox change events pass through — never intercept them
            if (e.target.classList.contains('todo-checkbox')) {
                return;
            }

            // Check if user clicked on interactive todo action buttons/inputs/forms
            const isTodoAction = e.target.closest('.todo-item') || 
                                 e.target.closest('button') || 
                                 e.target.closest('input') || 
                                 e.target.closest('form');

            // If it is a todo list interaction and block is not collapsed, let it propagate normally
            if (isTodoAction && !block.classList.contains('collapsed')) {
                return;
            }

            // Clicked a collapsed capsule block anywhere -> Expand it
            if (block.classList.contains('collapsed')) {
                expandBlock(block);
                e.stopPropagation();
                return;
            }

            // Clicked the header of an already expanded block or a default block
            const clickedHeader = e.target.closest('.priority-header');
            const hasExpanded = eisenhowerColumn.classList.contains('has-expanded');

            if (clickedHeader) {
                if (block.classList.contains('expanded')) {
                    collapseAll();
                } else {
                    expandBlock(block);
                }
                e.stopPropagation();
            } else if (!hasExpanded) {
                // If in default 4-split layout, clicking non-interactive parts also expands it
                expandBlock(block);
                e.stopPropagation();
            }
        });
    });

    function expandBlock(targetBlock) {
        priorityBlocks.forEach(block => {
            if (block === targetBlock) {
                block.classList.remove('collapsed');
                block.classList.add('expanded');
            } else {
                block.classList.remove('expanded');
                block.classList.add('collapsed');
            }
        });
        eisenhowerColumn.classList.add('has-expanded');
    }

    function collapseAll() {
        priorityBlocks.forEach(block => {
            block.classList.remove('expanded');
            block.classList.remove('collapsed');
        });
        eisenhowerColumn.classList.remove('has-expanded');
    }

    // ========== END-OF-DAY COMPLETED TASK CLEAR ==========
    // At 11:59 PM, fade out and remove completed tasks from all Eisenhower blocks
    // to reclaim space. DB records are NOT touched — just visual cleanup.
    function scheduleEODClear() {
        const now = new Date();
        const eod = new Date();
        eod.setHours(23, 59, 0, 0); // 11:59:00 PM today

        let msUntilEOD = eod - now;
        // If we're already past 11:59 PM, schedule for tomorrow
        if (msUntilEOD <= 0) {
            msUntilEOD += 24 * 60 * 60 * 1000;
        }

        setTimeout(() => {
            const completedItems = document.querySelectorAll('.priority-list .todo-item.completed');
            completedItems.forEach(item => {
                item.style.transition = 'opacity 0.7s ease, max-height 0.7s ease';
                item.style.opacity = '0';
                item.style.maxHeight = '0';
                item.style.overflow = 'hidden';
                setTimeout(() => {
                    item.remove();
                    updatePriorityCounts();
                }, 750);
            });

            // Reschedule for the next day
            scheduleEODClear();
        }, msUntilEOD);
    }

    scheduleEODClear();
});

