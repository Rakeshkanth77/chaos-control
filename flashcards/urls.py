from django.urls import path
from . import api

app_name = 'flashcards'

urlpatterns = [
    path('api/next/', api.get_next_card, name='api_get_next_card'),
    path('api/answer/', api.submit_answer, name='api_submit_answer'),
    path('api/create/', api.create_card, name='api_create_card'),
]
