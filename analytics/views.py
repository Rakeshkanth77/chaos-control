from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required

@login_required
def analytics_dashboard(request):
    return redirect('/profile/?tab=analytics')


