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
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.get_plan_display()} Plan"

    @property
    def get_avatar_url(self):
        if self.avatar:
            return self.avatar.url
        return self.avatar_url or '/static/images/default-avatar.png'


# Signals to automatically create UserProfile on signup and load Google avatar URL
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        profile = UserProfile.objects.create(user=instance)
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

