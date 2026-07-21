document.addEventListener('DOMContentLoaded', () => {
    // Only execute if we are on the analytics page (check canvas element presence)
    if (!document.getElementById('todo-chart')) return;

    const streakDisplay = document.getElementById('streak-value');
    const totalTodosDisplay = document.getElementById('total-todos-completed');
    const totalPomodorosDisplay = document.getElementById('total-pomodoros');

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

                // Render Pomodoro 3-Bar Chart (Focus Hours, Opportunity Hours, Total Sessions)
                const ctxPomo = document.getElementById('pomodoro-chart').getContext('2d');
                
                const pomoHoursData = res.pomodoro_hours || (res.pomodoro_minutes ? res.pomodoro_minutes.map(m => Number((m/60).toFixed(1))) : []);
                const oppHoursData = res.opportunity_hours || (res.opportunity_minutes ? res.opportunity_minutes.map(m => Number((m/60).toFixed(1))) : []);

                const maxH = Math.max(...pomoHoursData, ...oppHoursData, 1);
                const maxC = Math.max(...(res.pomodoros || [1]), 1);

                const valueOnTopPlugin = {
                    id: 'valueOnTop',
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        chart.data.datasets.forEach((dataset, datasetIndex) => {
                            const meta = chart.getDatasetMeta(datasetIndex);
                            if (!meta.hidden) {
                                meta.data.forEach((element, index) => {
                                    const val = dataset.data[index];
                                    if (val > 0) {
                                        ctx.save();
                                        if (datasetIndex === 0) ctx.fillStyle = '#0d9488';
                                        else if (datasetIndex === 1) ctx.fillStyle = '#dc2626';
                                        else ctx.fillStyle = '#7e22ce';

                                        ctx.font = '700 10px Inter, sans-serif';
                                        ctx.textAlign = 'center';
                                        ctx.textBaseline = 'bottom';
                                        const labelText = (datasetIndex === 0 || datasetIndex === 1) ? `${Number(val.toFixed(1))}h` : `${val}`;
                                        ctx.fillText(labelText, element.x, element.y - 4);
                                        ctx.restore();
                                    }
                                });
                            }
                        });
                    }
                };

                new Chart(ctxPomo, {
                    type: 'bar',
                    plugins: [valueOnTopPlugin],
                    data: {
                        labels: res.labels,
                        datasets: [
                            {
                                label: 'Focus Time (Hours)',
                                data: pomoHoursData,
                                backgroundColor: 'rgba(45, 212, 191, 0.7)',
                                borderColor: '#2dd4bf',
                                borderRadius: 6,
                                borderWidth: 1,
                                barPercentage: 0.7,
                                categoryPercentage: 0.65,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Opportunity Time (Hours)',
                                data: oppHoursData,
                                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                                borderColor: '#ef4444',
                                borderRadius: 6,
                                borderWidth: 1,
                                barPercentage: 0.7,
                                categoryPercentage: 0.65,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Total Pomodoros',
                                data: res.pomodoros || [],
                                backgroundColor: 'rgba(168, 85, 247, 0.7)',
                                borderColor: '#a855f7',
                                borderRadius: 6,
                                borderWidth: 1,
                                barPercentage: 0.7,
                                categoryPercentage: 0.65,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        ...commonChartOptions,
                        plugins: {
                            ...commonChartOptions.plugins,
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    font: { family: 'Inter', size: 11, weight: '600' },
                                    color: '#5a5a75',
                                    padding: 16
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { font: { family: 'Inter', size: 10 }, color: '#5a5a75' }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                title: { display: true, text: 'Hours', font: { size: 11, weight: 'bold' }, color: '#0d9488' },
                                grid: { color: 'rgba(0, 0, 0, 0.03)' },
                                ticks: { font: { family: 'Inter', size: 10 }, color: '#5a5a75' },
                                suggestedMax: Math.ceil(maxH * 1.3)
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                title: { display: true, text: 'Counts', font: { size: 11, weight: 'bold' }, color: '#7e22ce' },
                                grid: { drawOnChartArea: false },
                                ticks: { font: { family: 'Inter', size: 10 }, color: '#5a5a75', precision: 0 },
                                suggestedMax: Math.ceil(maxC * 1.3)
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

    loadAnalytics();
});
