from django.urls import path
from . import views
from . import api

app_name = 'dashboard'

urlpatterns = [
    path('', views.index, name='index'),
    
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
]
