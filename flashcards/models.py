from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta

class FlashCard(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    word = models.CharField(max_length=150)
    definition = models.TextField()
    example = models.TextField(blank=True, null=True)
    difficulty = models.IntegerField(default=3, choices=[(i, str(i)) for i in range(1, 6)])
    
    # Spaced Repetition parameters
    last_reviewed = models.DateTimeField(null=True, blank=True)
    next_review = models.DateTimeField(default=timezone.now)
    review_count = models.IntegerField(default=0)
    correct_count = models.IntegerField(default=0)
    
    # E-factor style spacing interval in days
    interval_days = models.IntegerField(default=1)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def review(self, was_correct):
        """
        Updates spaced repetition parameters based on user response.
        If correct, increase interval. If incorrect, reset interval to 1 day.
        """
        self.last_reviewed = timezone.now()
        self.review_count += 1
        
        if was_correct:
            self.correct_count += 1
            # Increase interval
            if self.interval_days == 1:
                self.interval_days = 3
            elif self.interval_days == 3:
                self.interval_days = 7
            elif self.interval_days == 7:
                self.interval_days = 14
            else:
                self.interval_days = min(self.interval_days * 2, 365) # max out at 1 year
        else:
            # Incorrect: reset interval to review sooner
            self.interval_days = 1
            
        self.next_review = timezone.now() + timedelta(days=self.interval_days)
        self.save()

    def __str__(self):
        return f"{self.word} (Reviewed {self.review_count} times)"
