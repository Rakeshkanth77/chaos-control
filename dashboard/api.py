import json
from collections import Counter
from functools import wraps
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.utils import timezone
from datetime import datetime, timedelta
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile, Project, TaskBreakdown, AIUsage, TimeAuditLog, HabitProtocol, HabitProtocolLog
from .services import parse_brain_dump, generate_ai_reflection


def consume_ai_quota(user):
    """
    Increment the user's daily AI-usage counter.
    Returns (allowed: bool, remaining: int). Staff are exempt from the limit.
    """
    limit = settings.DAILY_AI_LIMIT
    today = timezone.localdate()
    usage, _ = AIUsage.objects.get_or_create(user=user, date=today)
    if not user.is_staff and usage.count >= limit:
        return False, 0
    usage.count += 1
    usage.save(update_fields=['count'])
    return True, max(limit - usage.count, 0)

def get_date_from_request(data):
    """
    Helper to extract and parse date from request dictionary or default to today.
    """
    date_str = data.get('date')
    if date_str:
        try:
            return datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            pass
    return timezone.localdate()

def api_login_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'status': 'error', 'message': 'Authentication required'}, status=401)
        return view_func(request, *args, **kwargs)
    return _wrapped_view

@require_POST
@api_login_required
def save_braindump(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        content = data.get('content', '').strip()

        braindump, created = BrainDump.objects.get_or_create(
            date=target_date,
            user=request.user,
            defaults={'content': content}
        )
        if not created:
            braindump.content = content
            braindump.save()

        return JsonResponse({'status': 'success', 'content': braindump.content})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def generate_todos(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)

        # Retrieve brain dump
        braindump = BrainDump.objects.filter(date=target_date, user=request.user).first()
        if not braindump or not braindump.content.strip():
            return JsonResponse({'status': 'error', 'message': 'Brain dump is empty.'}, status=400)

        # Enforce daily AI quota before spending an LLM call
        allowed, remaining = consume_ai_quota(request.user)
        if not allowed:
            return JsonResponse({
                'status': 'error',
                'message': f"You've reached today's limit of {settings.DAILY_AI_LIMIT} AI actions. It resets tomorrow.",
            }, status=429)

        # Run LLM or fallback parsing service
        todo_titles = parse_brain_dump(braindump.content)
        
        # Create todos in DB (avoid duplicates for same day/dump if desired, or just create them)
        created_todos = []
        # Get current order offset
        max_order = Todo.objects.filter(date=target_date, user=request.user).count()
        
        for i, title in enumerate(todo_titles):
            # Check if this todo title already exists for today to avoid duplicate generations
            if Todo.objects.filter(date=target_date, title=title, user=request.user).exists():
                continue
                
            todo = Todo.objects.create(
                user=request.user,
                title=title,
                source_dump=braindump,
                priority='unassigned',
                order=max_order + i,
                date=target_date
            )
            created_todos.append({
                'id': todo.id,
                'title': todo.title,
                'priority': todo.priority,
                'is_completed': todo.is_completed,
            })

        return JsonResponse({
            'status': 'success', 
            'todos': created_todos,
            'count': len(created_todos)
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def add_todo(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        title = data.get('title', '').strip()
        priority = data.get('priority', 'unassigned')

        if not title:
            return JsonResponse({'status': 'error', 'message': 'Title is required'}, status=400)

        max_order = Todo.objects.filter(date=target_date, user=request.user).count()

        todo = Todo.objects.create(
            user=request.user,
            title=title,
            priority=priority,
            order=max_order,
            date=target_date
        )

        return JsonResponse({
            'status': 'success',
            'todo': {
                'id': todo.id,
                'title': todo.title,
                'priority': todo.priority,
                'is_completed': todo.is_completed
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_todo_priority(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        new_priority = data.get('priority')
        # Optional: ordered list of ids to adjust sorting order within the quadrant
        ordered_ids = data.get('ordered_ids', [])

        todo = Todo.objects.get(id=todo_id, user=request.user)
        
        # Optional date rollover / rescheduling
        date_str = data.get('date')
        if date_str:
            try:
                todo.date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                pass

        if new_priority in dict(Todo.PRIORITY_CHOICES).keys():
            todo.priority = new_priority
            todo.save()

        # Reorder items if requested
        if ordered_ids:
            for index, tid in enumerate(ordered_ids):
                Todo.objects.filter(id=tid, user=request.user).update(order=index)

        return JsonResponse({'status': 'success'})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def toggle_todo(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        todo = Todo.objects.get(id=todo_id, user=request.user)
        todo.is_completed = not todo.is_completed
        todo.save()
        return JsonResponse({'status': 'success', 'is_completed': todo.is_completed})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def delete_todo(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        todo = Todo.objects.get(id=todo_id, user=request.user)
        todo.delete()
        return JsonResponse({'status': 'success'})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def save_reflection(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        notes = data.get('notes', '').strip()

        reflection, created = DailyReflection.objects.get_or_create(
            date=target_date,
            user=request.user,
            defaults={'notes': notes}
        )
        if not created:
            reflection.notes = notes
            reflection.save()

        return JsonResponse({'status': 'success', 'notes': reflection.notes})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def generate_suggestions_view(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)

        # Retrieve reflection notes
        reflection = DailyReflection.objects.filter(date=target_date, user=request.user).first()
        if not reflection or not reflection.notes.strip():
            return JsonResponse({'status': 'error', 'message': 'Daily reflection notes are empty.'}, status=400)

        # Enforce daily AI quota before spending an LLM call
        allowed, remaining = consume_ai_quota(request.user)
        if not allowed:
            return JsonResponse({
                'status': 'error',
                'message': f"You've reached today's limit of {settings.DAILY_AI_LIMIT} AI actions. It resets tomorrow.",
            }, status=429)

        # Generate mistakes & suggestions via LLM service
        mistakes, suggestions = generate_ai_reflection(reflection.notes)
        
        reflection.mistakes = mistakes
        reflection.suggestions = suggestions
        reflection.save()

        return JsonResponse({
            'status': 'success',
            'mistakes': reflection.mistakes,
            'suggestions': reflection.suggestions
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

def sync_user_pomodoros(user):
    """
    Finds any active (incomplete) Pomodoro sessions for this user.
    If current time exceeds started_at + duration + total_paused_seconds + 60s grace, marks it as completed.
    """
    active_sessions = PomodoroSession.objects.filter(user=user, completed=False)
    now = timezone.now()
    synced_count = 0
    for session in active_sessions:
        if session.is_paused:
            continue  # Paused sessions stay active until resumed or completed early
        paused_sec = session.total_paused_seconds
        end_time = session.started_at + timezone.timedelta(minutes=session.duration_minutes, seconds=paused_sec)
        auto_complete_time = end_time + timezone.timedelta(seconds=60) # 60-second grace period
        if now >= auto_complete_time:
            session.completed = True
            session.ended_at = end_time
            session.save()
            synced_count += 1
    return synced_count

@require_POST
@api_login_required
def start_pomodoro(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        duration = int(data.get('duration_minutes', 25))
        task_id = data.get('task_id')
        custom_task_title = data.get('task_title', '').strip()

        # Clear/delete any active, unfinished sessions first to prevent concurrency clutter
        PomodoroSession.objects.filter(user=request.user, completed=False).delete()

        task_obj = None
        focus_title = custom_task_title
        if task_id:
            try:
                task_obj = Todo.objects.get(id=task_id, user=request.user)
                if not focus_title:
                    focus_title = task_obj.title
            except Todo.DoesNotExist:
                pass

        category = data.get('category', 'other')
        if category not in ['phd', 'other']:
            category = 'other'

        session = PomodoroSession.objects.create(
            user=request.user,
            task=task_obj,
            category=category,
            duration_minutes=duration,
            completed=False,
            is_paused=False,
            total_paused_seconds=0,
            focus_log=focus_title,
            date=target_date
        )

        return JsonResponse({'status': 'success', 'session_id': session.id, 'task_title': focus_title, 'category': session.category})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def complete_pomodoro(request):
    try:
        data = json.loads(request.body)
        session_id = data.get('session_id')
        session = PomodoroSession.objects.get(id=session_id, user=request.user)
        session.completed = True
        if not session.ended_at:
            session.ended_at = timezone.now()
        session.is_paused = False
        session.save()
        
        count = PomodoroSession.objects.filter(date=session.date, completed=True, user=request.user).count()
        return JsonResponse({'status': 'success', 'count': count})
    except PomodoroSession.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Session not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def pause_pomodoro(request):
    try:
        session = PomodoroSession.objects.filter(user=request.user, completed=False).order_by('-started_at').first()
        if not session:
            return JsonResponse({'status': 'error', 'message': 'No active session'}, status=404)
        
        if not session.is_paused:
            session.is_paused = True
            session.paused_at = timezone.now()
            session.save()
        
        return JsonResponse({'status': 'success', 'is_paused': True})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def resume_pomodoro(request):
    try:
        session = PomodoroSession.objects.filter(user=request.user, completed=False).order_by('-started_at').first()
        if not session:
            return JsonResponse({'status': 'error', 'message': 'No active session'}, status=404)
        
        if session.is_paused and session.paused_at:
            paused_duration = int((timezone.now() - session.paused_at).total_seconds())
            session.total_paused_seconds += max(0, paused_duration)
            session.is_paused = False
            session.paused_at = None
            session.save()
            
        return JsonResponse({'status': 'success', 'is_paused': False, 'total_paused_seconds': session.total_paused_seconds})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def extend_pomodoro(request):
    try:
        data = json.loads(request.body)
        extra_minutes = int(data.get('extra_minutes', 5))
        session = PomodoroSession.objects.filter(user=request.user, completed=False).order_by('-started_at').first()
        if not session:
            return JsonResponse({'status': 'error', 'message': 'No active session'}, status=404)
        
        session.duration_minutes += extra_minutes
        session.save()
        
        return JsonResponse({'status': 'success', 'duration_minutes': session.duration_minutes})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def finish_early_pomodoro(request):
    try:
        session = PomodoroSession.objects.filter(user=request.user, completed=False).order_by('-started_at').first()
        if not session:
            return JsonResponse({'status': 'error', 'message': 'No active session'}, status=404)
        
        now = timezone.now()
        total_paused = session.total_paused_seconds
        if session.is_paused and session.paused_at:
            total_paused += int((now - session.paused_at).total_seconds())
            
        actual_seconds = max(60, int((now - session.started_at).total_seconds()) - total_paused)
        actual_minutes = max(1, round(actual_seconds / 60))
        
        session.duration_minutes = actual_minutes
        session.total_paused_seconds = total_paused
        session.is_paused = False
        session.paused_at = None
        session.completed = True
        session.ended_at = now
        session.save()
        
        return JsonResponse({
            'status': 'success',
            'session_id': session.id,
            'duration_minutes': actual_minutes,
            'started_at': timezone.localtime(session.started_at).strftime('%I:%M %p')
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@api_login_required
def pomodoro_status(request):
    try:
        sync_user_pomodoros(request.user)
        today = timezone.localdate()
        
        active_session = PomodoroSession.objects.filter(user=request.user, completed=False).order_by('-started_at').first()
        active_data = None
        if active_session:
            now = timezone.now()
            curr_paused_sec = active_session.total_paused_seconds
            if active_session.is_paused and active_session.paused_at:
                curr_paused_sec += int((now - active_session.paused_at).total_seconds())
                
            end_time = active_session.started_at + timezone.timedelta(minutes=active_session.duration_minutes, seconds=curr_paused_sec)
            remaining = max(0, int((end_time - now).total_seconds()))
            
            in_grace = (now >= end_time) and (now < end_time + timezone.timedelta(seconds=60))
            grace_rem = max(0, int((end_time + timezone.timedelta(seconds=60) - now).total_seconds())) if in_grace else 0
            
            task_title = active_session.task.title if active_session.task else (active_session.focus_log or "")

            active_data = {
                'id': active_session.id,
                'duration_minutes': active_session.duration_minutes,
                'started_at': active_session.started_at.isoformat(),
                'remaining_seconds': remaining,
                'is_paused': active_session.is_paused,
                'total_paused_seconds': curr_paused_sec,
                'in_grace_period': in_grace,
                'grace_remaining_seconds': grace_rem,
                'task_id': active_session.task.id if active_session.task else None,
                'task_title': task_title
            }
        
        # Get pending tasks for today
        pending_todos = Todo.objects.filter(user=request.user, date=today, is_completed=False).order_by('id')
        pending_list = [{'id': t.id, 'title': t.title} for t in pending_todos]

        completed_sessions = PomodoroSession.objects.filter(
            user=request.user,
            completed=True,
            date=today
        ).order_by('-started_at')
        
        logs_list = []
        prompt_log_session = None
        
        for s in completed_sessions:
            local_start = timezone.localtime(s.started_at)
            local_end = timezone.localtime(s.ended_at) if s.ended_at else timezone.localtime(s.started_at + timezone.timedelta(minutes=s.duration_minutes, seconds=s.total_paused_seconds))
            started_at_minutes = local_start.hour * 60 + local_start.minute
            ended_at_minutes = min(local_end.hour * 60 + local_end.minute, 1439)
            
            total_elapsed_sec = int((local_end - local_start).total_seconds())
            calc_paused_sec = max(s.total_paused_seconds, max(0, total_elapsed_sec - (s.duration_minutes * 60)))
            
            logs_list.append({
                'id': s.id,
                'started_at': local_start.strftime('%I:%M %p'),
                'ended_at': local_end.strftime('%I:%M %p'),
                'started_at_minutes': started_at_minutes,
                'ended_at_minutes': ended_at_minutes,
                'duration_minutes': s.duration_minutes,
                'total_paused_seconds': calc_paused_sec,
                'focus_log': s.focus_log
            })
            if not s.focus_log and not prompt_log_session:
                prompt_log_session = {
                    'id': s.id,
                    'duration_minutes': s.duration_minutes,
                    'started_at': local_start.strftime('%I:%M %p')
                }
                
        return JsonResponse({
            'status': 'success',
            'active_session': active_data,
            'pending_tasks': pending_list,
            'completed_logs': logs_list,
            'prompt_log_session': prompt_log_session
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def save_pomodoro_log(request):
    try:
        data = json.loads(request.body)
        session_id = data.get('session_id')
        focus_log = data.get('focus_log', '').strip()
        
        if not focus_log:
            focus_log = "Focus Session"  # default placeholder
            
        session = PomodoroSession.objects.get(id=session_id, user=request.user)
        session.focus_log = focus_log
        session.save()
        
        # Return count for today
        count = PomodoroSession.objects.filter(date=session.date, completed=True, user=request.user).count()
        return JsonResponse({'status': 'success', 'count': count})
    except PomodoroSession.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Session not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def cancel_pomodoro(request):
    try:
        deleted_count, _ = PomodoroSession.objects.filter(user=request.user, completed=False).delete()
        return JsonResponse({'status': 'success', 'deleted_count': deleted_count})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@api_login_required
def pomodoro_history(request):
    """
    Returns focus logs and stats for Day, Week, or Month view based on target date.
    Query params:
    - view: 'day' | 'week' | 'month' (default: 'day')
    - date: 'YYYY-MM-DD' (default: today)
    """
    try:
        view_type = request.GET.get('view', 'day').lower()
        date_str = request.GET.get('date')
        
        if date_str:
            try:
                target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                target_date = timezone.localdate()
        else:
            target_date = timezone.localdate()
            
        def build_session_log(s):
            l_start = timezone.localtime(s.started_at)
            l_end = timezone.localtime(s.ended_at) if s.ended_at else timezone.localtime(s.started_at + timezone.timedelta(minutes=s.duration_minutes, seconds=s.total_paused_seconds))
            total_elapsed_sec = int((l_end - l_start).total_seconds())
            calc_paused_sec = max(s.total_paused_seconds, max(0, total_elapsed_sec - (s.duration_minutes * 60)))
            return {
                'id': s.id,
                'started_at': l_start.strftime('%I:%M %p'),
                'ended_at': l_end.strftime('%I:%M %p'),
                'started_at_minutes': l_start.hour * 60 + l_start.minute,
                'ended_at_minutes': min(l_end.hour * 60 + l_end.minute, 1439),
                'duration_minutes': s.duration_minutes,
                'total_paused_seconds': calc_paused_sec,
                'focus_log': s.focus_log
            }
            
        def calc_day_metrics(d_sessions):
            if not d_sessions:
                return {
                    'first_start': None,
                    'last_end': None,
                    'span_minutes': 0,
                    'focus_minutes': 0,
                    'gap_minutes': 0,
                    'opportunity_minutes': 0
                }
            sorted_s = sorted(d_sessions, key=lambda s: s.started_at)
            first_s = sorted_s[0]
            last_s = sorted_s[-1]
            
            l_start = timezone.localtime(first_s.started_at)
            if last_s.ended_at:
                l_end = timezone.localtime(last_s.ended_at)
            else:
                l_end = timezone.localtime(last_s.started_at + timezone.timedelta(minutes=last_s.duration_minutes, seconds=last_s.total_paused_seconds))
            
            span_sec = max(0, int((l_end - l_start).total_seconds()))
            span_mins = int(span_sec / 60)
            focus_mins = sum(s.duration_minutes for s in d_sessions)
            
            # Restrict opportunity calculation strictly between 8:00 AM (08:00) and 6:00 PM (18:00)
            d_date = l_start.date()
            w_start = l_start.replace(hour=8, minute=0, second=0, microsecond=0)
            w_end = l_start.replace(hour=18, minute=0, second=0, microsecond=0)

            eff_start = max(w_start, l_start)
            eff_end = min(w_end, l_end)

            if eff_end > eff_start:
                window_span_mins = int((eff_end - eff_start).total_seconds() / 60)
                focus_mins_in_window = 0.0
                for s in d_sessions:
                    s_st = timezone.localtime(s.started_at)
                    s_en = timezone.localtime(s.ended_at) if s.ended_at else timezone.localtime(s.started_at + timezone.timedelta(minutes=s.duration_minutes, seconds=s.total_paused_seconds))
                    ov_st = max(eff_start, s_st)
                    ov_en = min(eff_end, s_en)
                    if ov_en > ov_st and s_en > s_st:
                        tot_sec = (s_en - s_st).total_seconds()
                        ov_sec = (ov_en - ov_st).total_seconds()
                        ratio = min(1.0, max(0.0, ov_sec / tot_sec))
                        focus_mins_in_window += s.duration_minutes * ratio
                opp_mins = max(0, int(round(window_span_mins - focus_mins_in_window)))
            else:
                opp_mins = 0
            
            return {
                'first_start': l_start.strftime('%I:%M %p'),
                'last_end': l_end.strftime('%I:%M %p'),
                'span_minutes': span_mins,
                'focus_minutes': focus_mins,
                'gap_minutes': opp_mins,
                'opportunity_minutes': opp_mins
            }
            
        if view_type == 'week':
            # Calculate Monday - Sunday range
            start_of_week = target_date - timezone.timedelta(days=target_date.weekday())
            end_of_week = start_of_week + timezone.timedelta(days=6)
            
            sessions = PomodoroSession.objects.filter(
                user=request.user,
                completed=True,
                date__gte=start_of_week,
                date__lte=end_of_week
            ).order_by('started_at')
            
            daily_list = []
            total_focus_mins = 0
            total_gap_mins = 0
            total_sessions_count = sessions.count()
            
            for i in range(7):
                curr_d = start_of_week + timezone.timedelta(days=i)
                d_sessions = [s for s in sessions if s.date == curr_d]
                metrics = calc_day_metrics(d_sessions)
                total_focus_mins += metrics['focus_minutes']
                total_gap_mins += metrics['opportunity_minutes']
                
                logs_data = [build_session_log(s) for s in d_sessions]
                    
                daily_list.append({
                    'date': curr_d.strftime('%Y-%m-%d'),
                    'day_name': curr_d.strftime('%a'),
                    'day_num': curr_d.day,
                    'is_today': curr_d == timezone.localdate(),
                    'focus_minutes': metrics['focus_minutes'],
                    'gap_minutes': metrics['opportunity_minutes'],
                    'opportunity_minutes': metrics['opportunity_minutes'],
                    'span_minutes': metrics['span_minutes'],
                    'first_start': metrics['first_start'],
                    'last_end': metrics['last_end'],
                    'session_count': len(d_sessions),
                    'logs': logs_data
                })
                
            return JsonResponse({
                'status': 'success',
                'view': 'week',
                'target_date': target_date.strftime('%Y-%m-%d'),
                'start_date': start_of_week.strftime('%Y-%m-%d'),
                'end_date': end_of_week.strftime('%Y-%m-%d'),
                'formatted_range': f"{start_of_week.strftime('%b %d')} - {end_of_week.strftime('%b %d, %Y')}",
                'total_focus_minutes': total_focus_mins,
                'total_gap_minutes': total_gap_mins,
                'total_opportunity_minutes': total_gap_mins,
                'total_sessions': total_sessions_count,
                'avg_daily_minutes': round(total_focus_mins / 7, 1),
                'days': daily_list
            })
            
        elif view_type == 'month':
            # Calculate 1st day of month to last day of month
            start_of_month = target_date.replace(day=1)
            next_month = (start_of_month + timezone.timedelta(days=32)).replace(day=1)
            end_of_month = next_month - timezone.timedelta(days=1)
            
            sessions = PomodoroSession.objects.filter(
                user=request.user,
                completed=True,
                date__gte=start_of_month,
                date__lte=end_of_month
            ).order_by('started_at')
            
            total_focus_mins = sum(s.duration_minutes for s in sessions)
            total_sessions_count = sessions.count()
            
            days_in_month = (end_of_month - start_of_month).days + 1
            daily_map = {}
            active_days_count = 0
            total_gap_mins = 0
            
            for i in range(1, days_in_month + 1):
                curr_d = start_of_month.replace(day=i)
                d_sessions = [s for s in sessions if s.date == curr_d]
                metrics = calc_day_metrics(d_sessions)
                if metrics['focus_minutes'] > 0:
                    active_days_count += 1
                total_gap_mins += metrics['opportunity_minutes']
                    
                logs_data = [build_session_log(s) for s in d_sessions]
                    
                daily_map[i] = {
                    'date': curr_d.strftime('%Y-%m-%d'),
                    'day_num': i,
                    'weekday_name': curr_d.strftime('%a'),
                    'is_today': curr_d == timezone.localdate(),
                    'focus_minutes': metrics['focus_minutes'],
                    'gap_minutes': metrics['opportunity_minutes'],
                    'opportunity_minutes': metrics['opportunity_minutes'],
                    'span_minutes': metrics['span_minutes'],
                    'first_start': metrics['first_start'],
                    'last_end': metrics['last_end'],
                    'session_count': len(d_sessions),
                    'logs': logs_data
                }
                
            return JsonResponse({
                'status': 'success',
                'view': 'month',
                'target_date': target_date.strftime('%Y-%m-%d'),
                'year': target_date.year,
                'month': target_date.month,
                'formatted_month': target_date.strftime('%B %Y'),
                'start_weekday': start_of_month.weekday(),
                'total_days': days_in_month,
                'active_days': active_days_count,
                'total_focus_minutes': total_focus_mins,
                'total_gap_minutes': total_gap_mins,
                'total_opportunity_minutes': total_gap_mins,
                'total_sessions': total_sessions_count,
                'days': list(daily_map.values())
            })
            
        else: # Day View
            sessions = PomodoroSession.objects.filter(
                user=request.user,
                completed=True,
                date=target_date
            ).order_by('started_at')
            
            logs_list = [build_session_log(s) for s in sessions]
            metrics = calc_day_metrics(sessions)
                
            return JsonResponse({
                'status': 'success',
                'view': 'day',
                'target_date': target_date.strftime('%Y-%m-%d'),
                'formatted_date': target_date.strftime('%A, %d %B %Y'),
                'is_today': target_date == timezone.localdate(),
                'total_focus_minutes': metrics['focus_minutes'],
                'total_gap_minutes': metrics['opportunity_minutes'],
                'total_opportunity_minutes': metrics['opportunity_minutes'],
                'total_span_minutes': metrics['span_minutes'],
                'first_session_start': metrics['first_start'],
                'last_session_end': metrics['last_end'],
                'total_sessions': len(logs_list),
                'logs': logs_list
            })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_plan(request):
    try:
        data = json.loads(request.body)
        plan = data.get('plan')
        if plan not in [choice[0] for choice in UserProfile.PLAN_CHOICES]:
            return JsonResponse({'status': 'error', 'message': 'Invalid plan choice'}, status=400)
            
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.plan = plan
        profile.save()
        
        return JsonResponse({'status': 'success', 'plan': profile.plan})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_avatar(request):
    try:
        if 'avatar' not in request.FILES:
            return JsonResponse({'status': 'error', 'message': 'No avatar file provided'}, status=400)
        
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        
        # If there's an existing avatar, delete the file if possible to keep it clean
        if profile.avatar:
            try:
                profile.avatar.delete(save=False)
            except Exception:
                pass
                
        profile.avatar = request.FILES['avatar']
        profile.save()
        
        return JsonResponse({
            'status': 'success',
            'avatar_url': profile.get_avatar_url
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_todo_title(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        new_title = data.get('title', '').strip()
        if not new_title:
            return JsonResponse({'status': 'error', 'message': 'Title cannot be empty'}, status=400)

        todo = Todo.objects.get(id=todo_id, user=request.user)
        todo.title = new_title
        todo.save()
        return JsonResponse({'status': 'success', 'title': todo.title})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Task not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


# ========== PROJECT CRUD API ==========

@require_POST
@api_login_required
def add_project(request):
    try:
        data = json.loads(request.body)
        name = data.get('name', '').strip()
        url = data.get('url', '').strip()
        description = data.get('description', '').strip()

        if not name or not url:
            return JsonResponse({'status': 'error', 'message': 'Name and URL are required'}, status=400)

        max_order = Project.objects.filter(user=request.user).count()

        project = Project.objects.create(
            user=request.user,
            name=name,
            url=url,
            description=description,
            order=max_order
        )

        return JsonResponse({
            'status': 'success',
            'project': {
                'id': project.id,
                'name': project.name,
                'url': project.url,
                'description': project.description,
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_project(request):
    try:
        data = json.loads(request.body)
        project_id = data.get('id')
        name = data.get('name', '').strip()
        url = data.get('url', '').strip()
        description = data.get('description', '').strip()

        if not name or not url:
            return JsonResponse({'status': 'error', 'message': 'Name and URL are required'}, status=400)

        project = Project.objects.get(id=project_id, user=request.user)
        project.name = name
        project.url = url
        project.description = description
        project.save()

        return JsonResponse({
            'status': 'success',
            'project': {
                'id': project.id,
                'name': project.name,
                'url': project.url,
                'description': project.description,
            }
        })
    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Project not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def delete_project(request):
    try:
        data = json.loads(request.body)
        project_id = data.get('id')

        project = Project.objects.get(id=project_id, user=request.user)
        project.delete()

        return JsonResponse({'status': 'success'})
    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Project not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@require_POST
@api_login_required
def clean_ramble(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        content = data.get('content', '').strip()

        if not content:
            return JsonResponse({'status': 'error', 'message': 'Content is empty.'}, status=400)

        # Enforce daily AI quota before spending an LLM call
        allowed, remaining = consume_ai_quota(request.user)
        if not allowed:
            return JsonResponse({
                'status': 'error',
                'message': f"You've reached today's limit of {settings.DAILY_AI_LIMIT} AI actions. It resets tomorrow.",
            }, status=429)

        # Import the service function
        from .services import clean_ramble_text
        cleaned_content = clean_ramble_text(content)

        # Save to BrainDump object
        braindump, created = BrainDump.objects.get_or_create(
            date=target_date,
            user=request.user,
            defaults={'content': cleaned_content}
        )
        if not created:
            braindump.content = cleaned_content
            braindump.save()

        return JsonResponse({
            'status': 'success',
            'content': cleaned_content
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


# ========== BIBLE MEMORY API ==========

from django.db.models import Q
from datetime import timedelta
from .models import BibleVerse

DEFAULT_VERSES = [
    {
        "reference": "2 Timothy 1:7",
        "text": "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.",
        "category": "Fear",
        "hook": "Fear is not from God. Power, love, and a sound mind are.",
        "context": "Paul encouraging Timothy to be bold in the ministry."
    },
    {
        "reference": "Isaiah 41:10",
        "text": "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.",
        "category": "Fear",
        "hook": "Five 'I will' statements of comfort from God.",
        "context": "God's promise of help and strength to Israel."
    },
    {
        "reference": "Psalm 56:3",
        "text": "What time I am afraid, I will trust in thee.",
        "category": "Fear",
        "hook": "A short, simple weapon against fear: trust.",
        "context": "A psalm of David when the Philistines took him in Gath."
    },
    {
        "reference": "Psalm 27:1",
        "text": "The Lord is my light and my salvation; whom shall I fear? the Lord is the strength of my life; of whom shall I be afraid?",
        "category": "Fear",
        "hook": "Light, salvation, strength. With these, fear is impossible.",
        "context": "David's declaration of fearless trust in God."
    },
    {
        "reference": "Psalm 95:6",
        "text": "O come, let us worship and bow down: let us kneel before the Lord our maker.",
        "category": "Worship",
        "hook": "An invitation to humble physical worship.",
        "context": "A call to praise and obedience."
    },
    {
        "reference": "John 4:24",
        "text": "God is a Spirit: and they that worship him must worship him in spirit and in truth.",
        "category": "Worship",
        "hook": "Spirit and truth: the two essential requirements of worship.",
        "context": "Jesus' conversation with the Samaritan woman at the well."
    },
    {
        "reference": "Psalm 29:2",
        "text": "Give unto the Lord the glory due unto his name; worship the Lord in the beauty of holiness.",
        "category": "Worship",
        "hook": "Give God His due glory in the beauty of holiness.",
        "context": "A psalm of David describing the powerful voice of God in the storm."
    },
    {
        "reference": "Joshua 1:9",
        "text": "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the Lord thy God is with thee whithersoever thou goest.",
        "category": "Courage",
        "hook": "God's command to Joshua: Courage is not optional, and God goes with you.",
        "context": "God commissioning Joshua to lead Israel into the Promised Land."
    },
    {
        "reference": "Psalm 31:24",
        "text": "Be of good courage, and he shall strengthen your heart, all ye that hope in the Lord.",
        "category": "Courage",
        "hook": "Courage leads to a strengthened heart for those who hope.",
        "context": "David praising God for his goodness and calling the saints to love Him."
    },
    {
        "reference": "Deuteronomy 31:6",
        "text": "Be strong and of a good courage, fear not, nor be afraid of them: for the Lord thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.",
        "category": "Courage",
        "hook": "God goes with you; He will never fail or forsake you.",
        "context": "Moses' final words of encouragement to the congregation of Israel."
    },
    {
        "reference": "Philippians 4:7",
        "text": "And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.",
        "category": "Peace",
        "hook": "God's peace transcends human logic and guards your heart.",
        "context": "Paul's exhortation to pray instead of being anxious."
    },
    {
        "reference": "Isaiah 26:3",
        "text": "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.",
        "category": "Peace",
        "hook": "Perfect peace is the result of a mind anchored on God.",
        "context": "A song of praise for God's protection and judgment."
    },
    {
        "reference": "John 14:27",
        "text": "Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.",
        "category": "Peace",
        "hook": "Jesus' legacy: His divine, unique peace that cures troubled hearts.",
        "context": "Jesus' farewell discourse to the disciples before His crucifixion."
    },
    {
        "reference": "Philippians 4:13",
        "text": "I can do all things through Christ which strengtheneth me.",
        "category": "Strength",
        "hook": "All things through Christ, our source of power.",
        "context": "Paul sharing the secret of contentment in all circumstances."
    },
    {
        "reference": "Isaiah 40:31",
        "text": "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.",
        "category": "Strength",
        "hook": "Waiting on God yields eagles' wings, endurance to run and walk.",
        "context": "Isaiah comforting the weary exiles with the greatness of God."
    }
]

def seed_user_default_verses(user):
    created_count = 0
    for v in DEFAULT_VERSES:
        if not BibleVerse.objects.filter(user=user, reference=v['reference']).exists():
            BibleVerse.objects.create(
                user=user,
                reference=v['reference'],
                text=v['text'],
                category=v['category'],
                hook=v['hook'],
                context=v['context'],
                ease_factor=2.5,
                interval_days=0,
                next_review=timezone.now(),
                mastered=False
            )
            created_count += 1
    return created_count

@api_login_required
def get_bible_verses(request):
    try:
        practice_type = request.GET.get('practice_type', 'bible')
        verses = BibleVerse.objects.filter(user=request.user, practice_type=practice_type)
        
        # Serialize verses list
        result = []
        for v in verses:
            result.append({
                'id': v.id,
                'reference': v.reference,
                'text': v.text,
                'category': v.category,
                'hook': v.hook,
                'context': v.context,
                'practice_type': v.practice_type,
                'ease_factor': v.ease_factor,
                'interval_days': v.interval_days,
                'next_review': v.next_review.isoformat(),
                'last_reviewed': v.last_reviewed.isoformat() if v.last_reviewed else None,
                'mastered': v.mastered,
                'review_count': v.review_count,
            })
            
        # Get goal
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        
        return JsonResponse({
            'status': 'success',
            'verses': result,
            'goal': profile.bible_memory_goal
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def add_bible_verse(request):
    try:
        data = json.loads(request.body)
        reference = data.get('reference', '').strip()
        text = data.get('text', '').strip()
        category = data.get('category', 'unassigned').strip()
        hook = data.get('hook', '').strip()
        context = data.get('context', '').strip()
        practice_type = data.get('practice_type', 'bible').strip()

        if not reference or not text:
            return JsonResponse({'status': 'error', 'message': 'Reference/Word and Text/Definition are required'}, status=400)

        # Normalize category
        if not category:
            category = 'unassigned'

        verse = BibleVerse.objects.create(
            user=request.user,
            reference=reference,
            text=text,
            category=category,
            hook=hook,
            context=context,
            practice_type=practice_type,
            next_review=timezone.now()
        )

        return JsonResponse({
            'status': 'success',
            'verse': {
                'id': verse.id,
                'reference': verse.reference,
                'text': verse.text,
                'category': verse.category,
                'hook': verse.hook,
                'context': verse.context,
                'practice_type': verse.practice_type,
                'mastered': verse.mastered
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_bible_verse(request):
    try:
        data = json.loads(request.body)
        verse_id = data.get('id')
        reference = data.get('reference', '').strip()
        text = data.get('text', '').strip()
        category = data.get('category', 'unassigned').strip()
        hook = data.get('hook', '').strip()
        context = data.get('context', '').strip()

        if not reference or not text:
            return JsonResponse({'status': 'error', 'message': 'Reference and text are required'}, status=400)

        verse = BibleVerse.objects.get(id=verse_id, user=request.user)
        verse.reference = reference
        verse.text = text
        verse.category = category if category else 'unassigned'
        verse.hook = hook
        verse.context = context
        verse.save()

        return JsonResponse({
            'status': 'success',
            'verse': {
                'id': verse.id,
                'reference': verse.reference,
                'text': verse.text,
                'category': verse.category,
                'hook': verse.hook,
                'context': verse.context,
                'mastered': verse.mastered
            }
        })
    except BibleVerse.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Verse not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def delete_bible_verse(request):
    try:
        data = json.loads(request.body)
        verse_id = data.get('id')
        
        verse = BibleVerse.objects.get(id=verse_id, user=request.user)
        verse.delete()
        
        return JsonResponse({'status': 'success'})
    except BibleVerse.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Verse not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def rate_bible_verse(request):
    try:
        data = json.loads(request.body)
        verse_id = data.get('id')
        rating = int(data.get('rating')) # 1 = Blank, 2 = Partial, 3 = Almost, 4 = Got it!

        if rating < 1 or rating > 4:
            return JsonResponse({'status': 'error', 'message': 'Rating must be between 1 and 4'}, status=400)

        verse = BibleVerse.objects.get(id=verse_id, user=request.user)
        
        verse.review_count += 1
        verse.last_reviewed = timezone.now()
        
        # Calculate new ease factor
        # ef_change matches the prototype formula roughly: 0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)
        ef_change = 0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)
        verse.ease_factor = max(1.3, verse.ease_factor + ef_change)
        
        # Determine next review interval in days
        if rating == 4:
            verse.mastered = True
            if verse.interval_days == 0:
                verse.interval_days = 7
            else:
                verse.interval_days = min(365, max(1, int(verse.interval_days * verse.ease_factor)))
        elif rating == 3:
            verse.mastered = False
            verse.interval_days = 3
        elif rating == 2:
            verse.mastered = False
            verse.interval_days = 1
        else: # rating == 1 (Blank)
            verse.mastered = False
            verse.interval_days = 0 # review today (added back to queue)
            
        verse.next_review = timezone.now() + timedelta(days=verse.interval_days)
        verse.save()

        return JsonResponse({
            'status': 'success',
            'verse': {
                'id': verse.id,
                'reference': verse.reference,
                'mastered': verse.mastered,
                'interval_days': verse.interval_days,
                'next_review': verse.next_review.isoformat()
            }
        })
    except BibleVerse.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Verse not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def update_bible_goal(request):
    try:
        data = json.loads(request.body)
        goal = int(data.get('goal', 1))
        
        if goal <= 0:
            return JsonResponse({'status': 'error', 'message': 'Goal must be greater than 0'}, status=400)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.bible_memory_goal = goal
        profile.save()

        return JsonResponse({'status': 'success', 'goal': profile.bible_memory_goal})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def seed_bible_verses(request):
    try:
        count = seed_user_default_verses(request.user)
        return JsonResponse({'status': 'success', 'seeded_count': count})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@require_POST
@api_login_required
def fetch_daily_vocab(request):
    try:
        from .services import fetch_vocab_words_via_search
        words = fetch_vocab_words_via_search()
        return JsonResponse({
            'status': 'success',
            'words': words
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@api_login_required
def word_of_the_day(request):
    """
    GET /api/bible-memory/word-of-the-day/
    Returns today's vocabulary word. If the user doesn't have one created today,
    auto-fetches a new word via LLM/fallback and saves it to the database.
    """
    try:
        today = timezone.localdate()
        
        # Check if we already have a word created today
        existing = BibleVerse.objects.filter(
            user=request.user,
            practice_type='english',
            created_at__date=today
        ).first()
        
        if existing:
            return JsonResponse({
                'status': 'success',
                'word': {
                    'id': existing.id,
                    'reference': existing.reference,
                    'text': existing.text,
                    'category': existing.category,
                    'hook': existing.hook,
                    'context': existing.context,
                    'mastered': existing.mastered,
                    'review_count': existing.review_count,
                    'created_at': existing.created_at.isoformat(),
                },
                'is_new': False
            })
        
        # Fetch a new word
        from .services import fetch_vocab_words_via_search
        words = fetch_vocab_words_via_search(count=1)
        
        if not words or len(words) == 0:
            return JsonResponse({'status': 'error', 'message': 'Could not fetch a word today.'}, status=500)
        
        word_data = words[0]
        
        # Check if this exact word already exists to avoid duplicates
        word_name = word_data.get('reference', '').strip()
        duplicate = BibleVerse.objects.filter(
            user=request.user,
            practice_type='english',
            reference__iexact=word_name
        ).first()
        
        if duplicate:
            # Return the existing word rather than creating a duplicate
            return JsonResponse({
                'status': 'success',
                'word': {
                    'id': duplicate.id,
                    'reference': duplicate.reference,
                    'text': duplicate.text,
                    'category': duplicate.category,
                    'hook': duplicate.hook,
                    'context': duplicate.context,
                    'mastered': duplicate.mastered,
                    'review_count': duplicate.review_count,
                    'created_at': duplicate.created_at.isoformat(),
                },
                'is_new': False
            })
        
        # Save the new word
        new_word = BibleVerse.objects.create(
            user=request.user,
            reference=word_name,
            text=word_data.get('text', ''),
            category=word_data.get('category', 'Vocabulary'),
            hook=word_data.get('hook', ''),
            context=word_data.get('context', ''),
            practice_type='english',
            next_review=timezone.now()
        )
        
        return JsonResponse({
            'status': 'success',
            'word': {
                'id': new_word.id,
                'reference': new_word.reference,
                'text': new_word.text,
                'category': new_word.category,
                'hook': new_word.hook,
                'context': new_word.context,
                'mastered': new_word.mastered,
                'review_count': new_word.review_count,
                'created_at': new_word.created_at.isoformat(),
            },
            'is_new': True
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


# ── Task Breakdown endpoints ──────────────────────────────────────────────────

from django.views.decorators.http import require_http_methods

@require_http_methods(["GET"])
@api_login_required
def get_task_breakdown(request, todo_id):
    """
    GET /api/todo/breakdown/<todo_id>/
    Fetch (or lazily create) the breakdown record for a todo.
    Returns: { status, id, what, definition, steps }
    """
    try:
        todo = Todo.objects.get(pk=todo_id, user=request.user)
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Task not found'}, status=404)

    breakdown, _ = TaskBreakdown.objects.get_or_create(todo=todo)
    return JsonResponse({
        'status': 'success',
        'id': breakdown.pk,
        'todo_id': todo.pk,
        'what': breakdown.what,
        'definition': breakdown.definition,
        'steps': breakdown.steps,
        'challenges': breakdown.challenges,
    })


@require_POST
@api_login_required
def save_task_breakdown(request):
    """
    POST /api/todo/breakdown/save/
    Payload: { id (todo id), what?, definition?, steps? }
    Updates only the fields that are present in the payload.
    Returns: { status, updated_fields }
    """
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        if not todo_id:
            return JsonResponse({'status': 'error', 'message': 'Missing todo id'}, status=400)

        todo = Todo.objects.get(pk=todo_id, user=request.user)
        breakdown, _ = TaskBreakdown.objects.get_or_create(todo=todo)

        updated = []
        for field in ('what', 'definition', 'steps', 'challenges'):
            if field in data:
                setattr(breakdown, field, data[field])
                updated.append(field)

        if updated:
            breakdown.save(update_fields=updated + ['updated_at'])

        return JsonResponse({'status': 'success', 'updated_fields': updated})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Task not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@require_POST
@api_login_required
def reorder_projects(request):
    try:
        return JsonResponse({'status': 'success'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile, Project, TaskBreakdown, AIUsage, TimeAuditLog


def auto_categorize_text(text):
    t = text.lower().strip()
    if t in ('p', 'phd') or any(kw in t for kw in ['phd', 'paper', 'thesis', 'research', 'article', 'study', 'literature', 'experiment']):
        return 'phd'
    if t in ('j', 'project', 'projects') or any(kw in t for kw in ['code', 'coding', 'debug', 'bug', 'django', 'python', 'js', 'html', 'css', 'build', 'github', 'dev', 'app', 'project']):
        return 'projects'
    if t in ('l', 'life_skills', 'lifeskills') or any(kw in t for kw in ['read', 'book', 'skill', 'learn', 'course', 'finance', 'budget', 'plan']):
        return 'life_skills'
    if t in ('s', 'spiritual') or any(kw in t for kw in ['pray', 'prayer', 'bible', 'church', 'meditat', 'god', 'worship', 'spiritual']):
        return 'spiritual'
    if t in ('c', 'cook', 'cooking') or any(kw in t for kw in ['cook', 'cooking', 'meal', 'prep', 'kitchen', 'bake', 'baking', 'recipe']):
        return 'cooking'
    if t in ('v', 'drive', 'driving') or any(kw in t for kw in ['drive', 'driving', 'car', 'commute', 'travel', 'road']):
        return 'driving'
    if t in ('d', 'distraction', 'distracted') or any(kw in t for kw in ['reel', 'reels', 'insta', 'instagram', 'youtube', 'yt', 'twitter', 'x.com', 'tiktok', 'scroll', 'scrolling', 'game', 'reddit', 'meme', 'distract']):
        return 'distracted'
    return 'other'


@require_POST
@api_login_required
def save_time_audit(request):
    """
    POST /api/time-audit/save/
    Payload: {
        "time_slot": "10:15",
        "raw_text": "debugging django view",
        "date": "2026-08-05" (optional),
        "category": "projects" (optional, auto-detected if missing/other),
        "source": "desktop" (optional)
    }
    """
    try:
        data = json.loads(request.body)
        time_slot = data.get('time_slot')
        raw_text = data.get('raw_text', '').strip()

        if not time_slot or not raw_text:
            return JsonResponse({'status': 'error', 'message': 'time_slot and raw_text are required'}, status=400)

        date_val = get_date_from_request(data)
        category = data.get('category')
        if not category or category == 'other':
            category = auto_categorize_text(raw_text)

        source = data.get('source', 'web')

        audit_entry, created = TimeAuditLog.objects.update_or_create(
            user=request.user,
            date=date_val,
            time_slot=time_slot,
            defaults={
                'raw_text': raw_text,
                'category': category,
                'source': source
            }
        )

        auto_executed = check_and_trigger_habit_protocols(request.user, raw_text, date_val)

        return JsonResponse({
            'status': 'success',
            'created': created,
            'id': audit_entry.id,
            'time_slot': audit_entry.time_slot,
            'raw_text': audit_entry.raw_text,
            'category': audit_entry.category,
            'category_display': audit_entry.get_category_display(),
            'auto_executed_protocols': auto_executed
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@require_POST
@api_login_required
def update_time_audit_category(request):
    """
    POST /api/time-audit/update-category/
    Payload: {
        "date": "2026-08-05" (optional, default today),
        "time_slot": "10:00",
        "category": "phd"
    }
    """
    try:
        data = json.loads(request.body)
        time_slot = data.get('time_slot')
        category = data.get('category')

        if not time_slot or not category:
            return JsonResponse({'status': 'error', 'message': 'time_slot and category are required'}, status=400)

        date_val = get_date_from_request(data)
        valid_cats = [c[0] for c in TimeAuditLog.CATEGORY_CHOICES]
        if category not in valid_cats:
            return JsonResponse({'status': 'error', 'message': f'Invalid category: {category}'}, status=400)

        audit_entry = TimeAuditLog.objects.get(user=request.user, date=date_val, time_slot=time_slot)
        audit_entry.category = category
        audit_entry.save()

        return JsonResponse({
            'status': 'success',
            'time_slot': audit_entry.time_slot,
            'category': audit_entry.category,
            'category_display': audit_entry.get_category_display()
        })
    except TimeAuditLog.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Audit entry not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


from django.http import HttpResponse

@api_login_required
def export_time_audit_md(request):
    """
    GET /api/time-audit/export-md/?days=7
    Generates downloadable .md file of time audit logs.
    """
    try:
        days = int(request.GET.get('days', 30))
        today = timezone.localdate()
        start_date = today - timedelta(days=days - 1)

        audits = TimeAuditLog.objects.filter(
            user=request.user, 
            date__gte=start_date, 
            date__lte=today
        ).order_by('-date', '-time_slot')

        lines = [
            f"# ⏱️ 15-Minute Time Audit Logs ({start_date.strftime('%Y-%m-%d')} to {today.strftime('%Y-%m-%d')})",
            f"*Exported on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n",
            "| Date | Time Slot | Category | Description | Source |",
            "|---|---|---|---|---|"
        ]

        for a in audits:
            lines.append(f"| {a.date} | `{a.time_slot}` | **{a.get_category_display()}** | {a.raw_text} | {a.source} |")

        md_content = "\n".join(lines)
        response = HttpResponse(md_content, content_type='text/markdown')
        response['Content-Disposition'] = f'attachment; filename="time_audit_logs_{today.strftime("%Y%m%d")}.md"'
        return response
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@api_login_required
def get_time_audit_today(request):
    """
    GET /api/time-audit/today/?date=YYYY-MM-DD
    Returns logged slots for specified date.
    """
    try:
        date_str = request.GET.get('date')
        if date_str:
            try:
                date_val = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                date_val = timezone.localdate()
        else:
            date_val = timezone.localdate()

        audits = TimeAuditLog.objects.filter(user=request.user, date=date_val)
        slots_data = {}
        for entry in audits:
            slots_data[entry.time_slot] = {
                'id': entry.id,
                'raw_text': entry.raw_text,
                'category': entry.category,
                'category_display': entry.get_category_display(),
                'time_range': format_slot_range(entry.time_slot),
                'source': entry.source
            }

        return JsonResponse({
            'status': 'success',
            'date': str(date_val),
            'count': audits.count(),
            'slots': slots_data,
            'suggested_patterns': get_slot_suggestions(request.user),
            'daily_summary': get_daily_log_summary(request.user, date_val)
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


def format_slot_range(time_slot):
    if not time_slot or ':' not in time_slot:
        return time_slot
    try:
        parts = time_slot.split(':')
        h, m = int(parts[0]), int(parts[1])
        end_m = (m + 15) % 60
        end_h = (h + 1) % 24 if end_m == 0 else h
        return f"{time_slot} - {end_h:02d}:{end_m:02d}"
    except Exception:
        return time_slot


def get_slot_suggestions(user):
    if not user or not user.is_authenticated:
        return {}
    fourteen_days_ago = timezone.localdate() - timedelta(days=14)
    recent_logs = TimeAuditLog.objects.filter(user=user, date__gte=fourteen_days_ago).values_list('time_slot', 'raw_text')
    
    slot_texts = {}
    for slot, text in recent_logs:
        if text and len(text.strip()) >= 2:
            slot_texts.setdefault(slot, []).append(text.strip())
    
    suggestions = {}
    for slot, texts in slot_texts.items():
        counts = Counter(texts)
        most_common, count = counts.most_common(1)[0]
        if count >= 2:
            suggestions[slot] = most_common
            
    return suggestions


def get_daily_log_summary(user, date_val=None):
    if not user or not user.is_authenticated:
        return ""
    if not date_val:
        date_val = timezone.localdate()
    
    today_audits = TimeAuditLog.objects.filter(user=user, date=date_val)
    if not today_audits.exists():
        return "No audit logs recorded for today yet. Start logging to see your daily pattern summary."

    past_7_days = [date_val - timedelta(days=i) for i in range(1, 8)]
    past_audits = TimeAuditLog.objects.filter(user=user, date__in=past_7_days)

    today_cat_counts = Counter(today_audits.values_list('category', flat=True))
    past_cat_counts = Counter(past_audits.values_list('category', flat=True))

    phd_diff = (today_cat_counts.get('phd', 0) * 0.25) - ((past_cat_counts.get('phd', 0) / 7.0) * 0.25)
    distracted_today = today_cat_counts.get('distracted', 0) * 0.25
    distracted_avg = (past_cat_counts.get('distracted', 0) / 7.0) * 0.25
    dist_diff = distracted_today - distracted_avg

    top_cat = today_cat_counts.most_common(1)[0][0] if today_cat_counts else 'other'
    top_cat_display = dict(TimeAuditLog.CATEGORY_CHOICES).get(top_cat, top_cat)

    if phd_diff >= 0.5:
        return f"Today you boosted PhD focus by {abs(round(phd_diff, 1))}h compared to your 7-day average."
    elif dist_diff >= 0.5:
        return f"Today distraction increased by {abs(round(dist_diff, 1))}h. Main focus was {top_cat_display}."
    elif dist_diff <= -0.5:
        return f"Great discipline today! You reduced distraction by {abs(round(abs(dist_diff), 1))}h compared to usual."
    else:
        return f"Today's routine was steady. Main focus was {top_cat_display} with {today_audits.count()} slots logged."


@api_login_required
def get_time_audit_stats(request):
    """
    GET /api/time-audit/stats/?days=3
    Returns category breakdown and distraction list for past N days.
    """
    try:
        days = int(request.GET.get('days', 3))
        today = timezone.localdate()
        start_date = today - timedelta(days=days - 1)

        audits = TimeAuditLog.objects.filter(user=request.user, date__gte=start_date, date__lte=today)
        total_blocks = audits.count()
        
        category_counts = {}
        for entry in audits:
            cat = entry.category
            category_counts[cat] = category_counts.get(cat, 0) + 1

        category_stats = []
        for cat_code, display in TimeAuditLog.CATEGORY_CHOICES:
            count = category_counts.get(cat_code, 0)
            hours = round(count * 0.25, 2)
            pct = round((count / total_blocks * 100), 1) if total_blocks > 0 else 0
            category_stats.append({
                'code': cat_code,
                'name': display,
                'blocks': count,
                'hours': hours,
                'percentage': pct
            })

        distractions = list(
            audits.filter(category='distracted')
            .values('time_slot', 'date', 'raw_text')
            .order_by('-date', '-time_slot')[:15]
        )

        return JsonResponse({
            'status': 'success',
            'days': days,
            'total_blocks': total_blocks,
            'total_hours': round(total_blocks * 0.25, 2),
            'categories': category_stats,
            'distractions': distractions
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@api_login_required
def today_summary(request):
    """
    GET /api/todo/today-summary/
    Lightweight counts for reminder notifications.
    """
    try:
        today = timezone.localdate()
        todos = Todo.objects.filter(user=request.user, date=today)
        total = todos.count()
        completed = todos.filter(is_completed=True).count()
        missed = Todo.objects.filter(user=request.user, is_completed=False, date__lt=today).count()
        return JsonResponse({
            'status': 'success',
            'total': total,
            'completed': completed,
            'pending': total - completed,
            'missed': missed,
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


def check_and_trigger_habit_protocols(user, raw_text, date_val):
    """
    Scans active HabitProtocols for the user. If raw_text matches title or any keywords,
    auto-completes the protocol for date_val and updates streak.
    """
    if not raw_text or not user or not user.is_authenticated:
        return []

    raw_lower = raw_text.lower()
    active_protocols = HabitProtocol.objects.filter(user=user, is_active=True)
    executed_list = []

    for protocol in active_protocols:
        already_logged = HabitProtocolLog.objects.filter(protocol=protocol, date=date_val).exists()
        
        kw_list = [k.strip().lower() for k in protocol.keywords.split(',') if k.strip()]
        kw_list.append(protocol.title.lower())

        is_matched = any(kw in raw_lower for kw in kw_list if len(kw) >= 2)

        if is_matched and not already_logged:
            HabitProtocolLog.objects.create(
                protocol=protocol,
                user=user,
                date=date_val,
                source='audit_log_auto'
            )
            
            prev_date = date_val - timedelta(days=1)
            if protocol.last_completed_date == prev_date:
                protocol.streak_count += 1
            elif protocol.last_completed_date != date_val:
                protocol.streak_count = 1

            protocol.last_completed_date = date_val
            protocol.save()

            executed_list.append({
                'id': protocol.id,
                'title': protocol.title,
                'streak_count': protocol.streak_count,
                'icon': protocol.icon
            })

    return executed_list


@api_login_required
def get_habit_protocols(request):
    """
    GET /api/protocols/list/
    Returns list of active habit protocols for today.
    """
    try:
        today = timezone.localdate()
        protocols = HabitProtocol.objects.filter(user=request.user, is_active=True)
        data = []
        for p in protocols:
            completed = HabitProtocolLog.objects.filter(protocol=p, date=today).exists()
            data.append({
                'id': p.id,
                'title': p.title,
                'category': p.category,
                'category_display': p.get_category_display(),
                'target_time': p.target_time,
                'frequency': p.frequency,
                'frequency_display': p.get_frequency_display(),
                'keywords': p.keywords,
                'icon': p.icon,
                'streak_count': p.streak_count,
                'is_completed_today': completed,
                'last_completed_date': str(p.last_completed_date) if p.last_completed_date else None
            })

        completed_count = sum(1 for item in data if item['is_completed_today'])
        total_count = len(data)

        return JsonResponse({
            'status': 'success',
            'protocols': data,
            'completed_count': completed_count,
            'total_count': total_count,
            'date': str(today)
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@require_POST
@api_login_required
def create_habit_protocol(request):
    """
    POST /api/protocols/create/
    Payload: { "title": "Take Isabgol", "target_time": "11:30", "frequency": "everyday", "keywords": "isabgol, fibre", "category": "life_skills", "icon": "⚡" }
    """
    try:
        data = json.loads(request.body)
        title = data.get('title', '').strip()
        if not title:
            return JsonResponse({'status': 'error', 'message': 'Title is required'}, status=400)

        target_time = data.get('target_time', '').strip()
        frequency = data.get('frequency', 'everyday')
        keywords = data.get('keywords', '').strip()
        category = data.get('category', 'life_skills')
        icon = data.get('icon', '⚡')

        protocol = HabitProtocol.objects.create(
            user=request.user,
            title=title,
            target_time=target_time,
            frequency=frequency,
            keywords=keywords,
            category=category,
            icon=icon
        )

        return JsonResponse({
            'status': 'success',
            'protocol': {
                'id': protocol.id,
                'title': protocol.title,
                'target_time': protocol.target_time,
                'frequency': protocol.frequency,
                'frequency_display': protocol.get_frequency_display(),
                'keywords': protocol.keywords,
                'icon': protocol.icon,
                'streak_count': protocol.streak_count,
                'is_completed_today': False
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@require_POST
@api_login_required
def complete_habit_protocol(request):
    """
    POST /api/protocols/complete/
    Payload: { "id": 1 }
    """
    try:
        data = json.loads(request.body)
        protocol_id = data.get('id')
        protocol = HabitProtocol.objects.get(id=protocol_id, user=request.user)
        today = timezone.localdate()

        log, created = HabitProtocolLog.objects.get_or_create(
            protocol=protocol,
            user=request.user,
            date=today,
            defaults={'source': 'manual'}
        )

        if created:
            prev_date = today - timedelta(days=1)
            if protocol.last_completed_date == prev_date:
                protocol.streak_count += 1
            elif protocol.last_completed_date != today:
                protocol.streak_count = 1

            protocol.last_completed_date = today
            protocol.save()
            completed = True
        else:
            # Un-complete protocol if toggled off today
            log.delete()
            if protocol.streak_count > 0:
                protocol.streak_count -= 1
            protocol.save()
            completed = False

        return JsonResponse({
            'status': 'success',
            'completed': completed,
            'streak_count': protocol.streak_count,
            'title': protocol.title
        })
    except HabitProtocol.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Protocol not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@require_POST
@api_login_required
def delete_habit_protocol(request):
    """
    POST /api/protocols/delete/
    Payload: { "id": 1 }
    """
    try:
        data = json.loads(request.body)
        protocol_id = data.get('id')
        protocol = HabitProtocol.objects.get(id=protocol_id, user=request.user)
        protocol.delete()
        return JsonResponse({'status': 'success', 'message': 'Protocol deleted'})
    except HabitProtocol.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Protocol not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

