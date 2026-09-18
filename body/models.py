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

    SPLIT_CHOICES = [
        ('push', 'Push (Chest, Shoulders, Triceps)'),
        ('pull', 'Pull (Back, Biceps, Rear Delts)'),
        ('legs', 'Legs (Quads, Hamstrings, Calves)'),
        ('core', 'Core & Abs'),
        ('full', 'Full Body Strength'),
        ('other', 'Cardio / Other'),
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
    split_type = models.CharField(max_length=20, choices=SPLIT_CHOICES, default='push', help_text="Push, Pull, Legs, Core")
    title = models.CharField(max_length=120, help_text="e.g. Chest & Triceps, Heavy Squat Day")
    duration_mins = models.PositiveIntegerField(default=45, help_text="Duration in minutes")
    calories_burned = models.PositiveIntegerField(null=True, blank=True)
    intensity = models.CharField(max_length=20, choices=INTENSITY_CHOICES, default='moderate')
    notes = models.TextField(blank=True, help_text="Sets, reps, distances or notes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.date} - {self.title} ({self.duration_mins}m)"

    @property
    def total_volume_kg(self):
        """Total weight volume lifted across all logged sets."""
        return sum((s.weight_kg or 0) * (s.reps or 0) for s in self.exercise_sets.all())

    @property
    def grouped_exercises(self):
        """Groups exercise sets by exercise name in order of appearance."""
        groups = []
        seen = {}
        for s in self.exercise_sets.all():
            if s.exercise_name not in seen:
                entry = {'exercise_name': s.exercise_name, 'sets': []}
                seen[s.exercise_name] = entry
                groups.append(entry)
            seen[s.exercise_name]['sets'].append(s)
        return groups


class ExerciseSet(models.Model):
    """Hevy-style exercise set tracking (Exercise variation, Set #, kg, Reps)."""
    workout = models.ForeignKey(WorkoutLog, on_delete=models.CASCADE, related_name='exercise_sets')
    exercise_name = models.CharField(max_length=100, help_text="e.g. Barbell Bench Press, Incline DB Press")
    set_number = models.PositiveIntegerField(default=1)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, default=0.0, help_text="Weight in kg (0 for bodyweight)")
    reps = models.PositiveIntegerField(default=10, help_text="Number of completed repetitions")
    is_warmup = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['exercise_name', 'set_number', 'id']

    def __str__(self):
        return f"{self.exercise_name} - Set {self.set_number}: {self.weight_kg}kg x {self.reps} reps"


class FoodLog(models.Model):
    """NHS 12-Week inspired clean food and calorie tracker."""
    MEAL_CHOICES = [
        ('breakfast', 'Breakfast 🌅'),
        ('lunch', 'Lunch ☀️'),
        ('dinner', 'Dinner 🌙'),
        ('snack', 'Snack / Drink 🍎'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='food_logs')
    date = models.DateField(default=timezone.localdate)
    meal_type = models.CharField(max_length=20, choices=MEAL_CHOICES, default='lunch')
    food_name = models.CharField(max_length=150, help_text="e.g. Oats with banana, Chicken breast & rice")
    calories = models.PositiveIntegerField(help_text="Estimated calories in kcal")
    protein_g = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Optional protein in grams")
    is_healthy_choice = models.BooleanField(default=True, help_text="Includes veg/fruit/whole foods")
    notes = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'created_at']

    def __str__(self):
        return f"{self.date} - {self.get_meal_type_display()}: {self.food_name} ({self.calories} kcal)"

