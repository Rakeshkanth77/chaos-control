document.addEventListener('DOMContentLoaded', () => {
    const addForm = document.getElementById('add-project-form');
    const nameInput = document.getElementById('project-name');
    const urlInput = document.getElementById('project-url');
    const descInput = document.getElementById('project-description');
    const projectList = document.getElementById('project-list');

    // Helper: POST request (reuse the global apiPost if available, else define locally)
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

    // Add Project
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = nameInput.value.trim();
            const url = urlInput.value.trim();
            const description = descInput.value.trim();

            if (!name || !url) {
                alert('Project name and URL are required.');
                return;
            }

            try {
                const res = await projectApiPost('/api/project/add/', { name, url, description });

                if (res.status === 'success') {
                    const project = res.project;

                    // Remove empty state if present
                    const emptyState = document.getElementById('project-empty-state');
                    if (emptyState) emptyState.remove();

                    // Build new project card
                    const cardHtml = `
                        <div class="glass-panel project-card" data-id="${project.id}">
                            <div class="project-info">
                                <div class="project-name">
                                    <a href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(project.name)} ↗</a>
                                </div>
                                ${project.description ? `<div class="project-description">${escapeHtml(project.description)}</div>` : ''}
                                <div class="project-url-display">${escapeHtml(project.url.length > 60 ? project.url.substring(0, 57) + '...' : project.url)}</div>
                            </div>
                            <div class="project-actions">
                                <button class="btn btn-secondary project-edit-btn" style="padding: 4px 12px; font-size: 0.8rem;">Edit</button>
                                <button class="btn btn-secondary project-delete-btn" style="padding: 4px 12px; font-size: 0.8rem; color: #ef4444;">Delete</button>
                            </div>
                        </div>
                    `;

                    projectList.insertAdjacentHTML('beforeend', cardHtml);

                    // Clear form
                    nameInput.value = '';
                    urlInput.value = '';
                    descInput.value = '';
                }
            } catch (err) {
                console.error(err);
                alert(`Error: ${err.message}`);
            }
        });
    }

    // Edit Project (event delegation)
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('project-edit-btn')) {
            const card = e.target.closest('.project-card');
            if (!card) return;

            const id = card.dataset.id;
            const nameEl = card.querySelector('.project-name a');
            const descEl = card.querySelector('.project-description');
            const urlEl = card.querySelector('.project-url-display');

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
                    nameEl.textContent = p.name + ' ↗';
                    nameEl.setAttribute('href', p.url);
                    
                    if (descEl) {
                        descEl.textContent = p.description;
                        descEl.style.display = p.description ? '' : 'none';
                    } else if (p.description) {
                        const newDescEl = document.createElement('div');
                        newDescEl.className = 'project-description';
                        newDescEl.textContent = p.description;
                        card.querySelector('.project-name').after(newDescEl);
                    }
                    
                    if (urlEl) {
                        urlEl.textContent = p.url.length > 60 ? p.url.substring(0, 57) + '...' : p.url;
                    }
                }
            } catch (err) {
                console.error(err);
                alert(`Error: ${err.message}`);
            }
        }
    });

    // Delete Project (event delegation)
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('project-delete-btn')) {
            const card = e.target.closest('.project-card');
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
                            if (!projectList.querySelector('.project-card')) {
                                projectList.innerHTML = `
                                    <div class="glass-panel project-empty" id="project-empty-state">
                                        <div style="font-size: 2rem; margin-bottom: 12px;">📁</div>
                                        <div>No projects yet. Add your first project above to start tracking your work.</div>
                                    </div>
                                `;
                            }
                        }, 300);
                    }
                } catch (err) {
                    console.error(err);
                    alert(`Error: ${err.message}`);
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
