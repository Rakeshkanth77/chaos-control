document.addEventListener('DOMContentLoaded', () => {
    // Only execute if we are on the analytics page (check canvas element presence)
    if (!document.getElementById('todo-chart')) return;

    const streakDisplay = document.getElementById('streak-value');
    const totalTodosDisplay = document.getElementById('total-todos-completed');
    const totalPomodorosDisplay = document.getElementById('total-pomodoros');
    const totalFlashcardsDisplay = document.getElementById('fc-total');
    const reviewedTodayDisplay = document.getElementById('fc-reviewed-today');

    // Chart.js helper for common styling
    const commonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                labels: {
                    font: {
                        family: 'Inter',
                        size: 11
                    },
                    color: '#5a5a75'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                titleColor: '#1e1e2f',
                bodyColor: '#5a5a75',
                borderColor: 'rgba(0, 0, 0, 0.05)',
                borderWidth: 1,
                titleFont: { family: 'Inter', weight: 'bold' },
                bodyFont: { family: 'Inter' }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    font: { family: 'Inter', size: 10 },
                    color: '#5a5a75'
                }
            },
            y: {
                grid: { color: 'rgba(0, 0, 0, 0.03)' },
                ticks: {
                    font: { family: 'Inter', size: 10 },
                    color: '#5a5a75',
                    precision: 0
                }
            }
        }
    };

    async function loadAnalytics() {
        try {
            const response = await fetch('/analytics/api/summary/');
            const res = await response.json();
            
            if (res.status === 'success') {
                // Populate metrics
                streakDisplay.textContent = `${res.streak} Days`;
                totalTodosDisplay.textContent = res.totals.todos_completed;
                totalPomodorosDisplay.textContent = res.totals.pomodoros_completed;
                
                // Get flashcards summary
                const totalReviewedToday = res.flashcards_reviewed[res.flashcards_reviewed.length - 1] || 0;
                reviewedTodayDisplay.textContent = totalReviewedToday;
                
                // Fetch totals from server or count total
                // In api.py, total_flashcards was loaded on index view, let's fetch total count
                // We'll calculate simple counts from datasets
                const sumReviewed = res.flashcards_reviewed.reduce((a, b) => a + b, 0);
                totalFlashcardsDisplay.textContent = sumReviewed; // displays total reviewed in last 7 days for simplicity
                
                // Render GitHub-Style Contribution Calendar
                renderContributionGrid(res.contribution_grid || []);

                // Render Todo Line Chart (Created vs Completed)
                const ctxTodo = document.getElementById('todo-chart').getContext('2d');
                new Chart(ctxTodo, {
                    type: 'line',
                    data: {
                        labels: res.labels,
                        datasets: [
                            {
                                label: 'Tasks Created',
                                data: res.todos_created,
                                borderColor: 'rgba(99, 91, 143, 0.5)',
                                backgroundColor: 'rgba(99, 91, 143, 0.05)',
                                fill: true,
                                tension: 0.3,
                                borderWidth: 2
                            },
                            {
                                label: 'Tasks Secured',
                                data: res.todos_completed,
                                borderColor: 'rgba(16, 185, 129, 0.6)',
                                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                                fill: true,
                                tension: 0.3,
                                borderWidth: 2
                            }
                        ]
                    },
                    options: commonChartOptions
                });

                // Render Pomodoro Bar Chart
                const ctxPomo = document.getElementById('pomodoro-chart').getContext('2d');
                new Chart(ctxPomo, {
                    type: 'bar',
                    data: {
                        labels: res.labels,
                        datasets: [{
                            label: 'Sessions',
                            data: res.pomodoros,
                            backgroundColor: 'rgba(99, 91, 143, 0.55)',
                            borderRadius: 6,
                            borderWidth: 0
                        }]
                    },
                    options: {
                        ...commonChartOptions,
                        scales: {
                            ...commonChartOptions.scales,
                            y: {
                                ...commonChartOptions.scales.y,
                                suggestedMax: 4
                            }
                        }
                    }
                });

                // Render Eisenhower Doughnut Chart
                const ctxEisen = document.getElementById('eisenhower-chart').getContext('2d');
                new Chart(ctxEisen, {
                    type: 'doughnut',
                    data: {
                        labels: res.eisenhower_distribution.labels,
                        datasets: [{
                            data: res.eisenhower_distribution.values,
                            backgroundColor: [
                                'rgba(239, 68, 68, 0.55)', // Urgent Important
                                'rgba(245, 158, 11, 0.55)', // Important Not Urgent
                                'rgba(59, 130, 246, 0.55)', // Urgent Not Important
                                'rgba(16, 185, 129, 0.55)'  // Neither
                            ],
                            borderWidth: 1,
                            borderColor: 'rgba(255, 255, 255, 0.6)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: {
                                    font: { family: 'Inter', size: 10 },
                                    color: '#5a5a75',
                                    boxWidth: 12
                                }
                            }
                        }
                    }
                });

                // Render Vocabulary Practice line chart
                const ctxVocab = document.getElementById('vocabulary-chart').getContext('2d');
                new Chart(ctxVocab, {
                    type: 'line',
                    data: {
                        labels: res.labels,
                        datasets: [{
                            label: 'Words Reviewed',
                            data: res.flashcards_reviewed,
                            borderColor: 'rgba(99, 91, 143, 0.6)',
                            backgroundColor: 'rgba(99, 91, 143, 0.05)',
                            fill: true,
                            tension: 0.3,
                            borderWidth: 2
                        }]
                    },
                    options: commonChartOptions
                });
            }
        } catch (err) {
            console.error('Failed to load analytics charts:', err);
        }
    }

    // Set up a random quote/tip generator
    const tips = [
        "The secret of getting ahead is getting started. Break down complex objectives and tackle the first one.",
        "Focus on your Urgent & Important objectives first. Then spend time on Important, Not Urgent to prevent future stress.",
        "A Pomodoro session is 25 minutes of pure focus. No phone, no email, just one single objective.",
        "Spaced repetition is the most effective way to lock words into long-term memory. Review your due cards daily.",
        "Reviewing your mistakes is the best way to grow. Let today's reflections form tomorrow's strategy.",
        "Keep your brain dump clean. Write everything down first, then select what actually matters to execute."
    ];
    const tipContainer = document.getElementById('random-tip');
    if (tipContainer) {
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        tipContainer.textContent = `"${randomTip}"`;
    }

    function renderContributionGrid(contributionData) {
        const gridContainer = document.getElementById('contribution-grid');
        if (!gridContainer) return;
        
        gridContainer.innerHTML = '';
        
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - 364); 
        
        const contributions = {};
        contributionData.forEach(item => {
            contributions[item.date] = item.count;
        });
        
        const startDayOfWeek = startDate.getDay();
        
        let currentDate = new Date(startDate);
        let weekCol = document.createElement('div');
        weekCol.className = 'contrib-week';
        gridContainer.appendChild(weekCol);
        
        for (let i = 0; i < startDayOfWeek; i++) {
            const spacer = document.createElement('div');
            spacer.className = 'contrib-cell spacer';
            weekCol.appendChild(spacer);
        }
        
        while (currentDate <= today) {
            if (currentDate.getDay() === 0 && currentDate > startDate) {
                weekCol = document.createElement('div');
                weekCol.className = 'contrib-week';
                gridContainer.appendChild(weekCol);
            }
            
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            const count = contributions[dateStr] || 0;
            
            const cell = document.createElement('div');
            cell.className = `contrib-cell level-${getCellLevel(count)}`;
            cell.title = `${count} task${count !== 1 ? 's' : ''} completed on ${currentDate.toLocaleDateString()}`;
            
            weekCol.appendChild(cell);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    function getCellLevel(count) {
        if (count === 0) return 0;
        if (count <= 2) return 1;
        if (count <= 4) return 2;
        if (count <= 6) return 3;
        return 4;
    }

    async function loadPomodoroAnalytics() {
        if (!document.getElementById('pomo-hourly-chart')) return;
        
        try {
            const response = await fetch('/analytics/api/pomodoro/');
            const res = await response.json();
            
            if (res.status === 'success') {
                // 1. Render Hourly Chart
                const ctxHourly = document.getElementById('pomo-hourly-chart').getContext('2d');
                
                const hourLabels = Array.from({ length: 24 }, (_, i) => {
                    const ampm = i >= 12 ? 'PM' : 'AM';
                    const hour = i % 12 || 12;
                    return `${hour} ${ampm}`;
                });
                
                new Chart(ctxHourly, {
                    type: 'bar',
                    data: {
                        labels: hourLabels,
                        datasets: [{
                            label: 'Sprints Completed',
                            data: res.hourly_peak,
                            backgroundColor: 'rgba(45, 212, 191, 0.6)',
                            borderColor: 'rgba(45, 212, 191, 1)',
                            borderRadius: 4,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        ...commonChartOptions,
                        plugins: {
                            ...commonChartOptions.plugins,
                            legend: { display: false }
                        }
                    }
                });
                
                // 2. Render Daily Chart
                const ctxDaily = document.getElementById('pomo-daily-chart').getContext('2d');
                const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                
                new Chart(ctxDaily, {
                    type: 'bar',
                    data: {
                        labels: dayLabels,
                        datasets: [{
                            label: 'Sprints Completed',
                            data: res.daily_peak,
                            backgroundColor: 'rgba(139, 92, 246, 0.6)',
                            borderColor: 'rgba(139, 92, 246, 1)',
                            borderRadius: 6,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        ...commonChartOptions,
                        plugins: {
                            ...commonChartOptions.plugins,
                            legend: { display: false }
                        }
                    }
                });
                
                // 3. Render Tag Cloud
                const wordCloudContainer = document.getElementById('pomo-word-cloud');
                if (wordCloudContainer && res.word_cloud && res.word_cloud.length > 0) {
                    wordCloudContainer.innerHTML = '';
                    
                    const maxVal = Math.max(...res.word_cloud.map(w => w.value));
                    
                    res.word_cloud.forEach(tag => {
                        const score = maxVal > 0 ? tag.value / maxVal : 1;
                        const size = 0.85 + (score * 0.7);
                        const opacity = 0.6 + (score * 0.4);
                        const bgOpacity = 0.05 + (score * 0.15);
                        
                        const tagEl = document.createElement('span');
                        tagEl.className = 'pomo-analytic-tag';
                        tagEl.style.fontSize = `${size}rem`;
                        tagEl.style.opacity = opacity;
                        tagEl.style.background = `rgba(45, 212, 191, ${bgOpacity})`;
                        tagEl.style.color = '#2dd4bf';
                        tagEl.style.padding = '4px 10px';
                        tagEl.style.borderRadius = '20px';
                        tagEl.style.fontWeight = 'bold';
                        tagEl.style.border = '1px solid rgba(45, 212, 191, 0.2)';
                        tagEl.style.whiteSpace = 'nowrap';
                        tagEl.innerHTML = `${tag.text} <span style="font-size: 0.75em; opacity: 0.6; font-weight: normal; margin-left: 2px;">(${tag.value})</span>`;
                        
                        wordCloudContainer.appendChild(tagEl);
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load Pomodoro analytics charts:', e);
        }
    }

    loadAnalytics();
    loadPomodoroAnalytics();

    // ── Capacity Profiling Chart ─────────────────────────────────────────
    async function loadCapacityAnalytics() {
        try {
            const res = await fetch('/analytics/api/capacity/');
            const data = await res.json();
            if (data.status !== 'success') return;

            const { weekday_avg, today_tasks, today_sprints, weekday_avg_today, today_weekday_name, capacity_status } = data;

            // Weekday bar chart
            const ctxCap = document.getElementById('capacity-weekday-chart');
            if (ctxCap) {
                const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                new Chart(ctxCap.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: dayLabels,
                        datasets: [{
                            label: 'Avg Sprints',
                            data: weekday_avg,
                            backgroundColor: dayLabels.map((_, i) => {
                                const isToday = i === new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
                                return i === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
                                    ? 'rgba(251, 191, 36, 0.85)'
                                    : 'rgba(45, 212, 191, 0.6)';
                            }),
                            borderColor: dayLabels.map((_, i) =>
                                i === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
                                    ? 'rgba(251, 191, 36, 1)'
                                    : 'rgba(45, 212, 191, 0.9)'
                            ),
                            borderWidth: 1,
                            borderRadius: 6,
                        }]
                    },
                    options: {
                        ...commonChartOptions,
                        plugins: {
                            ...commonChartOptions.plugins,
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: ctx => ` ${ctx.parsed.y} avg sprints`
                                }
                            }
                        }
                    }
                });
            }

            // Today's capacity stat panel
            const todayPanel = document.getElementById('capacity-today-panel');
            if (todayPanel) {
                const statusMap = {
                    on_track: { label: '✅ On Track', color: '#2dd4bf' },
                    over_ambitious: { label: '⚠️ Over Ambitious', color: '#fbbf24' },
                    overloaded: { label: '🔴 Overloaded', color: '#ef4444' },
                    no_data: { label: '📊 Building History', color: 'rgba(255,255,255,0.4)' },
                };
                const s = statusMap[capacity_status] || statusMap.no_data;
                todayPanel.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.07); padding-bottom:10px;">
                        <span style="font-size:0.78rem; color:rgba(255,255,255,0.45); font-family:'JetBrains Mono',monospace; letter-spacing:0.5px;">STATUS</span>
                        <span style="font-size:0.82rem; font-weight:700; color:${s.color};">${s.label}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="font-size:0.78rem; color:rgba(255,255,255,0.45);">Tasks today</span>
                        <span style="font-size:0.85rem; color:#fff; font-weight:600;">${today_tasks}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="font-size:0.78rem; color:rgba(255,255,255,0.45);">Sprints done</span>
                        <span style="font-size:0.85rem; color:#fff; font-weight:600;">${today_sprints}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="font-size:0.78rem; color:rgba(255,255,255,0.45);">${today_weekday_name} avg</span>
                        <span style="font-size:0.85rem; color:#2dd4bf; font-weight:600;">${weekday_avg_today} sprints</span>
                    </div>
                `;
            }
        } catch (e) {
            console.error('Failed to load capacity analytics:', e);
        }
    }

    loadCapacityAnalytics();
    // ─────────────────────────────────────────────────────────────────────
});

