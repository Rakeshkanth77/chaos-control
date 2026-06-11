from django.contrib import admin
from .models import BrainDump, Todo, DailyReflection, PomodoroSession

@admin.register(BrainDump)
class BrainDumpAdmin(admin.ModelAdmin):
    list_display = ('date', 'created_at', 'user')
    list_filter = ('date', 'user')
    search_fields = ('content',)

@admin.register(Todo)
class TodoAdmin(admin.ModelAdmin):
    list_display = ('title', 'priority', 'is_completed', 'date', 'order', 'user')
    list_filter = ('priority', 'is_completed', 'date', 'user')
    search_fields = ('title',)
    list_editable = ('priority', 'is_completed', 'order')

@admin.register(DailyReflection)
class DailyReflectionAdmin(admin.ModelAdmin):
    list_display = ('date', 'created_at', 'user')
    list_filter = ('date', 'user')
    search_fields = ('notes', 'mistakes', 'suggestions')

@admin.register(PomodoroSession)
class PomodoroSessionAdmin(admin.ModelAdmin):
    list_display = ('started_at', 'duration_minutes', 'completed', 'date', 'user')
    list_filter = ('completed', 'date', 'user')
