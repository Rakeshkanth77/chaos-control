document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('#mobileTabBar .tab-btn');
    const tabContents = document.querySelectorAll('.glass-panel[data-mobile-tab]');

    function isMobile() {
        return window.innerWidth <= 768;
    }

    /**
     * Switch to the specified tab ID
     */
    function switchTab(tabId) {
        if (!tabId) return;

        // Update active class on tab buttons
        tabButtons.forEach(btn => {
            if (btn.dataset.mobileTab === tabId) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            }
        });

        // Update active class on tab contents
        tabContents.forEach(content => {
            if (content.dataset.mobileTab === tabId) {
                content.classList.add('active-tab-content');
            } else {
                content.classList.remove('active-tab-content');
            }
        });

        // Hide parent grid-columns on mobile if they have no active children
        document.querySelectorAll('.grid-column').forEach(col => {
            // Check if column has any active tab content child
            const hasActiveChild = col.querySelector('.active-tab-content');
            
            if (isMobile()) {
                if (hasActiveChild) {
                    col.style.setProperty('display', 'flex', 'important');
                } else {
                    col.style.setProperty('display', 'none', 'important');
                }
            } else {
                col.style.removeProperty('display'); // reset on desktop/tablet
            }
        });

        // Persist to local storage
        localStorage.setItem('active_mobile_tab_id', tabId);
    }

    // Attach click listeners to all tab buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = btn.dataset.mobileTab;
            console.log('Mobile Tab Button Clicked:', tabId);
            switchTab(tabId);
        });
    });

    /**
     * Initialize tab view state
     */
    function initTabs() {
        console.log('Initializing Tab Navigation. isMobile =', isMobile());
        
        // Handle auto-switch flag
        if (localStorage.getItem('auto_switch_to_tasks_tab') === 'true') {
            localStorage.removeItem('auto_switch_to_tasks_tab');
            localStorage.setItem('active_mobile_tab_id', '2'); // Switch to 'Your to-do list' (tab 2)
        }

        if (isMobile()) {
            // Restore last active tab, or default to 1 (What's on your mind? / thoughts)
            const lastActiveTab = localStorage.getItem('active_mobile_tab_id') || '1';
            console.log('Activating Tab:', lastActiveTab);
            switchTab(lastActiveTab);
        } else {
            console.log('Desktop view: removing active-tab-content classes and resetting column display');
            // Desktop/Tablet: remove content toggling classes and display styles to let normal CSS show
            tabContents.forEach(content => {
                content.classList.remove('active-tab-content');
            });
            document.querySelectorAll('.grid-column').forEach(col => {
                col.style.removeProperty('display');
            });
        }

        // Show toast if flag is set
        if (localStorage.getItem('show_extraction_toast') === 'true') {
            localStorage.removeItem('show_extraction_toast');
            // Allow a small delay for page load completion before rendering the toast
            setTimeout(() => {
                if (window.showToast) {
                    window.showToast('✨ Tasks successfully extracted to your list!');
                }
            }, 500);
        }
    }

    // Run on load
    initTabs();

    // Re-initialize on window resize/orientation change
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(initTabs, 150);
    });
});
