from django.contrib import admin
from .models import FlashCard

@admin.register(FlashCard)
class FlashCardAdmin(admin.ModelAdmin):
    list_display = ('word', 'difficulty', 'next_review', 'review_count', 'correct_count', 'user')
    list_filter = ('difficulty', 'next_review', 'user')
    search_fields = ('word', 'definition', 'example')
