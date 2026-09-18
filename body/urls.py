from django.urls import path
from . import views

app_name = 'body'

urlpatterns = [
    path('', views.body_dashboard, name='dashboard'),
    path('metric/save/', views.log_metric, name='log_metric'),
    path('workout/add/', views.log_workout, name='log_workout'),
    path('workout/delete/<int:workout_id>/', views.delete_workout, name='delete_workout'),
    path('food/add/', views.log_food, name='log_food'),
    path('food/delete/<int:food_id>/', views.delete_food, name='delete_food'),
]
