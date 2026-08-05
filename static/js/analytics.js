document.addEventListener('DOMContentLoaded', () => {
    // Only execute if we are on the analytics page (check canvas element presence)
    if (!document.getElementById('todo-chart')) return;

    const streakDisplay = document.getElementById('streak-value');
    const totalTodosDisplay = document.getElementById('total-todos-completed');
    const totalPomodorosDisplay = document.getElementById('total-pomodoros');

    function formatDuration(minutes) {
        if (!minutes || minutes <= 0) return '0 mins';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        if (h === 0) return `${m} mins`;
        if (m === 0) return `${h} hour${h > 1 ? 's' : ''}`;
        return `${h} hour${h > 1 ? 's' : ''} ${m} min${m > 1 ? 's' : ''}`;
    }

    function formatDurationShort(minutes) {
        if (!minutes || minutes <= 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

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

    // Analytics state variables
    let analyticsViewMode = 'week';
    let analyticsDate = new Date();

    let todoChartInstance = null;
    let pomodoroChartInstance = null;
    let eisenhowerChartInstance = null;

    function formatDateIso(dateObj) {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function changeAnalyticsDate(delta) {
        if (analyticsViewMode === 'day') {
            analyticsDate.setDate(analyticsDate.getDate() + delta);
        } else if (analyticsViewMode === 'week') {
            analyticsDate.setDate(analyticsDate.getDate() + (delta * 7));
        } else if (analyticsViewMode === 'month') {
            analyticsDate.setMonth(analyticsDate.getMonth() + delta);
        }
        loadAnalytics();
    }

    function resetAnalyticsToday() {
        analyticsDate = new Date();
        loadAnalytics();
    }

    function switchAnalyticsView(newView) {
        analyticsViewMode = newView;
        document.querySelectorAll('#analyticsViewTabs .focus-view-tab, #profileAnalyticsViewTabs .focus-view-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === newView);
        });
        loadAnalytics();
    }

    // Global Event Delegation for View Tabs & Date Controls
    document.addEventListener('click', (e) => {
        const viewTab = e.target.closest('#analyticsViewTabs .focus-view-tab, #profileAnalyticsViewTabs .focus-view-tab');
        const prevBtn = e.target.closest('#analyticsPrevBtn, #profileAnalyticsPrevBtn');
        const nextBtn = e.target.closest('#analyticsNextBtn, #profileAnalyticsNextBtn');
        const todayBtn = e.target.closest('#analyticsTodayBtn, #profileAnalyticsTodayBtn');

        if (viewTab) {
            e.preventDefault();
            switchAnalyticsView(viewTab.dataset.view);
        } else if (prevBtn) {
            e.preventDefault();
            changeAnalyticsDate(-1);
        } else if (nextBtn) {
            e.preventDefault();
            changeAnalyticsDate(1);
        } else if (todayBtn) {
            e.preventDefault();
            resetAnalyticsToday();
        }
    });

    async function loadAnalytics() {
        try {
            const dateStr = formatDateIso(analyticsDate);
            const response = await fetch(`/analytics/api/summary/?view=${analyticsViewMode}&date=${dateStr}`);
            const res = await response.json();

            if (res.status === 'success') {
                // Update Date Display
                ['analyticsDateDisplay', 'profileAnalyticsDateDisplay'].forEach(id => {
                    const disp = document.getElementById(id);
                    if (disp) disp.textContent = res.formatted_range || res.target_date;
                });

                // Populate metrics
                if (streakDisplay) streakDisplay.textContent = `${res.streak} days`;
                if (totalTodosDisplay) totalTodosDisplay.textContent = res.totals.todos_completed;
                if (totalPomodorosDisplay) totalPomodorosDisplay.textContent = res.totals.pomodoros_completed;

                // Render GitHub-Style Contribution Calendar
                if (res.contribution_grid) {
                    renderContributionGrid(res.contribution_grid);
                }

                // Render 30% Weekly Highlights Bracket Metrics
                if (res.weekly_highlights) {
                    const peakWeekVal = document.getElementById('bracket-peak-week-val');
                    const hDayVal = document.getElementById('bracket-highest-day-val');
                    const hDaySub = document.getElementById('bracket-highest-day-sub');
                    const hGapVal = document.getElementById('bracket-highest-gap-val');
                    const hGapSub = document.getElementById('bracket-highest-gap-sub');

                    if (peakWeekVal) peakWeekVal.textContent = formatDuration(res.weekly_highlights.total_weekly_focus_minutes);
                    if (hDayVal) hDayVal.textContent = formatDuration(res.weekly_highlights.highest_focus_day_minutes);
                    if (hDaySub) hDaySub.textContent = res.weekly_highlights.highest_focus_day_label;
                    if (hGapVal) hGapVal.textContent = formatDuration(res.weekly_highlights.highest_gap_minutes);
                    if (hGapSub) hGapSub.textContent = res.weekly_highlights.highest_gap_label;
                }

                // Render PhD vs Other Insights Metrics
                if (res.phd_insights) {
                    const phdTotalVal = document.getElementById('phd-total-focus-val');
                    const phdTotal = document.getElementById('phd-total-focus');
                    const phdFocusVal = document.getElementById('phd-highest-focus-val');
                    const phdFocusSub = document.getElementById('phd-highest-focus-sub');
                    const phdGapVal = document.getElementById('phd-highest-gap-val');
                    const phdGapSub = document.getElementById('phd-highest-gap-sub');

                    if (phdTotalVal) phdTotalVal.textContent = formatDuration(res.phd_insights.total_focus_minutes);
                    if (phdTotal) phdTotal.textContent = `Total: ${formatDurationShort(res.phd_insights.total_focus_minutes)}`;
                    if (phdFocusVal) phdFocusVal.textContent = formatDuration(res.phd_insights.highest_focus_minutes);
                    if (phdFocusSub) phdFocusSub.textContent = res.phd_insights.highest_focus_label;
                    if (phdGapVal) phdGapVal.textContent = formatDuration(res.phd_insights.highest_gap_minutes);
                    if (phdGapSub) phdGapSub.textContent = res.phd_insights.highest_gap_label;
                }

                if (res.other_insights) {
                    const otherTotalVal = document.getElementById('other-total-focus-val');
                    const otherTotal = document.getElementById('other-total-focus');
                    const otherFocusVal = document.getElementById('other-highest-focus-val');
                    const otherFocusSub = document.getElementById('other-highest-focus-sub');
                    const otherGapVal = document.getElementById('other-highest-gap-val');
                    const otherGapSub = document.getElementById('other-highest-gap-sub');

                    if (otherTotalVal) otherTotalVal.textContent = formatDuration(res.other_insights.total_focus_minutes);
                    if (otherTotal) otherTotal.textContent = `Total: ${formatDurationShort(res.other_insights.total_focus_minutes)}`;
                    if (otherFocusVal) otherFocusVal.textContent = formatDuration(res.other_insights.highest_focus_minutes);
                    if (otherFocusSub) otherFocusSub.textContent = res.other_insights.highest_focus_label;
                    if (otherGapVal) otherGapVal.textContent = formatDuration(res.other_insights.highest_gap_minutes);
                    if (otherGapSub) otherGapSub.textContent = res.other_insights.highest_gap_label;
                }

                // 1. Render Todo Line Chart (Created vs Completed)
                const canvasTodo = document.getElementById('todo-chart');
                if (canvasTodo) {
                    if (todoChartInstance) todoChartInstance.destroy();
                    todoChartInstance = new Chart(canvasTodo.getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: res.labels,
                            datasets: [
                                {
                                    label: 'Tasks Created',
                                    data: res.todos_created,
                                    borderColor: 'rgba(12, 88, 85, 0.4)',
                                    backgroundColor: 'transparent',
                                    borderDash: [5, 5],
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
                }

                // 2. Render Pomodoro Stacked Bar Chart (PhD Focus + Other Focus + Opportunity Hours + Total Sessions)
                const canvasPomo = document.getElementById('pomodoro-chart');
                if (canvasPomo) {
                    const phdMinsData = res.phd_minutes || res.phd_hours.map(h => Math.round(h * 60));
                    const otherMinsData = res.other_minutes || res.other_hours.map(h => Math.round(h * 60));
                    const oppMinsData = res.opportunity_minutes || res.opportunity_hours.map(h => Math.round(h * 60));

                    const phdHoursData = res.phd_hours || [];
                    const otherHoursData = res.other_hours || (res.pomodoro_hours ? res.pomodoro_hours : []);
                    const oppHoursData = res.opportunity_hours || [];

                    const totalFocusHours = phdHoursData.map((h, i) => Number((h + (otherHoursData[i] || 0)).toFixed(1)));
                    const maxH = Math.max(...totalFocusHours, ...oppHoursData, 1);
                    const maxC = Math.max(...(res.pomodoros || [1]), 1);

                    const valueOnTopPlugin = {
                        id: 'valueOnTop',
                        afterDatasetsDraw(chart) {
                            const { ctx, width } = chart;
                            const isMobile = width < 500;

                            const dsPhD = chart.getDatasetMeta(0);
                            const dsOther = chart.getDatasetMeta(1);
                            const dsOpp = chart.getDatasetMeta(2);
                            const dsPomodoros = chart.getDatasetMeta(3);

                            const fontStr = isMobile ? '700 9px Inter, sans-serif' : '700 11px Inter, sans-serif';
                            const fontBoldStr = isMobile ? '800 10px Inter, sans-serif' : '800 12px Inter, sans-serif';

                            chart.data.labels.forEach((_, index) => {
                                const phdM = phdMinsData[index] || 0;
                                const otherM = otherMinsData[index] || 0;
                                const oppM = oppMinsData[index] || 0;
                                const pomoVal = chart.data.datasets[3]?.data[index] || 0;

                                const elemPhD = dsPhD && !dsPhD.hidden ? dsPhD.data[index] : null;
                                const elemOther = dsOther && !dsOther.hidden ? dsOther.data[index] : null;
                                const elemOpp = dsOpp && !dsOpp.hidden ? dsOpp.data[index] : null;
                                const elemPomo = dsPomodoros && !dsPomodoros.hidden ? dsPomodoros.data[index] : null;

                                ctx.save();
                                ctx.font = fontStr;
                                ctx.textAlign = 'center';

                                // 1. First Bar: Stacked Focus Bar (PhD Focus + Other Focus)
                                const totalFocusM = phdM + otherM;

                                if (totalFocusM > 0) {
                                    if (phdM > 0 && otherM > 0) {
                                        // Both PhD and Other Focus exist in this bar
                                        if (elemPhD) {
                                            const phdText = formatDurationShort(phdM);
                                            const phdSegHeight = Math.abs(elemPhD.base - elemPhD.y);
                                            if (phdSegHeight >= 10) {
                                                ctx.fillStyle = '#042f2e';
                                                ctx.font = fontBoldStr;
                                                ctx.textBaseline = 'middle';
                                                ctx.fillText(phdText, elemPhD.x, (elemPhD.y + elemPhD.base) / 2);
                                            }
                                        }

                                        if (elemOther) {
                                            const otherText = formatDurationShort(otherM);
                                            const otherSegHeight = Math.abs(elemOther.base - elemOther.y);
                                            if (otherSegHeight >= 10) {
                                                ctx.fillStyle = '#0f172a';
                                                ctx.font = fontBoldStr;
                                                ctx.textBaseline = 'middle';
                                                ctx.fillText(otherText, elemOther.x, (elemOther.y + elemOther.base) / 2);
                                            }
                                        }

                                        // Total Focus Hours displayed ABOVE the top of the stacked bar
                                        const topY = elemOther ? elemOther.y : (elemPhD ? elemPhD.y : 0);
                                        const topX = elemOther ? elemOther.x : (elemPhD ? elemPhD.x : 0);
                                        ctx.fillStyle = '#0f172a';
                                        ctx.font = fontBoldStr;
                                        ctx.textBaseline = 'bottom';
                                        ctx.fillText(formatDurationShort(totalFocusM), topX, topY - 12);
                                        ctx.font = fontStr;
                                    } else if (phdM > 0 && elemPhD) {
                                        // Only PhD Focus exists
                                        const labelText = formatDurationShort(phdM);
                                        ctx.fillStyle = '#0c9e93';
                                        ctx.font = fontBoldStr;
                                        ctx.textBaseline = 'bottom';
                                        ctx.fillText(labelText, elemPhD.x, elemPhD.y - 4);
                                    } else if (otherM > 0 && elemOther) {
                                        // Only Other Focus exists
                                        const labelText = formatDurationShort(otherM);
                                        ctx.fillStyle = '#1d4ed8';
                                        ctx.font = fontBoldStr;
                                        ctx.textBaseline = 'bottom';
                                        ctx.fillText(labelText, elemOther.x, elemOther.y - 4);
                                    }
                                }

                                // 2. Opportunity Time Segment
                                if (oppM > 0 && elemOpp) {
                                    const labelText = formatDurationShort(oppM);
                                    ctx.fillStyle = '#dc2626';
                                    ctx.textBaseline = 'bottom';
                                    ctx.fillText(labelText, elemOpp.x, elemOpp.y - 3);
                                }

                                // 3. Total Pomodoros Segment
                                if (pomoVal > 0 && elemPomo) {
                                    ctx.fillStyle = '#7e22ce';
                                    ctx.textBaseline = 'bottom';
                                    ctx.fillText(`${pomoVal}`, elemPomo.x, elemPomo.y - 3);
                                }

                                ctx.restore();
                            });
                        }
                    };

                    if (pomodoroChartInstance) pomodoroChartInstance.destroy();
                    pomodoroChartInstance = new Chart(canvasPomo.getContext('2d'), {
                        type: 'bar',
                        plugins: [valueOnTopPlugin],
                        data: {
                            labels: res.labels,
                            datasets: [
                                {
                                    label: '🎓 PhD Focus (Hours)',
                                    data: phdHoursData,
                                    backgroundColor: 'rgba(45, 212, 191, 0.85)',
                                    borderColor: '#2dd4bf',
                                    borderRadius: 4,
                                    borderWidth: 1,
                                    stack: 'focus',
                                    barPercentage: 0.85,
                                    categoryPercentage: 0.8,
                                    yAxisID: 'y'
                                },
                                {
                                    label: '💼 Other Focus (Hours)',
                                    data: otherHoursData,
                                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                                    borderColor: '#3b82f6',
                                    borderRadius: 4,
                                    borderWidth: 1,
                                    stack: 'focus',
                                    barPercentage: 0.85,
                                    categoryPercentage: 0.8,
                                    yAxisID: 'y'
                                },
                                {
                                    label: 'Opportunity Time (Hours)',
                                    data: oppHoursData,
                                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                                    borderColor: '#ef4444',
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    stack: 'opp',
                                    barPercentage: 0.85,
                                    categoryPercentage: 0.8,
                                    yAxisID: 'y'
                                },
                                {
                                    label: 'Total Pomodoros',
                                    data: res.pomodoros || [],
                                    backgroundColor: 'rgba(168, 85, 247, 0.75)',
                                    borderColor: '#a855f7',
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    stack: 'counts',
                                    barPercentage: 0.85,
                                    categoryPercentage: 0.8,
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
                }

                // 3. Render Signal & Noise Doughnut Chart
                const canvasEisen = document.getElementById('eisenhower-chart');
                if (canvasEisen) {
                    if (eisenhowerChartInstance) eisenhowerChartInstance.destroy();
                    eisenhowerChartInstance = new Chart(canvasEisen.getContext('2d'), {
                        type: 'doughnut',
                        data: {
                            labels: res.eisenhower_distribution.labels,
                            datasets: [{
                                data: res.eisenhower_distribution.values,
                                backgroundColor: [
                                    '#2dd4bf',                 // ⚡ Signal (Focus)
                                    'rgba(148, 163, 184, 0.45)' // 💤 Noise (Low Priority)
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
                                        font: { family: 'Inter', size: 10, weight: 'bold' },
                                        color: '#5a5a75',
                                        boxWidth: 12
                                    }
                                }
                            },
                            cutout: '70%'
                        }
                    });
                }
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

    let auditDonutChartInstanceMain = null;
    let auditDonutChartInstanceCard = null;

    function renderAuditDonutChart(categories) {
        const canvasMain = document.getElementById('auditDonutChartMain');
        const canvasCard = document.getElementById('auditDonutChart');
        if (!canvasMain && !canvasCard) return;

        let labels = categories ? categories.map(c => c.name) : [];
        let dataValues = categories ? categories.map(c => c.hours) : [];
        const totalHours = dataValues.reduce((a, b) => a + b, 0);

        const colorMap = {
            'PhD': '#10b981',
            'Projects': '#3b82f6',
            'Life Skills': '#f59e0b',
            'Spiritual': '#8b5cf6',
            'Cooking': '#f97316',
            'Driving': '#06b6d4',
            'Distracted': '#f43f5e',
            'Other': '#9ca3af'
        };

        let backgroundColors;
        let isPlaceholder = false;

        if (!categories || categories.length === 0 || totalHours === 0) {
            isPlaceholder = true;
            labels = ['PhD', 'Projects', 'Life Skills', 'Spiritual', 'Distracted'];
            dataValues = [1, 1, 1, 1, 1];
            backgroundColors = labels.map(lbl => colorMap[lbl]);
        } else {
            backgroundColors = labels.map(lbl => colorMap[lbl] || '#9ca3af');
        }

        const buildOptions = (titlePrefix) => ({
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 10,
                        padding: 8,
                        font: { family: 'Inter', size: 10, weight: '600' },
                        color: '#5a5a75'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (isPlaceholder) {
                                return ` Start Audit to track your 15-min logs!`;
                            }
                            const val = context.parsed;
                            const pct = totalHours > 0 ? ((val / totalHours) * 100).toFixed(1) : 0;
                            return ` ${context.label}: ${val} hrs (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        });

        if (canvasMain) {
            if (auditDonutChartInstanceMain) auditDonutChartInstanceMain.destroy();
            auditDonutChartInstanceMain = new Chart(canvasMain.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 2,
                        borderColor: 'rgba(255, 255, 255, 0.8)'
                    }]
                },
                options: buildOptions('Main')
            });
        }

        if (canvasCard) {
            if (auditDonutChartInstanceCard) auditDonutChartInstanceCard.destroy();
            auditDonutChartInstanceCard = new Chart(canvasCard.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 2,
                        borderColor: 'rgba(255, 255, 255, 0.8)'
                    }]
                },
                options: buildOptions('Card')
            });
        }
    }

    // Render initial placeholder or existing chart immediately
    renderAuditDonutChart(null);

    // --- 15-MINUTE TIME AUDIT MODULE ---
    async function loadTimeAuditData() {
        const catList = document.getElementById('auditCategoryList');
        const distList = document.getElementById('auditDistractionList');
        const grid = document.getElementById('auditTimelineGrid');

        try {
            const statsRes = await fetch('/api/time-audit/stats/?days=3');
            const statsData = await statsRes.json();

            // Render Donut Chart & Category Stats FIRST
            if (statsData.status === 'success' && statsData.categories) {
                renderAuditDonutChart(statsData.categories);

                if (catList) {
                    catList.innerHTML = '';
                    statsData.categories.forEach(cat => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; padding: 4px 0; border-bottom: 1px dashed rgba(0,0,0,0.04);';
                        const colorMap = {
                            'research': '#10b981', 'coding': '#3b82f6', 'admin': '#f59e0b',
                            'meeting': '#8b5cf6', 'distraction': '#f43f5e', 'break': '#6b7280', 'other': '#9ca3af'
                        };
                        const color = colorMap[cat.code] || '#9ca3af';
                        row.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
                                <span style="font-weight: 600;">${cat.name}</span>
                            </div>
                            <span style="font-weight: 700; color: var(--text-primary);">${cat.hours}h (${cat.percentage}%)</span>
                        `;
                        catList.appendChild(row);
                    });
                }
            }

            // Render Distractions
            if (statsData.status === 'success' && distList) {
                distList.innerHTML = '';
                if (statsData.distractions && statsData.distractions.length > 0) {
                    statsData.distractions.forEach(d => {
                        const item = document.createElement('div');
                        item.style.cssText = 'font-size: 0.78rem; padding: 5px 8px; background: rgba(244, 63, 94, 0.08); border-left: 3px solid #f43f5e; border-radius: 4px; color: #9f1239;';
                        item.innerHTML = `<strong>${d.time_slot}</strong>: ${d.raw_text}`;
                        distList.appendChild(item);
                    });
                } else {
                    distList.innerHTML = '<div style="font-size: 0.8rem; color: #10b981; font-weight: 600;">🎉 No distractions logged in past 3 days!</div>';
                }
            }

            // Render Timeline Grid (05:00 to 22:00)
            if (grid) {
                const todayRes = await fetch('/api/time-audit/today/');
                const todayData = await todayRes.json();
                grid.innerHTML = '';
                const slots = todayData.slots || {};
                
                for (let hour = 5; hour <= 21; hour++) {
                    for (let min = 0; min < 60; min += 15) {
                        const slotStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                        const logged = slots[slotStr];
                        
                        const card = document.createElement('div');
                        card.style.cssText = 'padding: 6px 8px; border-radius: 6px; font-size: 0.75rem; border: 1px solid rgba(0,0,0,0.06); display: flex; flex-direction: column; justify-content: space-between; min-height: 52px; transition: all 0.2s;';
                        
                        if (logged) {
                            const catColors = {
                                'phd': 'rgba(16, 185, 129, 0.18)',
                                'projects': 'rgba(59, 130, 246, 0.18)',
                                'life_skills': 'rgba(245, 158, 11, 0.18)',
                                'spiritual': 'rgba(139, 92, 246, 0.18)',
                                'cooking': 'rgba(249, 115, 22, 0.18)',
                                'driving': 'rgba(6, 182, 212, 0.18)',
                                'distracted': 'rgba(244, 63, 94, 0.2)'
                            };
                            card.style.background = catColors[logged.category] || 'rgba(0,0,0,0.04)';
                            card.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: var(--text-primary); font-size: 0.7rem;">
                                    <span>${slotStr}</span>
                                    <span class="change-cat-badge" data-slot="${slotStr}" data-cat="${logged.category}" style="font-size: 0.65rem; text-transform: uppercase; font-weight: 800; cursor: pointer; background: rgba(0,0,0,0.08); padding: 1px 5px; border-radius: 4px;" title="Click to change category">${logged.category} ✏️</span>
                                </div>
                                <div style="font-weight: 600; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${logged.raw_text}">${logged.raw_text}</div>
                            `;
                        } else {
                            card.style.background = 'rgba(255,255,255,0.7)';
                            card.innerHTML = `
                                <div style="font-weight: 700; color: var(--text-secondary); font-size: 0.7rem;">${slotStr}</div>
                                <button class="backfill-btn" data-slot="${slotStr}" style="margin-top: 4px; padding: 2px 6px; font-size: 0.68rem; background: transparent; border: 1px dashed #3b82f6; color: #3b82f6; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Log</button>
                            `;
                        }
                        grid.appendChild(card);
                    }
                }

                // Add category edit listeners
                grid.querySelectorAll('.change-cat-badge').forEach(badge => {
                    badge.addEventListener('click', async (e) => {
                        const slot = e.currentTarget.dataset.slot;
                        const currentCat = e.currentTarget.dataset.cat;
                        const catChoices = "phd, projects, life_skills, spiritual, cooking, driving, distracted, other";
                        const newCat = prompt(`Change category for ${slot} (current: ${currentCat}):\nOptions: ${catChoices}`, currentCat);
                        if (newCat && newCat.trim() !== '' && newCat !== currentCat) {
                            const res = await fetch('/api/time-audit/update-category/', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-CSRFToken': getCsrfToken()
                                },
                                body: JSON.stringify({ time_slot: slot, category: newCat.trim().toLowerCase() })
                            });
                            const resData = await res.json();
                            if (resData.status === 'success') {
                                loadTimeAuditData();
                            } else {
                                alert(resData.message || 'Failed to update category');
                            }
                        }
                    });
                });

                // Add backfill click listeners
                grid.querySelectorAll('.backfill-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const slot = e.target.dataset.slot;
                        const text = prompt(`Log activity for ${slot}:`);
                        if (text && text.trim() !== '') {
                            const res = await fetch('/api/time-audit/save/', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-CSRFToken': getCsrfToken()
                                },
                                body: JSON.stringify({ time_slot: slot, raw_text: text })
                            });
                            const resData = await res.json();
                            if (resData.status === 'success') {
                                loadTimeAuditData();
                            }
                        }
                    });
                });
            }
        } catch (err) {
            console.error('Error loading time audit data:', err);
        }
    }

    function getCsrfToken() {
        const cookie = document.cookie.split('; ').find(row => row.startsWith('csrftoken='));
        return cookie ? cookie.split('=')[1] : '';
    }

    const refreshAuditBtn = document.getElementById('refreshTimeAuditBtn');
    if (refreshAuditBtn) {
        refreshAuditBtn.addEventListener('click', loadTimeAuditData);
    }

    loadTimeAuditData();
    loadAnalytics();
});

