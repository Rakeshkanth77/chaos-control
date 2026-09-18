from django.db import models
from django.conf import settings
from django.utils import timezone


class BodyMetric(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='body_metrics')
    date = models.DateField(default=timezone.localdate)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Weight in kilograms")
    body_fat_pct = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True, help_text="Body fat percentage")
    waist_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Waist circumference in cm")
    water_liters = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, help_text="Water intake in liters")
    sleep_hours = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True, help_text="Sleep in hours")
    energy_level = models.IntegerField(default=3, choices=[(i, str(i)) for i in range(1, 6)], help_text="1 (Low) to 5 (High)")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        unique_together = ('user', 'date')

    def __str__(self):
        return f"{self.user.username} - {self.date} ({self.weight_kg or '--'} kg)"


class WorkoutLog(models.Model):
    WORKOUT_TYPES = [
        ('gym', 'Strength & Weights'),
        ('cardio', 'Cardio & Running'),
        ('hiit', 'HIIT & Circuit'),
        ('calisthenics', 'Calisthenics & Bodyweight'),
        ('mobility', 'Mobility & Stretching'),
        ('sports', 'Sports & Swimming'),
        ('walk', 'Walking & Steps'),
        ('rest', 'Rest & Recovery'),
    ]

    INTENSITY_CHOICES = [
        ('low', 'Low / Recovery'),
        ('moderate', 'Moderate'),
        ('high', 'High Intensity'),
        ('max', 'Max Effort / PR'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workouts')
    date = models.DateField(default=timezone.localdate)
    workout_type = models.CharField(max_length=30, choices=WORKOUT_TYPES, default='gym')
    title = models.CharField(max_length=120, help_text="e.g. Chest & Triceps, 5k Pace Run")
    duration_mins = models.PositiveIntegerField(default=45, help_text="Duration in minutes")
    calories_burned = models.PositiveIntegerField(null=True, blank=True)
    intensity = models.CharField(max_length=20, choices=INTENSITY_CHOICES, default='moderate')
    notes = models.TextField(blank=True, help_text="Sets, reps, distances or notes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.date} - {self.title} ({self.duration_mins}m)"
