document.addEventListener('DOMContentLoaded', () => {
    const addForm = document.getElementById('add-project-form');
    const nameInput = document.getElementById('project-name');
    const urlInput = document.getElementById('project-url');
    const projectList = document.getElementById('project-list');
    
    // Sidebar Elements
    const toggleBtn = document.getElementById('toggle-projects-btn');
    const mobileToggleBtn = document.getElementById('mobile-toggle-projects-btn');
    const closeBtn = document.getElementById('close-projects-sidebar');
    const sidebar = document.getElementById('projectsSidebar');
    const overlay = document.getElementById('projectsSidebarOverlay');

    // Helper: POST request
    async function projectApiPost(url, body = {}) {
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

    // Sidebar Toggles
    function openSidebar() {
        if (sidebar && overlay) {
            sidebar.classList.add('open');
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden'; // lock background scroll
        }
    }

    function closeSidebar() {
        if (sidebar && overlay) {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
            document.body.style.overflow = ''; // restore background scroll
        }
    }

    if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
    if (mobileToggleBtn) mobileToggleBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Initialize drag events for an item
    function initDragEvents(item) {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            saveNewOrder();
        });
    }

    // Set up drag and drop list container
    if (projectList) {
        // Init loaded items
        projectList.querySelectorAll('.project-item').forEach(initDragEvents);

        projectList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.project-item.dragging');
            if (!draggingItem) return;
            const afterElement = getDragAfterElement(projectList, e.clientY);
            if (afterElement == null) {
                projectList.appendChild(draggingItem);
            } else {
                projectList.insertBefore(draggingItem, afterElement);
            }
        });
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.project-item:not(.dragging)')];
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

    // Save Reordered Projects Order
    async function saveNewOrder() {
        if (!projectList) return;
        const items = [...projectList.querySelectorAll('.project-item')];
        const projectIds = items.map(item => item.dataset.id);
        
        try {
            const res = await projectApiPost('/api/project/reorder/', { project_ids: projectIds });
            if (res.status === 'success' && window.showToast) {
                window.showToast('Projects reordered successfully.');
            }
        } catch (err) {
            console.error('Failed to save project order:', err);
            if (window.showToast) {
                window.showToast('Error saving project order: ' + err.message);
            }
        }
    }

    // Handle Up / Down arrow moves
    document.addEventListener('click', async (e) => {
        const moveUpBtn = e.target.closest('.project-move-up');
        const moveDownBtn = e.target.closest('.project-move-down');
        
        if (moveUpBtn) {
            e.preventDefault();
            const item = moveUpBtn.closest('.project-item');
            if (item && item.previousElementSibling && item.previousElementSibling.classList.contains('project-item')) {
                projectList.insertBefore(item, item.previousElementSibling);
                await saveNewOrder();
            }
        } else if (moveDownBtn) {
            e.preventDefault();
            const item = moveDownBtn.closest('.project-item');
            if (item && item.nextElementSibling && item.nextElementSibling.classList.contains('project-item')) {
                // To insert after nextElement, we insert before nextElement's next sibling
                projectList.insertBefore(item, item.nextElementSibling.nextElementSibling);
                await saveNewOrder();
            }
        }
    });

    // Add Project
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = nameInput.value.trim();
            const url = urlInput.value.trim();

            if (!name || !url) {
                alert('Project name and URL are required.');
                return;
            }

            try {
                const res = await projectApiPost('/api/project/add/', { name, url, description: '' });

                if (res.status === 'success') {
                    const project = res.project;

                    // Remove empty state if present
                    const emptyState = document.getElementById('project-empty-state');
                    if (emptyState) emptyState.remove();

                    // Build new project item HTML matching index.html structure
                    const itemHtml = `
                        <div class="project-item" data-id="${project.id}" draggable="true">
                            <div class="project-drag-handle">☰</div>
                            <div class="project-content-wrapper">
                                <span class="project-name-text">
                                    <a href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(project.name)} ↗</a>
                                </span>
                            </div>
                            <div class="project-actions">
                                <button class="project-sort-btn project-move-up" title="Move Up">▲</button>
                                <button class="project-sort-btn project-move-down" title="Move Down">▼</button>
                                <button class="action-btn project-edit-btn">edit</button>
                                <button class="action-btn project-delete-btn" style="color: #ef4444;">delete</button>
                            </div>
                        </div>
                    `;

                    projectList.insertAdjacentHTML('beforeend', itemHtml);
                    
                    // Bind drag events to new item
                    const newEl = projectList.querySelector(`.project-item[data-id="${project.id}"]`);
                    if (newEl) initDragEvents(newEl);

                    // Clear form inputs
                    nameInput.value = '';
                    urlInput.value = '';
                    
                    if (window.showToast) {
                        window.showToast('Project added successfully!');
                    }
                }
            } catch (err) {
                console.error(err);
                alert(`Error adding project: ${err.message}`);
            }
        });
    }

    // Edit Project (event delegation)
    document.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.project-edit-btn');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            const card = editBtn.closest('.project-item');
            if (!card) return;

            const id = card.dataset.id;
            const nameEl = card.querySelector('.project-name-text a');
            const descEl = card.querySelector('.project-desc-text');

            const currentName = nameEl ? nameEl.textContent.replace(' ↗', '') : '';
            const currentUrl = nameEl ? nameEl.getAttribute('href') : '';
            const currentDesc = descEl ? descEl.textContent : '';

            const newName = prompt('Edit project name:', currentName);
            if (newName === null || !newName.trim()) return;

            const newUrl = prompt('Edit project URL:', currentUrl);
            if (newUrl === null || !newUrl.trim()) return;

            const newDesc = prompt('Edit description (optional):', currentDesc);
            if (newDesc === null) return;

            try {
                const res = await projectApiPost('/api/project/update/', {
                    id,
                    name: newName.trim(),
                    url: newUrl.trim(),
                    description: newDesc.trim()
                });

                if (res.status === 'success') {
                    const p = res.project;
                    if (nameEl) {
                        nameEl.textContent = p.name + ' ↗';
                        nameEl.setAttribute('href', p.url);
                    }
                    
                    if (descEl) {
                        descEl.textContent = p.description;
                        descEl.style.display = p.description ? '' : 'none';
                    } else if (p.description) {
                        const newDescEl = document.createElement('span');
                        newDescEl.className = 'project-desc-text';
                        newDescEl.textContent = p.description;
                        card.querySelector('.project-content-wrapper').appendChild(newDescEl);
                    }
                    
                    if (window.showToast) {
                        window.showToast('Project updated successfully.');
                    }
                }
            } catch (err) {
                console.error(err);
                alert(`Error updating project: ${err.message}`);
            }
        }
    });

    // Delete Project (event delegation)
    document.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.project-delete-btn');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const card = deleteBtn.closest('.project-item');
            if (!card) return;

            const id = card.dataset.id;

            const confirmed = await window.confirmDialog({
                title: 'Delete Project',
                message: 'Are you sure you want to delete this project?',
                confirmText: 'Delete',
                cancelText: 'Cancel'
            });

            if (confirmed) {
                try {
                    const res = await projectApiPost('/api/project/delete/', { id });

                    if (res.status === 'success') {
                        card.style.opacity = '0';
                        card.style.transform = 'translateX(20px)';
                        card.style.transition = 'opacity 0.3s, transform 0.3s';
                        setTimeout(() => {
                            card.remove();
                            // Show empty state if no projects left
                            if (!projectList.querySelector('.project-item')) {
                                projectList.innerHTML = `
                                    <div class="empty-state-message" id="project-empty-state" style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px 0;">
                                        No projects tracked.
                                    </div>
                                `;
                            }
                        }, 300);
                        
                        if (window.showToast) {
                            window.showToast('Project deleted successfully.');
                        }
                    }
                } catch (err) {
                    console.error(err);
                    alert(`Error deleting project: ${err.message}`);
                }
            }
        }
    });

    // Helper: Escape HTML to prevent XSS
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }
});
