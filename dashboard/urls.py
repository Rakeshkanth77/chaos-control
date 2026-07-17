from django.urls import path
from . import views
from . import api

app_name = 'dashboard'

urlpatterns = [
    path('', views.index, name='index'),
    path('profile/', views.profile_view, name='profile'),
    path('projects/', views.projects_view, name='projects'),
    path('bible-memory/', views.bible_memory_view, name='bible_memory'),
    
    # API endpoints
    path('api/braindump/save/', api.save_braindump, name='api_save_braindump'),
    path('api/braindump/generate-todos/', api.generate_todos, name='api_generate_todos'),
    path('api/braindump/clean-ramble/', api.clean_ramble, name='api_clean_ramble'),
    path('api/todo/add/', api.add_todo, name='api_add_todo'),
    path('api/todo/update-priority/', api.update_todo_priority, name='api_update_todo_priority'),
    path('api/todo/toggle/', api.toggle_todo, name='api_toggle_todo'),
    path('api/todo/today-summary/', api.today_summary, name='api_today_summary'),
    path('api/todo/delete/', api.delete_todo, name='api_delete_todo'),
    path('api/reflection/save/', api.save_reflection, name='api_save_reflection'),
    path('api/reflection/generate-suggestions/', api.generate_suggestions_view, name='api_generate_suggestions'),
    path('api/pomodoro/start/', api.start_pomodoro, name='api_start_pomodoro'),
    path('api/pomodoro/complete/', api.complete_pomodoro, name='api_complete_pomodoro'),
    path('api/pomodoro/status/', api.pomodoro_status, name='api_pomodoro_status'),
    path('api/pomodoro/save-log/', api.save_pomodoro_log, name='api_save_pomodoro_log'),
    path('api/pomodoro/cancel/', api.cancel_pomodoro, name='api_cancel_pomodoro'),
    path('api/profile/update-plan/', api.update_plan, name='api_update_plan'),
    path('api/profile/update-avatar/', api.update_avatar, name='api_update_avatar'),
    path('api/todo/update-title/', api.update_todo_title, name='api_update_todo_title'),
    path('api/todo/breakdown/<int:todo_id>/', api.get_task_breakdown, name='api_get_task_breakdown'),
    path('api/todo/breakdown/save/', api.save_task_breakdown, name='api_save_task_breakdown'),

    
    # Project API endpoints
    path('api/project/add/', api.add_project, name='api_add_project'),
    path('api/project/update/', api.update_project, name='api_update_project'),
    path('api/project/delete/', api.delete_project, name='api_delete_project'),
    path('api/project/reorder/', api.reorder_projects, name='api_reorder_projects'),
    
    # Bible Memory API endpoints
    path('api/bible-memory/get-verses/', api.get_bible_verses, name='api_get_bible_verses'),
    path('api/bible-memory/add-verse/', api.add_bible_verse, name='api_add_bible_verse'),
    path('api/bible-memory/update-verse/', api.update_bible_verse, name='api_update_bible_verse'),
    path('api/bible-memory/delete-verse/', api.delete_bible_verse, name='api_delete_bible_verse'),
    path('api/bible-memory/rate/', api.rate_bible_verse, name='api_rate_bible_verse'),
    path('api/bible-memory/update-goal/', api.update_bible_goal, name='api_update_bible_goal'),
    path('api/bible-memory/seed/', api.seed_bible_verses, name='api_seed_bible_verses'),
    path('api/bible-memory/fetch-daily-vocab/', api.fetch_daily_vocab, name='api_fetch_daily_vocab'),
    path('api/bible-memory/word-of-the-day/', api.word_of_the_day, name='api_word_of_the_day'),
]
