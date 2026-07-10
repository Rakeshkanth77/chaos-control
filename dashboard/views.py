from django.shortcuts import render, redirect
from django.utils import timezone
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from datetime import datetime
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile, Project
from flashcards.models import FlashCard
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

    # Get flashcard review stats owned by request.user
    now = timezone.now()
    total_flashcards = FlashCard.objects.filter(user=request.user).count()
    due_flashcards = FlashCard.objects.filter(
        user=request.user,
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
        'profile': profile,
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
    }
    
    # Retrieve system stats for SaaS corporate metrics if user is staff
    if request.user.is_staff:
        total_users = User.objects.count()
        system_total_todos = Todo.objects.count()
        system_completed_todos = Todo.objects.filter(is_completed=True).count()
        system_completed_pomodoros = PomodoroSession.objects.filter(completed=True).count()
        
        free_plans = UserProfile.objects.filter(plan='free').count()
        pro_plans = UserProfile.objects.filter(plan='pro').count()
        ultimate_plans = UserProfile.objects.filter(plan='ultimate').count()
        
        search_query = request.GET.get('q', '')
        if search_query:
            users_list = User.objects.filter(username__icontains=search_query) | User.objects.filter(email__icontains=search_query)
        else:
            users_list = User.objects.all().order_by('-date_joined')[:50]
            
        context.update({
            'total_users': total_users,
            'system_total_todos': system_total_todos,
            'system_completed_todos': system_completed_todos,
            'system_completed_pomodoros': system_completed_pomodoros,
            'free_plans': free_plans,
            'pro_plans': pro_plans,
            'ultimate_plans': ultimate_plans,
            'users_list': users_list,
            'search_query': search_query,
        })
        
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


@user_passes_test(lambda u: u.is_staff, login_url='/')
def ops_dashboard(request):
    # Redirect to the integrated ops tab on profile, passing forward search params
    query = request.GET.urlencode()
    url = '/profile/?tab=ops'
    if query:
        url += '&' + query
    return redirect(url)
