from django.urls import path
from . import views

app_name = 'finance'

urlpatterns = [
    path('', views.finance_dashboard, name='dashboard'),
    path('transaction/add/', views.add_transaction, name='add_transaction'),
    path('transaction/delete/<int:tx_id>/', views.delete_transaction, name='delete_transaction'),
    path('join/<str:invite_code>/', views.join_household, name='join_household'),
    path('settings/update/', views.update_household_settings, name='update_settings'),
    path('settings/regenerate-invite/', views.regenerate_invite, name='regenerate_invite'),
]
