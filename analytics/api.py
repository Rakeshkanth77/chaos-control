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
        view_type = request.GET.get('view', 'week')
        date_param = request.GET.get('date')
        
        if date_param:
            try:
                target_date = datetime.strptime(date_param, '%Y-%m-%d').date()
            except ValueError:
                target_date = timezone.localdate()
        else:
            target_date = timezone.localdate()

        if view_type == 'day':
            start_date = target_date
            end_date = target_date
            formatted_range = target_date.strftime('%A, %b %d, %Y')
            
            # 12 2-hour slots for the single day
            date_labels = [f"{h:02d}:00" for h in range(0, 24, 2)]
            
            todos_created = [0] * 12
            todos_completed = [0] * 12
            pomodoros_done = [0] * 12
            pomodoro_minutes = [0] * 12
            phd_minutes = [0] * 12
            other_minutes = [0] * 12
            opportunity_minutes = [0] * 12

            # Fetch todos for target date
            t_qs = Todo.objects.filter(date=target_date, user=request.user)
            for t in t_qs:
                slot = min(t.created_at.hour // 2, 11) if hasattr(t, 'created_at') and t.created_at else 6
                todos_created[slot] += 1
                if t.is_completed:
                    todos_completed[slot] += 1

            # Fetch pomodoros for target date
            p_sessions = list(PomodoroSession.objects.filter(date=target_date, completed=True, user=request.user).order_by('started_at'))
            for p in p_sessions:
                local_start = timezone.localtime(p.started_at)
                slot = min(local_start.hour // 2, 11)
                pomodoros_done[slot] += 1
                pomodoro_minutes[slot] += p.duration_minutes
                if p.category == 'phd':
                    phd_minutes[slot] += p.duration_minutes
                else:
                    other_minutes[slot] += p.duration_minutes

            if p_sessions:
                f_s = p_sessions[0]
                l_s = p_sessions[-1]
                l_start = timezone.localtime(f_s.started_at)
                l_end = timezone.localtime(l_s.ended_at) if l_s.ended_at else timezone.localtime(l_s.started_at + timedelta(minutes=l_s.duration_minutes))
                span_mins = max(0, int((l_end - l_start).total_seconds() / 60))
                tot_f_mins = sum(s.duration_minutes for s in p_sessions)
                total_opp = max(0, span_mins - tot_f_mins)
                
                # Distribute opportunity minutes proportionally across active slots
                active_slots = [i for i, m in enumerate(pomodoro_minutes) if m > 0]
                if active_slots:
                    opp_per_slot = total_opp // len(active_slots)
                    for idx in active_slots:
                        opportunity_minutes[idx] = opp_per_slot

        elif view_type == 'month':
            start_date = target_date.replace(day=1)
            next_month = (start_date + timedelta(days=32)).replace(day=1)
            end_date = next_month - timedelta(days=1)
            days_in_month = (end_date - start_date).days + 1
            formatted_range = target_date.strftime('%B %Y')
            
            date_list = [start_date + timedelta(days=i) for i in range(days_in_month)]
            date_labels = [d.strftime('%d') for d in date_list]

            todo_data = Todo.objects.filter(date__gte=start_date, date__lte=end_date, user=request.user).values('date').annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(is_completed=True))
            )
            todo_dict = {item['date']: item for item in todo_data}

            todos_created = []
            todos_completed = []
            pomodoros_done = []
            pomodoro_minutes = []
            phd_minutes = []
            other_minutes = []
            opportunity_minutes = []

            for d in date_list:
                t_info = todo_dict.get(d, {'total': 0, 'completed': 0})
                todos_created.append(t_info['total'])
                todos_completed.append(t_info['completed'])

                p_sessions = list(PomodoroSession.objects.filter(date=d, completed=True, user=request.user).order_by('started_at'))
                if p_sessions:
                    f_s = p_sessions[0]
                    l_s = p_sessions[-1]
                    l_start = timezone.localtime(f_s.started_at)
                    l_end = timezone.localtime(l_s.ended_at) if l_s.ended_at else timezone.localtime(l_s.started_at + timedelta(minutes=l_s.duration_minutes))
                    span_mins = max(0, int((l_end - l_start).total_seconds() / 60))
                    f_mins = sum(s.duration_minutes for s in p_sessions)
                    phd_m = sum(s.duration_minutes for s in p_sessions if s.category == 'phd')
                    oth_m = sum(s.duration_minutes for s in p_sessions if s.category != 'phd')
                    o_mins = max(0, span_mins - f_mins)
                else:
                    f_mins = 0
                    phd_m = 0
                    oth_m = 0
                    o_mins = 0

                pomodoros_done.append(len(p_sessions))
                pomodoro_minutes.append(f_mins)
                phd_minutes.append(phd_m)
                other_minutes.append(oth_m)
                opportunity_minutes.append(o_mins)

        else: # Default: Week View
            start_date = target_date - timedelta(days=target_date.weekday())
            end_date = start_date + timedelta(days=6)
            formatted_range = f"{start_date.strftime('%b %d')} - {end_date.strftime('%b %d, %Y')}"

            date_list = [start_date + timedelta(days=i) for i in range(7)]
            date_labels = [d.strftime('%a (%m/%d)') for d in date_list]

            todo_data = Todo.objects.filter(date__gte=start_date, date__lte=end_date, user=request.user).values('date').annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(is_completed=True))
            )
            todo_dict = {item['date']: item for item in todo_data}

            todos_created = []
            todos_completed = []
            pomodoros_done = []
            pomodoro_minutes = []
            phd_minutes = []
            other_minutes = []
            opportunity_minutes = []

            for d in date_list:
                t_info = todo_dict.get(d, {'total': 0, 'completed': 0})
                todos_created.append(t_info['total'])
                todos_completed.append(t_info['completed'])

                p_sessions = list(PomodoroSession.objects.filter(date=d, completed=True, user=request.user).order_by('started_at'))
                if p_sessions:
                    f_s = p_sessions[0]
                    l_s = p_sessions[-1]
                    l_start = timezone.localtime(f_s.started_at)
                    l_end = timezone.localtime(l_s.ended_at) if l_s.ended_at else timezone.localtime(l_s.started_at + timedelta(minutes=l_s.duration_minutes))
                    span_mins = max(0, int((l_end - l_start).total_seconds() / 60))
                    f_mins = sum(s.duration_minutes for s in p_sessions)
                    phd_m = sum(s.duration_minutes for s in p_sessions if s.category == 'phd')
                    oth_m = sum(s.duration_minutes for s in p_sessions if s.category != 'phd')
                    o_mins = max(0, span_mins - f_mins)
                else:
                    f_mins = 0
                    phd_m = 0
                    oth_m = 0
                    o_mins = 0

                pomodoros_done.append(len(p_sessions))
                pomodoro_minutes.append(f_mins)
                phd_minutes.append(phd_m)
                other_minutes.append(oth_m)
                opportunity_minutes.append(o_mins)

        # Eisenhower distribution for target range (fallback to all active todos if empty)
        eisenhower_distribution = Todo.objects.filter(date__gte=start_date, date__lte=end_date, user=request.user).values('priority').annotate(count=Count('id'))
        dist_dict = {item['priority']: item['count'] for item in eisenhower_distribution}
        if sum(dist_dict.values()) == 0:
            fallback_qs = Todo.objects.filter(is_completed=False, user=request.user).values('priority').annotate(count=Count('id'))
            dist_dict = {item['priority']: item['count'] for item in fallback_qs}

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

        # Overall counts for range
        total_todos_completed = Todo.objects.filter(date__gte=start_date, date__lte=end_date, is_completed=True, user=request.user).count()
        total_pomodoros = PomodoroSession.objects.filter(date__gte=start_date, date__lte=end_date, completed=True, user=request.user).count()

        # Query completions for the last 365 days for the contribution grid
        today = timezone.localdate()
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

        pomodoro_hours = [round(m / 60.0, 2) for m in pomodoro_minutes]
        phd_hours = [round(m / 60.0, 2) for m in phd_minutes]
        other_hours = [round(m / 60.0, 2) for m in other_minutes]
        opportunity_hours = [round(m / 60.0, 2) for m in opportunity_minutes]

        return JsonResponse({
            'status': 'success',
            'view': view_type,
            'target_date': target_date.strftime('%Y-%m-%d'),
            'formatted_range': formatted_range,
            'labels': date_labels,
            'todos_created': todos_created,
            'todos_completed': todos_completed,
            'pomodoros': pomodoros_done,
            'pomodoro_minutes': pomodoro_minutes,
            'pomodoro_hours': pomodoro_hours,
            'phd_hours': phd_hours,
            'other_hours': other_hours,
            'opportunity_minutes': opportunity_minutes,
            'opportunity_hours': opportunity_hours,
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




