from django.db import models
from django.conf import settings
from django.utils import timezone
from decimal import Decimal


class FinanceLedger(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='finance_ledger')
    user_name = models.CharField(max_length=50, default='Me', help_text="Your display name in this ledger")
    partner_name = models.CharField(max_length=50, default='Partner', help_text="Partner / roommate display name")
    currency_symbol = models.CharField(max_length=5, default='£')
    monthly_budget = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('2000.00'))
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s Ledger ({self.user_name} & {self.partner_name})"


class Expense(models.Model):
    CATEGORY_CHOICES = [
        ('groceries', '🛒 Groceries & Food'),
        ('rent', '🏠 Rent & Housing'),
        ('utilities', '⚡ Bills & Utilities'),
        ('dining', '🍽️ Dining & Takeaway'),
        ('transport', '🚗 Transport & Fuel'),
        ('entertainment', '🍿 Leisure & Fun'),
        ('home', '🛋️ Home & Supplies'),
        ('health', '💊 Health & Pharmacy'),
        ('other', '📦 Miscellaneous'),
    ]

    PAID_BY_CHOICES = [
        ('user', 'User (Me)'),
        ('partner', 'Partner'),
    ]

    SPLIT_CHOICES = [
        ('50_50', 'Split Equally (50 / 50)'),
        ('user_full', '100% Mine (Personal)'),
        ('partner_full', '100% Partner'),
    ]

    ledger = models.ForeignKey(FinanceLedger, on_delete=models.CASCADE, related_name='expenses')
    title = models.CharField(max_length=160, help_text="e.g. Costco run, Electricity bill, Dinner")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField(default=timezone.localdate)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='groceries')
    paid_by = models.CharField(max_length=20, choices=PAID_BY_CHOICES, default='user')
    split_type = models.CharField(max_length=20, choices=SPLIT_CHOICES, default='50_50')
    notes = models.TextField(blank=True)
    is_settled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.title} - {self.ledger.currency_symbol}{self.amount}"

    @property
    def partner_share(self):
        """Amount that partner owes / covers for this expense."""
        if self.split_type == '50_50':
            return self.amount / Decimal('2.0')
        elif self.split_type == 'partner_full':
            return self.amount
        return Decimal('0.00')

    @property
    def user_share(self):
        """Amount that user owes / covers for this expense."""
        if self.split_type == '50_50':
            return self.amount / Decimal('2.0')
        elif self.split_type == 'user_full':
            return self.amount
        return Decimal('0.00')
