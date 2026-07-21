from django.http import JsonResponse
from django.utils import timezone
from django.db.models import Count, Q, Sum
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
            count=Count('id'),
            total_minutes=Sum('duration_minutes')
        )

        # Map datasets into dictionary by date
        todo_dict = {item['date']: item for item in todo_data}
        pomodoro_dict = {item['date']: {'count': item['count'], 'minutes': item['total_minutes'] or 0} for item in pomodoro_data}

        # Construct daily trend arrays
        todos_created = []
        todos_completed = []
        pomodoros_done = []
        pomodoro_minutes = []

        for d in date_list:
            t_info = todo_dict.get(d, {'total': 0, 'completed': 0})
            todos_created.append(t_info['total'])
            todos_completed.append(t_info['completed'])

            p_info = pomodoro_dict.get(d, {'count': 0, 'minutes': 0})
            pomodoros_done.append(p_info['count'])
            pomodoro_minutes.append(p_info['minutes'])

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
            'pomodoro_minutes': pomodoro_minutes,
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




