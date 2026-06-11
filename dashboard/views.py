from django.shortcuts import render
from django.utils import timezone
from datetime import datetime, date
from .models import BrainDump, Todo, DailyReflection, PomodoroSession
from flashcards.models import FlashCard

def index(request):
    # Support custom date viewing (e.g. ?date=2026-06-11)
    date_str = request.GET.get('date')
    selected_date = timezone.localdate()
    if date_str:
        try:
            selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            pass

    # Get or create brain dump for selected date
    # (Since there is no auth yet, user is None. Future authentication can easily filter by user)
    braindump = BrainDump.objects.filter(date=selected_date, user=None).first()
    
    # Get todos for selected date
    todos = Todo.objects.filter(date=selected_date, user=None)
    
    # Group todos by priority
    todos_by_priority = {
        'unassigned': todos.filter(priority='unassigned'),
        'urgent_important': todos.filter(priority='urgent_important'),
        'important_not_urgent': todos.filter(priority='important_not_urgent'),
        'urgent_not_important': todos.filter(priority='urgent_not_important'),
        'neither': todos.filter(priority='neither'),
    }

    # Get reflection
    reflection = DailyReflection.objects.filter(date=selected_date, user=None).first()

    # Get pomodoro session info for selected date
    pomodoros_completed = PomodoroSession.objects.filter(
        date=selected_date, 
        completed=True,
        user=None
    ).count()

    # Get flashcard review stats
    now = timezone.now()
    total_flashcards = FlashCard.objects.filter(user=None).count()
    due_flashcards = FlashCard.objects.filter(
        user=None,
        next_review__lte=now
    ).count()

    from datetime import timedelta
    previous_date = selected_date - timedelta(days=1)
    next_date = selected_date + timedelta(days=1)

    context = {
        'selected_date': selected_date,
        'selected_date_formatted': selected_date.strftime('%Y-%m-%d'),
        'previous_date': previous_date.strftime('%Y-%m-%d'),
        'next_date': next_date.strftime('%Y-%m-%d'),
        'is_today': selected_date == timezone.localdate(),
        'braindump': braindump,
        'todos_by_priority': todos_by_priority,
        'reflection': reflection,
        'pomodoros_completed': pomodoros_completed,
        'total_flashcards': total_flashcards,
        'due_flashcards': due_flashcards,
    }
    
    return render(request, 'dashboard/index.html', context)
