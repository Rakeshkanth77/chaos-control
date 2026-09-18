from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages
from django.utils import timezone
from django.urls import reverse
from decimal import Decimal, InvalidOperation
from .models import Household, Transaction


def get_user_household(user):
    """Retrieve or create the user's primary household."""
    household = user.households.first()
    if not household:
        household = Household.objects.filter(created_by=user).first()
        if household:
            household.members.add(user)
        else:
            name = f"{user.first_name or user.username}'s Household"
            household = Household.objects.create(name=name, created_by=user)
            household.members.add(user)
    return household


@login_required
def finance_dashboard(request):
    user = request.user
    household = get_user_household(user)

    today = timezone.localdate()
    month_start = today.replace(day=1)

    # Current month cashflow
    month_txs = Transaction.objects.filter(
        household=household,
        date__gte=month_start
    )

    total_income = sum((t.amount for t in month_txs if t.tx_type == 'income'), Decimal('0.00'))
    total_expense = sum((t.amount for t in month_txs if t.tx_type == 'expense'), Decimal('0.00'))
    net_leftover = total_income - total_expense

    # Savings percentage calculation
    if total_income > Decimal('0.00'):
        savings_rate = max(0, int((net_leftover / total_income) * 100))
    else:
        savings_rate = 0

    # Expense breakdown by category
    expense_categories = {}
    income_categories = {}

    for t in month_txs:
        cat_name = dict(Transaction.CATEGORY_CHOICES).get(t.category, t.category)
        if t.tx_type == 'expense':
            expense_categories[cat_name] = expense_categories.get(cat_name, Decimal('0.00')) + t.amount
        else:
            income_categories[cat_name] = income_categories.get(cat_name, Decimal('0.00')) + t.amount

    # Sorting top expense categories
    sorted_expenses = sorted(expense_categories.items(), key=lambda x: x[1], reverse=True)
    top_expense_labels = [k for k, _ in sorted_expenses[:6]]
    top_expense_amounts = [float(v) for _, v in sorted_expenses[:6]]

    # Partner linking state
    members = household.members.all()
    spouse = members.exclude(id=user.id).first()
    is_partner_linked = spouse is not None

    invite_url = request.build_absolute_uri(
        reverse('finance:join_household', args=[household.invite_code])
    )

    # Recent transaction list
    recent_transactions = Transaction.objects.filter(household=household).order_by('-date', '-created_at')[:40]

    context = {
        'active_workspace': 'finance',
        'household': household,
        'today': today,
        'total_income': total_income,
        'total_expense': total_expense,
        'net_leftover': net_leftover,
        'is_positive_leftover': net_leftover >= Decimal('0.00'),
        'savings_rate': savings_rate,
        'is_partner_linked': is_partner_linked,
        'spouse': spouse,
        'members_count': members.count(),
        'invite_url': invite_url,
        'invite_code': household.invite_code,
        'recent_transactions': recent_transactions,
        'top_expense_labels': top_expense_labels,
        'top_expense_amounts': top_expense_amounts,
        'category_choices': Transaction.CATEGORY_CHOICES,
        'user_display_name': user.first_name or user.username,
    }
    return render(request, 'finance/index.html', context)


@require_POST
@login_required
def add_transaction(request):
    household = get_user_household(request.user)

    tx_type = request.POST.get('tx_type', 'expense')
    title = request.POST.get('title', '').strip()
    amount_str = request.POST.get('amount', '').strip()
    date_str = request.POST.get('date', '').strip()
    category = request.POST.get('category', 'groceries')
    person_tag = request.POST.get('person_tag', 'Joint').strip()
    notes = request.POST.get('notes', '').strip()

    if not title or not amount_str:
        messages.error(request, "Please enter what this was and the amount.")
        return redirect('finance:dashboard')

    try:
        amount = Decimal(amount_str)
        if amount <= 0:
            messages.error(request, "Amount must be greater than zero.")
            return redirect('finance:dashboard')
    except InvalidOperation:
        messages.error(request, "Please enter a valid amount.")
        return redirect('finance:dashboard')

    date = timezone.localdate()
    if date_str:
        try:
            from datetime import datetime
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            pass

    Transaction.objects.create(
        household=household,
        user=request.user,
        tx_type=tx_type,
        title=title,
        amount=amount,
        date=date,
        category=category,
        person_tag=person_tag or 'Joint',
        notes=notes
    )
    type_label = "Income" if tx_type == 'income' else "Expense"
    messages.success(request, f"Added {type_label}: {title} ({household.currency_symbol}{amount})")
    return redirect('finance:dashboard')


@require_POST
@login_required
def delete_transaction(request, tx_id):
    household = get_user_household(request.user)
    tx = get_object_or_404(Transaction, id=tx_id, household=household)
    tx.delete()
    messages.success(request, "Transaction removed.")
    return redirect('finance:dashboard')


@login_required
def join_household(request, invite_code):
    """Allow wife or spouse to join household via 1-tap link."""
    target_household = get_object_or_404(Household, invite_code=invite_code)
    
    if request.user in target_household.members.all():
        messages.info(request, f"You are already a member of {target_household.name}!")
        return redirect('finance:dashboard')

    target_household.members.add(request.user)
    messages.success(
        request,
        f"🎉 Connected! You have joined {target_household.name}. You both now share this real-time cashflow dashboard!"
    )
    return redirect('finance:dashboard')


@require_POST
@login_required
def update_household_settings(request):
    household = get_user_household(request.user)

    name = request.POST.get('name', '').strip()
    currency = request.POST.get('currency_symbol', '£').strip()
    goal_str = request.POST.get('monthly_savings_goal', '').strip()

    if name:
        household.name = name
    if currency:
        household.currency_symbol = currency
    if goal_str:
        try:
            household.monthly_savings_goal = Decimal(goal_str)
        except InvalidOperation:
            pass

    household.save()
    messages.success(request, "Household settings updated.")
    return redirect('finance:dashboard')


@require_POST
@login_required
def regenerate_invite(request):
    household = get_user_household(request.user)
    new_code = household.refresh_invite_code()
    messages.success(request, f"Generated new invite link (Code: {new_code}).")
    return redirect('finance:dashboard')
