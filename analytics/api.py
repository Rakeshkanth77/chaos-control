from django.http import JsonResponse
from django.utils import timezone
from django.db.models import Count, Q
from datetime import timedelta, datetime
from dashboard.models import Todo, PomodoroSession, DailyReflection

from django.contrib.auth.decorators import login_required

def calculate_streak(user):
    """
    Calculates the current streak of active days (activity = completed todo, pomodoro, or reflection).
    """
    if not user or not user.is_authenticated:
        return 0

    today = timezone.localdate()
    streak = 0
    current_date = today

    # Check if there is any activity today or yesterday to continue/start the streak calculation
    activity_today = (
        Todo.objects.filter(date=today, is_completed=True, user=user).exists() or
        PomodoroSession.objects.filter(date=today, completed=True, user=user).exists() or
        DailyReflection.objects.filter(date=today, user=user).exclude(notes='').exists()
    )
    
    if not activity_today:
        # Check if they had activity yesterday, if so start counting from yesterday
        yesterday = today - timedelta(days=1)
        activity_yesterday = (
            Todo.objects.filter(date=yesterday, is_completed=True, user=user).exists() or
            PomodoroSession.objects.filter(date=yesterday, completed=True, user=user).exists() or
            DailyReflection.objects.filter(date=yesterday, user=user).exclude(notes='').exists()
        )
        if activity_yesterday:
            current_date = yesterday
        else:
            return 0

    while True:
        has_activity = (
            Todo.objects.filter(date=current_date, is_completed=True, user=user).exists() or
            PomodoroSession.objects.filter(date=current_date, completed=True, user=user).exists() or
            DailyReflection.objects.filter(date=current_date, user=user).exclude(notes='').exists()
        )
        
        if has_activity:
            streak += 1
            current_date -= timedelta(days=1)
        else:
            break

    return streak

@login_required
def get_summary_stats(request):
    try:
        today = timezone.localdate()
        start_date = today - timedelta(days=6) # 7 days including today

        # Generate list of last 7 days for reference
        date_list = [start_date + timedelta(days=i) for i in range(7)]
        date_labels = [d.strftime('%a (%m/%d)') for d in date_list]

        # Fetch activities grouped by date
        todo_data = Todo.objects.filter(date__gte=start_date, date__lte=today, user=request.user).values('date').annotate(
            total=Count('id'),
            completed=Count('id', filter=Q(is_completed=True))
        )
        
        pomodoro_data = PomodoroSession.objects.filter(date__gte=start_date, date__lte=today, completed=True, user=request.user).values('date').annotate(
            count=Count('id')
        )

        # Map datasets into dictionary by date
        todo_dict = {item['date']: item for item in todo_data}
        pomodoro_dict = {item['date']: item['count'] for item in pomodoro_data}

        # Construct daily trend arrays
        todos_created = []
        todos_completed = []
        pomodoros_done = []

        for d in date_list:
            t_info = todo_dict.get(d, {'total': 0, 'completed': 0})
            todos_created.append(t_info['total'])
            todos_completed.append(t_info['completed'])

            pomodoros_done.append(pomodoro_dict.get(d, 0))

        # Eisenhower distribution (all-time or active todos)
        eisenhower_distribution = Todo.objects.filter(is_completed=False, user=request.user).values('priority').annotate(count=Count('id'))
        dist_dict = {item['priority']: item['count'] for item in eisenhower_distribution}
        
        priority_mapping = {
            'urgent_important': 'Urgent & Important',
            'important_not_urgent': 'Important & Not Urgent',
            'urgent_not_important': 'Urgent & Not Important',
            'neither': 'Neither'
        }
        
        dist_data = {
            'labels': [priority_mapping[k] for k in priority_mapping.keys()],
            'values': [dist_dict.get(k, 0) for k in priority_mapping.keys()]
        }

        # Calculate user activity streak
        streak = calculate_streak(request.user)

        # Overall counts
        total_todos_completed = Todo.objects.filter(is_completed=True, user=request.user).count()
        total_pomodoros = PomodoroSession.objects.filter(completed=True, user=request.user).count()

        # Query completions for the last 365 days for the contribution grid
        year_ago = today - timedelta(days=365)
        grid_data = Todo.objects.filter(
            date__gte=year_ago,
            date__lte=today,
            is_completed=True,
            user=request.user
        ).values('date').annotate(count=Count('id'))
        
        grid_list = []
        for item in grid_data:
            d = item['date']
            if isinstance(d, datetime):
                d = d.date()
            grid_list.append({
                'date': d.strftime('%Y-%m-%d'),
                'count': item['count']
            })

        return JsonResponse({
            'status': 'success',
            'labels': date_labels,
            'todos_created': todos_created,
            'todos_completed': todos_completed,
            'pomodoros': pomodoros_done,
            'eisenhower_distribution': dist_data,
            'streak': streak,
            'totals': {
                'todos_completed': total_todos_completed,
                'pomodoros_completed': total_pomodoros,
            },
            'contribution_grid': grid_list
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
def get_capacity_stats(request):
    """
    Returns:
      - weekday_avg: list of 7 floats, average completed sprints per day-of-week (Mon=0)
      - today_sprints: int, how many sprints completed today
      - today_tasks: int, how many active (non-completed) tasks exist today
      - weekday_avg_today: float, the historical average for today's weekday
      - status: 'on_track' | 'over_ambitious' | 'under_challenged' | 'no_data'
    """
    try:
        user = request.user
        today = timezone.localdate()
        today_weekday = today.weekday()  # 0 = Monday
        lookback = today - timedelta(days=30)

        # 30-day history: group by date and count completed sessions per day
        sessions_30d = PomodoroSession.objects.filter(
            user=user, completed=True,
            date__gte=lookback, date__lt=today
        ).values('date')

        # Build a dict: date -> sprint count
        date_counts = {}
        for s in sessions_30d:
            d = s['date']
            date_counts[d] = date_counts.get(d, 0) + 1

        # Average per weekday
        weekday_totals = [0] * 7
        weekday_day_counts = [0] * 7
        current = lookback
        while current < today:
            wd = current.weekday()
            weekday_day_counts[wd] += 1
            weekday_totals[wd] += date_counts.get(current, 0)
            current += timedelta(days=1)

        weekday_avg = []
        for wd in range(7):
            if weekday_day_counts[wd] > 0:
                weekday_avg.append(round(weekday_totals[wd] / weekday_day_counts[wd], 1))
            else:
                weekday_avg.append(0.0)

        avg_today = weekday_avg[today_weekday]

        # Today's sprints completed
        today_sprints = PomodoroSession.objects.filter(
            user=user, completed=True, date=today
        ).count()

        # Today's pending (non-completed) tasks
        today_tasks = Todo.objects.filter(
            user=user, date=today, is_completed=False
        ).count()

        # Status calculation: compare tasks planned vs historical avg sprints
        if avg_today == 0:
            status = 'no_data'
        elif today_tasks == 0:
            status = 'on_track'
        else:
            ratio = today_tasks / max(avg_today, 1)
            if ratio <= 1.1:
                status = 'on_track'
            elif ratio <= 1.6:
                status = 'over_ambitious'
            else:
                status = 'overloaded'

        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

        return JsonResponse({
            'status': 'success',
            'weekday_avg': weekday_avg,
            'weekday_avg_today': avg_today,
            'today_weekday_name': day_names[today_weekday],
            'today_sprints': today_sprints,
            'today_tasks': today_tasks,
            'capacity_status': status,
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

