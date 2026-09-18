from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from .models import FinanceLedger, Expense


@login_required
def finance_dashboard(request):
    user = request.user
    ledger, _ = FinanceLedger.objects.get_or_create(
        user=user,
        defaults={'user_name': request.user.first_name or 'Me', 'partner_name': 'Partner'}
    )

    today = timezone.localdate()
    current_month_start = today.replace(day=1)

    # Monthly expenses
    month_expenses = Expense.objects.filter(
        ledger=ledger,
        date__gte=current_month_start
    )
    month_total = sum(e.amount for e in month_expenses)

    # Unsettled balance calculation
    unsettled_expenses = Expense.objects.filter(ledger=ledger, is_settled=False)
    
    partner_debt_to_user = Decimal('0.00')
    user_debt_to_partner = Decimal('0.00')

    for exp in unsettled_expenses:
        if exp.paid_by == 'user':
            partner_debt_to_user += exp.partner_share
        elif exp.paid_by == 'partner':
            user_debt_to_partner += exp.user_share

    net_balance = partner_debt_to_user - user_debt_to_partner

    # Category breakdown for this month
    category_totals = {}
    for exp in month_expenses:
        cat_display = dict(Expense.CATEGORY_CHOICES).get(exp.category, exp.category)
        category_totals[cat_display] = category_totals.get(cat_display, Decimal('0.00')) + exp.amount

    category_labels = list(category_totals.keys())
    category_amounts = [float(v) for v in category_totals.values()]

    # Recent expenses
    expenses = Expense.objects.filter(ledger=ledger).order_by('-date', '-created_at')[:30]

    # Budget progress
    budget_pct = min(100, int((month_total / ledger.monthly_budget) * 100)) if ledger.monthly_budget > 0 else 0

    context = {
        'active_workspace': 'finance',
        'ledger': ledger,
        'month_total': month_total,
        'net_balance': net_balance,
        'abs_net_balance': abs(net_balance),
        'partner_debt_to_user': partner_debt_to_user,
        'user_debt_to_partner': user_debt_to_partner,
        'category_labels': category_labels,
        'category_amounts': category_amounts,
        'expenses': expenses,
        'budget_pct': budget_pct,
        'category_choices': Expense.CATEGORY_CHOICES,
        'split_choices': Expense.SPLIT_CHOICES,
        'today': today,
    }
    return render(request, 'finance/index.html', context)


@require_POST
@login_required
def add_expense(request):
    ledger, _ = FinanceLedger.objects.get_or_create(user=request.user)
    
    title = request.POST.get('title', '').strip()
    amount_str = request.POST.get('amount', '').strip()
    date_str = request.POST.get('date', '').strip()
    category = request.POST.get('category', 'groceries')
    paid_by = request.POST.get('paid_by', 'user')
    split_type = request.POST.get('split_type', '50_50')
    notes = request.POST.get('notes', '').strip()

    if not title or not amount_str:
        messages.error(request, "Please provide an expense description and amount.")
        return redirect('finance:dashboard')

    try:
        amount = Decimal(amount_str)
        if amount <= 0:
            messages.error(request, "Amount must be greater than zero.")
            return redirect('finance:dashboard')
    except InvalidOperation:
        messages.error(request, "Invalid amount format.")
        return redirect('finance:dashboard')

    date = timezone.localdate()
    if date_str:
        try:
            from datetime import datetime
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            pass

    Expense.objects.create(
        ledger=ledger,
        title=title,
        amount=amount,
        date=date,
        category=category,
        paid_by=paid_by,
        split_type=split_type,
        notes=notes
    )
    messages.success(request, f"Added expense: {title} ({ledger.currency_symbol}{amount})")
    return redirect('finance:dashboard')


@require_POST
@login_required
def delete_expense(request, expense_id):
    ledger, _ = FinanceLedger.objects.get_or_create(user=request.user)
    expense = get_object_or_404(Expense, id=expense_id, ledger=ledger)
    expense.delete()
    messages.success(request, "Expense deleted.")
    return redirect('finance:dashboard')


@require_POST
@login_required
def settle_expenses(request):
    ledger, _ = FinanceLedger.objects.get_or_create(user=request.user)
    unsettled = Expense.objects.filter(ledger=ledger, is_settled=False)
    count = unsettled.update(is_settled=True)
    messages.success(request, f"Settled {count} expenses! Balance reset to {ledger.currency_symbol}0.00.")
    return redirect('finance:dashboard')


@require_POST
@login_required
def update_ledger(request):
    ledger, _ = FinanceLedger.objects.get_or_create(user=request.user)
    
    user_name = request.POST.get('user_name', '').strip() or 'Me'
    partner_name = request.POST.get('partner_name', '').strip() or 'Partner'
    currency = request.POST.get('currency_symbol', '£').strip()
    budget_str = request.POST.get('monthly_budget', '').strip()

    ledger.user_name = user_name
    ledger.partner_name = partner_name
    ledger.currency_symbol = currency
    
    if budget_str:
        try:
            ledger.monthly_budget = Decimal(budget_str)
        except InvalidOperation:
            pass

    ledger.save()
    messages.success(request, "Finance settings updated.")
    return redirect('finance:dashboard')
