from django.db import models
from django.contrib.auth.models import User

class BrainDump(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    content = models.TextField(blank=True)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Brain Dump for {self.date}"

class Todo(models.Model):
    PRIORITY_CHOICES = [
        ('unassigned', 'Unassigned'),
        ('urgent_important', 'Urgent & Important'),
        ('important_not_urgent', 'Important & Not Urgent'),
        ('urgent_not_important', 'Urgent & Not Important'),
        ('neither', 'Neither (Urgent/Important)'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=255)
    source_dump = models.ForeignKey(BrainDump, on_delete=models.SET_NULL, null=True, blank=True, related_name='todos')
    priority = models.CharField(max_length=30, choices=PRIORITY_CHOICES, default='unassigned')
    is_completed = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.title} ({self.get_priority_display()})"

class DailyReflection(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    date = models.DateField()
    notes = models.TextField(blank=True)
    mistakes = models.TextField(blank=True, help_text="Auto-extracted mistakes via LLM")
    suggestions = models.TextField(blank=True, help_text="Auto-generated suggestions via LLM")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'date') if 'user' else ('date',)

    def __str__(self):
        return f"Reflection for {self.date}"

class PomodoroSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    duration_minutes = models.IntegerField(default=25)
    completed = models.BooleanField(default=False)
    date = models.DateField()

    def __str__(self):
        status = "Completed" if self.completed else "Incomplete"
        return f"Pomodoro at {self.started_at} - {status}"
