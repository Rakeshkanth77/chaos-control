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
        if (e.target.classList.contains('delete') || e.target.closest('.delete')) {
            const todoItem = e.target.closest('.todo-item');
            if (!todoItem) return;
            const id = todoItem.dataset.id;
            
            if (confirm('Delete this task?')) {
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
        if (e.target.classList.contains('edit') || e.target.closest('.edit')) {
            const todoItem = e.target.closest('.todo-item');
            if (!todoItem) return;
            
            const id = todoItem.dataset.id;
            const textSpan = todoItem.querySelector('.todo-text');
            const oldTitle = textSpan.textContent;
            
            const newTitle = prompt('Edit Target Title:', oldTitle);
            if (newTitle !== null && newTitle.trim() !== '' && newTitle.trim() !== oldTitle) {
                try {
                    const response = await window.apiPost('/api/todo/update-title/', {
                        id: id,
                        title: newTitle.trim()
                    });
                    if (response.status === 'success') {
                        textSpan.textContent = response.title;
                    }
                } catch (err) {
                    console.error(err);
                    alert('Failed to update target title.');
                }
            }
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
                    
                    // Clear input
                    newTodoInput.value = '';
                    updatePriorityCounts();
                }
            } catch (err) {
                console.error(err);
            }
        });
    }
});
