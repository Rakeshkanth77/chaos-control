from django.urls import path
from . import views
from . import api

app_name = 'analytics'

urlpatterns = [
    path('', views.analytics_dashboard, name='dashboard'),
    path('api/summary/', api.get_summary_stats, name='api_summary'),
    path('api/pomodoro/', api.get_pomodoro_analytics, name='api_pomodoro'),
    path('api/capacity/', api.get_capacity_stats, name='api_capacity'),
]
