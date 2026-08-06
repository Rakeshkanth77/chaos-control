from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

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
        ('stop_todo', '⛔ Stop-Do / Say No'),
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

class TaskBreakdown(models.Model):
    """Stores structured breakdown notes for a single Todo task."""
    todo = models.OneToOneField(Todo, on_delete=models.CASCADE, related_name='breakdown')
    what = models.TextField(blank=True, help_text="What is the task / context")
    definition = models.TextField(blank=True, help_text="How does task completion look like")
    steps = models.TextField(blank=True, help_text="Steps to achieve the task")
    challenges = models.TextField(blank=True, help_text="Challenges you might face")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Breakdown for Todo #{self.todo_id}: {self.todo.title}"



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
    CATEGORY_CHOICES = [
        ('phd', 'PhD Work'),
        ('other', 'Other Work'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    task = models.ForeignKey(Todo, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(default=25)
    completed = models.BooleanField(default=False)
    is_paused = models.BooleanField(default=False)
    paused_at = models.DateTimeField(null=True, blank=True)
    total_paused_seconds = models.IntegerField(default=0)
    focus_log = models.TextField(blank=True, default="")
    date = models.DateField()

    def __str__(self):
        status = "Completed" if self.completed else "Incomplete"
        return f"Pomodoro at {self.started_at} - {status}"


class TimeAuditLog(models.Model):
    CATEGORY_CHOICES = [
        ('phd', 'PhD'),
        ('projects', 'Side Projects'),
        ('life_skills', 'Life Skills'),
        ('spiritual', 'Spiritual'),
        ('cooking', 'Cooking'),
        ('driving', 'Driving'),
        ('exercise', 'Exercise'),
        ('distracted', 'Distracted'),
        ('break', 'Break'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='time_audits', null=True, blank=True)
    date = models.DateField(default=timezone.now)
    time_slot = models.CharField(max_length=5, help_text="Format HH:MM e.g. 10:15")
    raw_text = models.CharField(max_length=255, help_text="User's typed description or code")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    source = models.CharField(max_length=20, default='desktop', help_text="desktop, web, mobile")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'time_slot']
        unique_together = ('user', 'date', 'time_slot')

    def __str__(self):
        return f"{self.date} {self.time_slot} - {self.raw_text} ({self.get_category_display()})"


class HabitProtocol(models.Model):
    FREQUENCY_CHOICES = [
        ('everyday', 'Every day'),
        ('weekdays', 'Weekdays (Mon-Fri)'),
        ('weekends', 'Weekends (Sat-Sun)'),
        ('once', 'Once'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='habit_protocols')
    title = models.CharField(max_length=150, help_text="e.g., Take Isabgol, Night Reflection")
    category = models.CharField(max_length=20, choices=TimeAuditLog.CATEGORY_CHOICES, default='life_skills')
    target_time = models.CharField(max_length=5, blank=True, default='', help_text="Target slot e.g. 11:30 or 22:00")
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='everyday')
    keywords = models.CharField(max_length=255, blank=True, default='', help_text="Comma-separated keywords for auto-matching in 15-min logs e.g. isabgol, fibre")
    icon = models.CharField(max_length=10, default='⚡', help_text="Icon symbol")
    streak_count = models.IntegerField(default=0)
    last_completed_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['target_time', '-created_at']

    def __str__(self):
        return f"{self.title} ({self.user.username}) - Streak: {self.streak_count}d"

    def is_completed_today(self):
        if not self.last_completed_date:
            return False
        return self.last_completed_date == timezone.now().date()


class HabitProtocolLog(models.Model):
    protocol = models.ForeignKey(HabitProtocol, on_delete=models.CASCADE, related_name='logs')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField(default=timezone.now)
    completed_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=30, default='manual', help_text="manual, audit_log_auto")

    class Meta:
        unique_together = ('protocol', 'date')
        ordering = ['-date', '-completed_at']

    def __str__(self):
        return f"{self.protocol.title} logged on {self.date}"


class UserProfile(models.Model):
    PLAN_CHOICES = [
        ('free', 'Free'),
        ('pro', 'Pro'),
        ('ultimate', 'Ultimate'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    avatar_url = models.URLField(max_length=1024, null=True, blank=True)
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='free')
    bible_memory_goal = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.get_plan_display()} Plan"

    @property
    def get_avatar_url(self):
        if self.avatar:
            return self.avatar.url
        return self.avatar_url or '/static/images/default-avatar.png'


class Project(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    name = models.CharField(max_length=200)
    url = models.URLField(max_length=1024)
    description = models.TextField(blank=True, default='')
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return f"{self.name} ({self.user.username})"


class BibleVerse(models.Model):
    PRACTICE_TYPE_CHOICES = [
        ('bible', 'Bible'),
        ('english', 'English'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bible_verses')
    reference = models.CharField(max_length=200)
    text = models.TextField()
    category = models.CharField(max_length=100, default='unassigned')
    hook = models.TextField(blank=True, default='')
    context = models.TextField(blank=True, default='')
    practice_type = models.CharField(max_length=20, choices=PRACTICE_TYPE_CHOICES, default='bible')
    
    # Spaced Repetition parameters
    ease_factor = models.FloatField(default=2.5)
    interval_days = models.IntegerField(default=0) # 0 means review today/immediately
    next_review = models.DateTimeField(default=timezone.now)
    last_reviewed = models.DateTimeField(null=True, blank=True)
    mastered = models.BooleanField(default=False)
    review_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'reference']

    def __str__(self):
        return f"{self.reference} ({self.category})"


class AIUsage(models.Model):
    """Tracks per-user daily AI call counts for rate limiting."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_usage')
    date = models.DateField()
    count = models.IntegerField(default=0)

    class Meta:
        unique_together = ('user', 'date')

    def __str__(self):
        return f"{self.user.username} — {self.count} calls on {self.date}"


# Signals to automatically create UserProfile on signup and load Google avatar URL
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        profile = UserProfile.objects.create(user=instance)
        # Auto-promote owner emails to staff and superuser
        if instance.email and ('rakesh' in instance.email.lower() or instance.email == 'rakeshkanth77@gmail.com'):
            User.objects.filter(pk=instance.pk).update(is_staff=True, is_superuser=True)
        # Try fetching social account picture
        try:
            from allauth.socialaccount.models import SocialAccount
            social_account = SocialAccount.objects.filter(user=instance, provider='google').first()
            if social_account:
                picture_url = social_account.extra_data.get('picture')
                if picture_url:
                    profile.avatar_url = picture_url
                    profile.save()
        except Exception:
            pass

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    try:
        instance.profile.save()
    except UserProfile.DoesNotExist:
        # Fallback if profile doesn't exist for some reason
        UserProfile.objects.create(user=instance)

