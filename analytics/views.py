from django.shortcuts import render
from django.contrib.auth.decorators import login_required

@login_required
def analytics_dashboard(request):
    return render(request, 'analytics/analytics.html')

