from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from decimal import Decimal
from .models import FinanceLedger, Expense

User = get_user_model()


class FinanceTrackingTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username='tester', email='tester@example.com', password='password123')
        self.client.login(username='tester', password='password123')

    def test_dashboard_creates_ledger(self):
        response = self.client.get(reverse('finance:dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Shared Finance')
        self.assertEqual(response.context['active_workspace'], 'finance')
        self.assertTrue(FinanceLedger.objects.filter(user=self.user).exists())

    def test_add_and_calculate_balance(self):
        # 1. User pays £100 for Groceries (split 50/50 -> partner owes £50)
        self.client.post(reverse('finance:add_expense'), {
            'title': 'Costco Run',
            'amount': '100.00',
            'category': 'groceries',
            'paid_by': 'user',
            'split_type': '50_50',
        })

        # 2. Partner pays £40 for Dinner (split 50/50 -> user owes £20)
        self.client.post(reverse('finance:add_expense'), {
            'title': 'Dinner at Nando\'s',
            'amount': '40.00',
            'category': 'dining',
            'paid_by': 'partner',
            'split_type': '50_50',
        })

        response = self.client.get(reverse('finance:dashboard'))
        # Net balance: partner owes user £50 - £20 = £30
        self.assertEqual(response.context['net_balance'], Decimal('30.00'))
        self.assertEqual(response.context['month_total'], Decimal('140.00'))

    def test_settle_expenses(self):
        ledger = FinanceLedger.objects.create(user=self.user)
        Expense.objects.create(
            ledger=ledger,
            title='Utility Bill',
            amount=Decimal('80.00'),
            paid_by='user',
            split_type='50_50',
            is_settled=False
        )

        response = self.client.post(reverse('finance:settle_expenses'))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(Expense.objects.filter(ledger=ledger, is_settled=False).count(), 0)

    def test_update_ledger_settings(self):
        response = self.client.post(reverse('finance:update_ledger'), {
            'user_name': 'Rakesh',
            'partner_name': 'Sarah',
            'currency_symbol': '$',
            'monthly_budget': '3500.00',
        })
        self.assertEqual(response.status_code, 302)
        ledger = FinanceLedger.objects.get(user=self.user)
        self.assertEqual(ledger.user_name, 'Rakesh')
        self.assertEqual(ledger.partner_name, 'Sarah')
        self.assertEqual(ledger.currency_symbol, '$')
        self.assertEqual(ledger.monthly_budget, Decimal('3500.00'))
