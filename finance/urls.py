from django.urls import path
from . import views

app_name = 'finance'

urlpatterns = [
    path('', views.finance_dashboard, name='dashboard'),
    path('expense/add/', views.add_expense, name='add_expense'),
    path('expense/delete/<int:expense_id>/', views.delete_expense, name='delete_expense'),
    path('settle/', views.settle_expenses, name='settle_expenses'),
    path('settings/update/', views.update_ledger, name='update_ledger'),
]
