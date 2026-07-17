from django.conf import settings
from django.shortcuts import render
from django.utils import timezone
from django.contrib.auth.decorators import login_required
from datetime import datetime
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile, Project
from analytics.api import calculate_streak

def index(request):
    # 1. Unauthenticated users get the SaaS landing page
    if not request.user.is_authenticated:
        return render(request, 'dashboard/landing.html')

    # Support custom date viewing (e.g. ?date=2026-06-11)
    date_str = request.GET.get('date')
    selected_date = timezone.localdate()
    if date_str:
        try:
            selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            pass

    # Ensure profile exists (fallback signal backup)
    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    # Get or create brain dump for selected date owned by request.user
    braindump = BrainDump.objects.filter(date=selected_date, user=request.user).first()
    
    # Get todos for selected date owned by request.user
    todos = Todo.objects.filter(date=selected_date, user=request.user)
    
    # Get pending (incomplete) todos from past days owned by request.user
    pending_todos = Todo.objects.filter(
        user=request.user,
        is_completed=False,
        date__lt=selected_date
    ).order_by('-date', 'order')
    
    # Group todos by priority
    todos_by_priority = {
        'unassigned': todos.filter(priority='unassigned'),
        'urgent_important': todos.filter(priority='urgent_important'),
        'important_not_urgent': todos.filter(priority='important_not_urgent'),
        'urgent_not_important': todos.filter(priority='urgent_not_important'),
        'neither': todos.filter(priority='neither'),
    }

    # Get reflection owned by request.user
    reflection = DailyReflection.objects.filter(date=selected_date, user=request.user).first()

    # Get pomodoro session info for selected date owned by request.user
    pomodoros_completed = PomodoroSession.objects.filter(
        date=selected_date, 
        completed=True,
        user=request.user
    ).count()

    from datetime import timedelta
    previous_date = selected_date - timedelta(days=1)
    next_date = selected_date + timedelta(days=1)

    # First-run onboarding: user has never written a dump or created a task
    is_new_user = (
        not Todo.objects.filter(user=request.user).exists()
        and not BrainDump.objects.filter(user=request.user).exists()
    )

    context = {
        'selected_date': selected_date,
        'selected_date_formatted': selected_date.strftime('%Y-%m-%d'),
        'previous_date': previous_date.strftime('%Y-%m-%d'),
        'next_date': next_date.strftime('%Y-%m-%d'),
        'is_today': selected_date == timezone.localdate(),
        'braindump': braindump,
        'todos_by_priority': todos_by_priority,
        'pending_todos': pending_todos,
        'reflection': reflection,
        'pomodoros_completed': pomodoros_completed,
        'is_new_user': is_new_user,
        'profile': profile,
        'projects': Project.objects.filter(user=request.user),
    }
    
    return render(request, 'dashboard/index.html', context)


@login_required
def profile_view(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    
    # Personal metrics
    streak = calculate_streak(request.user)
    total_todos = Todo.objects.filter(user=request.user, is_completed=True).count()
    total_pomodoros = PomodoroSession.objects.filter(user=request.user, completed=True).count()
    
    context = {
        'profile': profile,
        'streak': streak,
        'total_todos': total_todos,
        'total_pomodoros': total_pomodoros,
        'plans': UserProfile.PLAN_CHOICES,
        'support_url': settings.SUPPORT_URL,
    }

    return render(request, 'dashboard/profile.html', context)


@login_required
def projects_view(request):
    projects = Project.objects.filter(user=request.user)
    context = {
        'projects': projects,
    }
    return render(request, 'dashboard/projects.html', context)


@login_required
def bible_memory_view(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    context = {
        'profile': profile,
    }
    return render(request, 'dashboard/bible_memory.html', context)
