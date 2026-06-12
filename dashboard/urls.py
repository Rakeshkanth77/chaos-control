from django.urls import path
from . import views
from . import api

app_name = 'dashboard'

urlpatterns = [
    path('', views.index, name='index'),
    path('profile/', views.profile_view, name='profile'),
    path('ops/dashboard/', views.ops_dashboard, name='ops_dashboard'),
    
    # API endpoints
    path('api/braindump/save/', api.save_braindump, name='api_save_braindump'),
    path('api/braindump/generate-todos/', api.generate_todos, name='api_generate_todos'),
    path('api/todo/add/', api.add_todo, name='api_add_todo'),
    path('api/todo/update-priority/', api.update_todo_priority, name='api_update_todo_priority'),
    path('api/todo/toggle/', api.toggle_todo, name='api_toggle_todo'),
    path('api/todo/delete/', api.delete_todo, name='api_delete_todo'),
    path('api/reflection/save/', api.save_reflection, name='api_save_reflection'),
    path('api/reflection/generate-suggestions/', api.generate_suggestions_view, name='api_generate_suggestions'),
    path('api/pomodoro/start/', api.start_pomodoro, name='api_start_pomodoro'),
    path('api/pomodoro/complete/', api.complete_pomodoro, name='api_complete_pomodoro'),
    path('api/profile/update-plan/', api.update_plan, name='api_update_plan'),
    path('api/profile/update-avatar/', api.update_avatar, name='api_update_avatar'),
    path('api/todo/update-title/', api.update_todo_title, name='api_update_todo_title'),
]
