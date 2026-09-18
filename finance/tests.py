from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from decimal import Decimal
from .models import Household, Transaction

User = get_user_model()


class HouseholdCashflowTests(TestCase):
    def setUp(self):
        self.client_husband = Client()
        self.husband = User.objects.create_user(username='husband', email='husband@example.com', password='password123', first_name='Rakesh')
        self.client_husband.login(username='husband', password='password123')

        self.client_wife = Client()
        self.wife = User.objects.create_user(username='wife', email='wife@example.com', password='password123', first_name='Sarah')
        self.client_wife.login(username='wife', password='password123')

    def test_dashboard_creates_household(self):
        response = self.client_husband.get(reverse('finance:dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Our Household Cashflow')
        self.assertEqual(response.context['active_workspace'], 'finance')
        self.assertTrue(Household.objects.filter(created_by=self.husband).exists())

    def test_cashflow_income_expense_and_leftover(self):
        # 1. Log Husband Salary (£3,500)
        self.client_husband.post(reverse('finance:add_transaction'), {
            'tx_type': 'income',
            'title': 'Husband Salary',
            'amount': '3500.00',
            'category': 'salary',
            'person_tag': 'Husband',
        })

        # 2. Log Groceries (£200)
        self.client_husband.post(reverse('finance:add_transaction'), {
            'tx_type': 'expense',
            'title': 'Tesco Superstore',
            'amount': '200.00',
            'category': 'groceries',
            'person_tag': 'Joint',
        })

        # 3. Log Rent (£1,000)
        self.client_husband.post(reverse('finance:add_transaction'), {
            'tx_type': 'expense',
            'title': 'Monthly Rent',
            'amount': '1000.00',
            'category': 'housing',
            'person_tag': 'Joint',
        })

        response = self.client_husband.get(reverse('finance:dashboard'))
        self.assertEqual(response.context['total_income'], Decimal('3500.00'))
        self.assertEqual(response.context['total_expense'], Decimal('1200.00'))
        # Leftover = 3500 - 1200 = 2300
        self.assertEqual(response.context['net_leftover'], Decimal('2300.00'))
        self.assertTrue(response.context['is_positive_leftover'])
        self.assertEqual(response.context['savings_rate'], 65)

    def test_invite_wife_and_share_dashboard(self):
        # Husband loads dashboard to ensure household is created
        self.client_husband.get(reverse('finance:dashboard'))
        household = Household.objects.get(created_by=self.husband)
        invite_code = household.invite_code

        # Wife joins via invite link
        join_url = reverse('finance:join_household', args=[invite_code])
        response = self.client_wife.get(join_url)
        self.assertEqual(response.status_code, 302)

        # Confirm wife is now in household members
        household.refresh_from_db()
        self.assertIn(self.wife, household.members.all())
        self.assertIn(self.husband, household.members.all())

        # Wife logs Freelance Income (£800)
        self.client_wife.post(reverse('finance:add_transaction'), {
            'tx_type': 'income',
            'title': 'Wife Freelance Design',
            'amount': '800.00',
            'category': 'freelance',
            'person_tag': 'Wife',
        })

        # Husband visits dashboard and sees wife's income!
        resp_husband = self.client_husband.get(reverse('finance:dashboard'))
        self.assertEqual(resp_husband.context['total_income'], Decimal('800.00'))
        self.assertTrue(resp_husband.context['is_partner_linked'])
        self.assertEqual(resp_husband.context['spouse'], self.wife)

    def test_delete_transaction(self):
        self.client_husband.get(reverse('finance:dashboard'))
        household = Household.objects.get(created_by=self.husband)
        tx = Transaction.objects.create(
            household=household,
            user=self.husband,
            tx_type='expense',
            title='Mistake Entry',
            amount=Decimal('50.00'),
            category='shopping'
        )

        del_resp = self.client_husband.post(reverse('finance:delete_transaction', args=[tx.id]))
        self.assertEqual(del_resp.status_code, 302)
        self.assertEqual(Transaction.objects.filter(id=tx.id).count(), 0)

    def test_update_settings(self):
        self.client_husband.get(reverse('finance:dashboard'))
        resp = self.client_husband.post(reverse('finance:update_settings'), {
            'name': 'Rakesh & Sarah Nest',
            'currency_symbol': '$',
            'monthly_savings_goal': '1500.00',
        })
        self.assertEqual(resp.status_code, 302)
        household = Household.objects.get(created_by=self.husband)
        self.assertEqual(household.name, 'Rakesh & Sarah Nest')
        self.assertEqual(household.currency_symbol, '$')
        self.assertEqual(household.monthly_savings_goal, Decimal('1500.00'))
