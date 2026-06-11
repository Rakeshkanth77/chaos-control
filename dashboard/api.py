import json
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from datetime import datetime
from .models import BrainDump, Todo, DailyReflection, PomodoroSession
from .services import parse_brain_dump, generate_ai_reflection

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

@csrf_exempt
@require_POST
def save_braindump(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        content = data.get('content', '').strip()

        braindump, created = BrainDump.objects.get_or_create(
            date=target_date,
            user=None,
            defaults={'content': content}
        )
        if not created:
            braindump.content = content
            braindump.save()

        return JsonResponse({'status': 'success', 'content': braindump.content})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def generate_todos(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)

        # Retrieve brain dump
        braindump = BrainDump.objects.filter(date=target_date, user=None).first()
        if not braindump or not braindump.content.strip():
            return JsonResponse({'status': 'error', 'message': 'Brain dump is empty.'}, status=400)

        # Run LLM or fallback parsing service
        todo_titles = parse_brain_dump(braindump.content)
        
        # Create todos in DB (avoid duplicates for same day/dump if desired, or just create them)
        created_todos = []
        # Get current order offset
        max_order = Todo.objects.filter(date=target_date, user=None).count()
        
        for i, title in enumerate(todo_titles):
            # Check if this todo title already exists for today to avoid duplicate generations
            if Todo.objects.filter(date=target_date, title=title, user=None).exists():
                continue
                
            todo = Todo.objects.create(
                user=None,
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

@csrf_exempt
@require_POST
def add_todo(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        title = data.get('title', '').strip()
        priority = data.get('priority', 'unassigned')

        if not title:
            return JsonResponse({'status': 'error', 'message': 'Title is required'}, status=400)

        max_order = Todo.objects.filter(date=target_date, user=None).count()

        todo = Todo.objects.create(
            user=None,
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

@csrf_exempt
@require_POST
def update_todo_priority(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        new_priority = data.get('priority')
        # Optional: ordered list of ids to adjust sorting order within the quadrant
        ordered_ids = data.get('ordered_ids', [])

        todo = Todo.objects.get(id=todo_id, user=None)
        
        if new_priority in dict(Todo.PRIORITY_CHOICES).keys():
            todo.priority = new_priority
            todo.save()

        # Reorder items if requested
        if ordered_ids:
            for index, tid in enumerate(ordered_ids):
                Todo.objects.filter(id=tid, user=None).update(order=index)

        return JsonResponse({'status': 'success'})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def toggle_todo(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        todo = Todo.objects.get(id=todo_id, user=None)
        todo.is_completed = not todo.is_completed
        todo.save()
        return JsonResponse({'status': 'success', 'is_completed': todo.is_completed})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def delete_todo(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        todo = Todo.objects.get(id=todo_id, user=None)
        todo.delete()
        return JsonResponse({'status': 'success'})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def save_reflection(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        notes = data.get('notes', '').strip()

        reflection, created = DailyReflection.objects.get_or_create(
            date=target_date,
            user=None,
            defaults={'notes': notes}
        )
        if not created:
            reflection.notes = notes
            reflection.save()

        return JsonResponse({'status': 'success', 'notes': reflection.notes})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def generate_suggestions_view(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)

        # Retrieve reflection notes
        reflection = DailyReflection.objects.filter(date=target_date, user=None).first()
        if not reflection or not reflection.notes.strip():
            return JsonResponse({'status': 'error', 'message': 'Daily reflection notes are empty.'}, status=400)

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

@csrf_exempt
@require_POST
def start_pomodoro(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        duration = data.get('duration_minutes', 25)

        session = PomodoroSession.objects.create(
            user=None,
            duration_minutes=duration,
            completed=False,
            date=target_date
        )

        return JsonResponse({'status': 'success', 'session_id': session.id})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def complete_pomodoro(request):
    try:
        data = json.loads(request.body)
        session_id = data.get('session_id')
        session = PomodoroSession.objects.get(id=session_id, user=None)
        session.completed = True
        session.save()
        
        # Get count for today
        count = PomodoroSession.objects.filter(date=session.date, completed=True, user=None).count()
        return JsonResponse({'status': 'success', 'count': count})
    except PomodoroSession.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Session not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
