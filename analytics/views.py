from django.shortcuts import render

def analytics_dashboard(request):
    return render(request, 'analytics/analytics.html')
