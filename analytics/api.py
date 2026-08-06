from django.http import JsonResponse
from django.utils import timezone
from django.db.models import Count, Q, Sum
from datetime import timedelta, datetime
from dashboard.models import Todo, PomodoroSession, DailyReflection, TimeAuditLog

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

def calc_window_opportunity_mins(p_sessions):
    if not p_sessions:
        return 0
    f_s = p_sessions[0]
    l_s = p_sessions[-1]
    l_start = timezone.localtime(f_s.started_at)
    l_end = timezone.localtime(l_s.ended_at) if l_s.ended_at else timezone.localtime(l_s.started_at + timedelta(minutes=l_s.duration_minutes))

    w_start = l_start.replace(hour=8, minute=0, second=0, microsecond=0)
    w_end = l_start.replace(hour=18, minute=0, second=0, microsecond=0)

    eff_start = max(w_start, l_start)
    eff_end = min(w_end, l_end)

    if eff_end > eff_start:
        window_span_mins = int((eff_end - eff_start).total_seconds() / 60)
        focus_mins_in_window = 0.0
        for s in p_sessions:
            s_st = timezone.localtime(s.started_at)
            s_en = timezone.localtime(s.ended_at) if s.ended_at else timezone.localtime(s.started_at + timedelta(minutes=s.duration_minutes))
            ov_st = max(eff_start, s_st)
            ov_en = min(eff_end, s_en)
            if ov_en > ov_st and s_en > s_st:
                tot_sec = (s_en - s_st).total_seconds()
                ov_sec = (ov_en - ov_st).total_seconds()
                ratio = min(1.0, max(0.0, ov_sec / tot_sec))
                focus_mins_in_window += s.duration_minutes * ratio
        return max(0, int(round(window_span_mins - focus_mins_in_window)))
    return 0

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
                total_opp = calc_window_opportunity_mins(p_sessions)
                
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
                    f_mins = sum(s.duration_minutes for s in p_sessions)
                    phd_m = sum(s.duration_minutes for s in p_sessions if s.category == 'phd')
                    oth_m = sum(s.duration_minutes for s in p_sessions if s.category != 'phd')
                    o_mins = calc_window_opportunity_mins(p_sessions)
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
                    f_mins = sum(s.duration_minutes for s in p_sessions)
                    phd_m = sum(s.duration_minutes for s in p_sessions if s.category == 'phd')
                    oth_m = sum(s.duration_minutes for s in p_sessions if s.category != 'phd')
                    o_mins = calc_window_opportunity_mins(p_sessions)
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

        signal_count = dist_dict.get('urgent_important', 0) + dist_dict.get('important_not_urgent', 0)
        noise_count = dist_dict.get('neither', 0) + dist_dict.get('urgent_not_important', 0) + dist_dict.get('stop_todo', 0)

        dist_data = {
            'labels': ['🎯 Signal (Focus)', '📦 Noise (Low Priority)'],
            'values': [signal_count, noise_count]
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

        # Compute Peak Focus & Peak Gap (Opportunity Time) for PhD and In-House (Other) separately
        phd_peak_focus_mins = 0
        phd_peak_focus_label = "N/A"
        other_peak_focus_mins = 0
        other_peak_focus_label = "N/A"

        phd_peak_gap_mins = 0
        phd_peak_gap_label = "N/A"
        other_peak_gap_mins = 0
        other_peak_gap_label = "N/A"

        for idx, label in enumerate(date_labels):
            p_m = phd_minutes[idx]
            o_m = other_minutes[idx]
            g_m = opportunity_minutes[idx]
            tot_f = p_m + o_m

            # Peak focus tracking
            if p_m > phd_peak_focus_mins:
                phd_peak_focus_mins = p_m
                phd_peak_focus_label = label

            if o_m > other_peak_focus_mins:
                other_peak_focus_mins = o_m
                other_peak_focus_label = label

            # Peak opportunity gap tracking
            if tot_f > 0:
                p_gap = int(round(g_m * (p_m / tot_f)))
                o_gap = int(round(g_m * (o_m / tot_f)))
            else:
                p_gap = g_m
                o_gap = g_m

            if p_gap > phd_peak_gap_mins:
                phd_peak_gap_mins = p_gap
                phd_peak_gap_label = label

        # Overall Highlights for 30% Summary Bracket
        total_focus_per_day = [p + o for p, o in zip(phd_minutes, other_minutes)]
        highest_day_focus_mins = max(total_focus_per_day) if total_focus_per_day else 0
        highest_day_focus_label = date_labels[total_focus_per_day.index(highest_day_focus_mins)] if total_focus_per_day and highest_day_focus_mins > 0 else "N/A"

        total_weekly_focus_mins = sum(total_focus_per_day)

        highest_day_gap_mins = max(opportunity_minutes) if opportunity_minutes else 0
        highest_day_gap_label = date_labels[opportunity_minutes.index(highest_day_gap_mins)] if opportunity_minutes and highest_day_gap_mins > 0 else "N/A"

        num_days = len(date_labels) if date_labels else 1
        avg_daily_focus_mins = int(round(total_weekly_focus_mins / float(num_days)))
        avg_daily_gap_mins = int(round(sum(opportunity_minutes) / float(num_days)))

        # Fetch Time Audit logs for the date range & compute category breakdown
        audit_qs = TimeAuditLog.objects.filter(user=request.user, date__gte=start_date, date__lte=end_date)
        num_slots = len(date_labels)
        cat_hours = {
            'phd': [0.0] * num_slots,
            'projects': [0.0] * num_slots,
            'life_skills': [0.0] * num_slots,
            'spiritual': [0.0] * num_slots,
            'cooking': [0.0] * num_slots,
            'driving': [0.0] * num_slots,
            'exercise': [0.0] * num_slots,
            'break': [0.0] * num_slots,
            'distracted': [0.0] * num_slots,
            'other': [0.0] * num_slots,
        }

        if view_type == 'day':
            for log in audit_qs:
                try:
                    h = int(log.time_slot.split(':')[0])
                    s_idx = min(h // 2, 11)
                    cat = log.category if log.category in cat_hours else 'other'
                    cat_hours[cat][s_idx] += 0.25
                except Exception:
                    pass
        else:
            date_to_idx = {d: i for i, d in enumerate(date_list)}
            for log in audit_qs:
                s_idx = date_to_idx.get(log.date)
                if s_idx is not None:
                    cat = log.category if log.category in cat_hours else 'other'
                    cat_hours[cat][s_idx] += 0.25

        cat_mins = {cat: int(round(sum(hrs) * 60)) for cat, hrs in cat_hours.items()}
        distracted_slots_count = audit_qs.filter(category='distracted').count()
        total_audit_mins = sum(cat_mins.values())

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
            'phd_minutes': phd_minutes,
            'other_minutes': other_minutes,
            'phd_hours': phd_hours,
            'other_hours': other_hours,
            'opportunity_minutes': opportunity_minutes,
            'opportunity_hours': opportunity_hours,
            'weekly_highlights': {
                'highest_focus_day_minutes': highest_day_focus_mins,
                'highest_focus_day_label': highest_day_focus_label,
                'total_weekly_focus_minutes': total_weekly_focus_mins,
                'highest_gap_minutes': highest_day_gap_mins,
                'highest_gap_label': highest_day_gap_label,
                'avg_daily_focus_minutes': avg_daily_focus_mins,
                'avg_daily_gap_minutes': avg_daily_gap_mins,
            },
            'phd_insights': {
                'highest_focus_minutes': phd_peak_focus_mins,
                'highest_focus_label': phd_peak_focus_label,
                'highest_gap_minutes': phd_peak_gap_mins,
                'highest_gap_label': phd_peak_gap_label,
                'total_focus_minutes': sum(phd_minutes),
            },
            'other_insights': {
                'highest_focus_minutes': other_peak_focus_mins,
                'highest_focus_label': other_peak_focus_label,
                'highest_gap_minutes': other_peak_gap_mins,
                'highest_gap_label': other_peak_gap_label,
                'total_focus_minutes': sum(other_minutes),
            },
            'time_audit_breakdown': {
                'phd_hours': [round(x, 2) for x in cat_hours['phd']],
                'projects_hours': [round(x, 2) for x in cat_hours['projects']],
                'life_skills_hours': [round(x, 2) for x in cat_hours['life_skills']],
                'spiritual_hours': [round(x, 2) for x in cat_hours['spiritual']],
                'cooking_hours': [round(x, 2) for x in cat_hours['cooking']],
                'driving_hours': [round(x, 2) for x in cat_hours['driving']],
                'exercise_hours': [round(x, 2) for x in cat_hours['exercise']],
                'break_hours': [round(x, 2) for x in cat_hours['break']],
                'distracted_hours': [round(x, 2) for x in cat_hours['distracted']],
                'other_hours': [round(x, 2) for x in cat_hours['other']],
                # Legacy combined field for backward compatibility
                'life_spiritual_hours': [round(a + b, 2) for a, b in zip(cat_hours['life_skills'], cat_hours['spiritual'])],
                'total_audit_minutes': total_audit_mins,
                'phd_minutes': cat_mins['phd'],
                'projects_minutes': cat_mins['projects'],
                'life_skills_minutes': cat_mins['life_skills'],
                'spiritual_minutes': cat_mins['spiritual'],
                'cooking_minutes': cat_mins['cooking'],
                'driving_minutes': cat_mins['driving'],
                'exercise_minutes': cat_mins['exercise'],
                'break_minutes': cat_mins['break'],
                'distracted_minutes': cat_mins['distracted'],
                'other_minutes': cat_mins['other'],
                'life_spiritual_minutes': cat_mins['life_skills'] + cat_mins['spiritual'],
                'distracted_slots_count': distracted_slots_count
            },
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




