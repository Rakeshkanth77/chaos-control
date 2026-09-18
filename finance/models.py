from django.db import models
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
import secrets
import string


def generate_invite_code():
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(8))


class Household(models.Model):
    name = models.CharField(max_length=100, default="Our Household")
    currency_symbol = models.CharField(max_length=5, default="£")
    monthly_savings_goal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('500.00'))
    invite_code = models.CharField(max_length=16, unique=True, default=generate_invite_code)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_households')
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='households')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.members.count()} members)"

    def refresh_invite_code(self):
        self.invite_code = generate_invite_code()
        self.save(update_fields=['invite_code'])
        return self.invite_code


class Transaction(models.Model):
    TYPE_CHOICES = [
        ('income', '🟢 Money In (Earned)'),
        ('expense', '🔴 Money Out (Spent)'),
    ]

    CATEGORY_CHOICES = [
        # Income categories
        ('salary', '💼 Primary Salary'),
        ('freelance', '💻 Freelance & Side Hustle'),
        ('business', '📈 Business & Sales'),
        ('bonus', '🎁 Bonus & Gifts'),
        ('investments', '📊 Dividends & Returns'),
        ('income_other', '💰 Other Income'),

        # Expense categories
        ('groceries', '🛒 Groceries & Supermarket'),
        ('housing', '🏠 Rent / Mortgage'),
        ('utilities', '⚡ Bills & Utilities (Energy, Water, Wifi)'),
        ('dining', '🍽️ Dining Out & Takeaways'),
        ('transport', '🚗 Transport & Fuel / Commute'),
        ('shopping', '🛍️ Shopping & Clothes'),
        ('entertainment', '🍿 Fun & Subscriptions (Netflix, etc.)'),
        ('health', '💊 Health & Fitness'),
        ('kids', '👶 Kids & Family'),
        ('travel', '✈️ Holidays & Trips'),
        ('expense_other', '📦 Miscellaneous Spent'),
    ]

    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='transactions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='finance_transactions')
    tx_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='expense')
    title = models.CharField(max_length=160, help_text="What was this? e.g. Rakesh Monthly Salary, Tesco Groceries")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField(default=timezone.localdate)
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES, default='groceries')
    person_tag = models.CharField(max_length=60, default='Joint', help_text="Who was this for/from? e.g. Husband, Wife, Joint")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        sign = "+" if self.tx_type == 'income' else "-"
        return f"{self.title} ({sign}{self.household.currency_symbol}{self.amount})"
