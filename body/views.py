from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from .models import BodyMetric, WorkoutLog


@login_required
def body_dashboard(request):
    user = request.user
    today = timezone.localdate()

    # Get or None today's metric
    today_metric = BodyMetric.objects.filter(user=user, date=today).first()
    latest_metric = BodyMetric.objects.filter(user=user, weight_kg__isnull=False).first()

    # Metrics history (last 30 days for trend)
    thirty_days_ago = today - timedelta(days=30)
    recent_metrics = BodyMetric.objects.filter(user=user, date__gte=thirty_days_ago).order_by('date')

    # Chart data (labels and weights)
    chart_labels = [m.date.strftime('%b %d') for m in recent_metrics if m.weight_kg is not None]
    chart_weights = [float(m.weight_kg) for m in recent_metrics if m.weight_kg is not None]

    # Workouts
    seven_days_ago = today - timedelta(days=7)
    recent_workouts = WorkoutLog.objects.filter(user=user).order_by('-date', '-created_at')[:15]
    week_workouts = WorkoutLog.objects.filter(user=user, date__gte=seven_days_ago)
    week_count = week_workouts.count()
    week_minutes = sum(w.duration_mins for w in week_workouts)

    context = {
        'active_workspace': 'body',
        'today': today,
        'today_metric': today_metric,
        'latest_metric': latest_metric,
        'recent_workouts': recent_workouts,
        'week_count': week_count,
        'week_minutes': week_minutes,
        'chart_labels': chart_labels,
        'chart_weights': chart_weights,
        'workout_types': WorkoutLog.WORKOUT_TYPES,
        'intensity_choices': WorkoutLog.INTENSITY_CHOICES,
    }
    return render(request, 'body/index.html', context)


@require_POST
@login_required
def log_metric(request):
    user = request.user
    today = timezone.localdate()
    metric, _ = BodyMetric.objects.get_or_create(user=user, date=today)

    weight = request.POST.get('weight_kg', '').strip()
    waist = request.POST.get('waist_cm', '').strip()
    water = request.POST.get('water_liters', '').strip()
    sleep = request.POST.get('sleep_hours', '').strip()
    energy = request.POST.get('energy_level', '').strip()
    notes = request.POST.get('notes', '').strip()

    try:
        if weight:
            metric.weight_kg = Decimal(weight)
        if waist:
            metric.waist_cm = Decimal(waist)
        if water:
            metric.water_liters = Decimal(water)
        if sleep:
            metric.sleep_hours = Decimal(sleep)
        if energy and energy.isdigit():
            metric.energy_level = int(energy)
        if notes:
            metric.notes = notes
        metric.save()
        messages.success(request, "Daily body metrics recorded successfully!")
    except (InvalidOperation, ValueError):
        messages.error(request, "Invalid number provided in body metrics.")

    return redirect('body:dashboard')


@require_POST
@login_required
def log_workout(request):
    user = request.user
    today = timezone.localdate()

    title = request.POST.get('title', '').strip() or 'Workout Session'
    workout_type = request.POST.get('workout_type', 'gym')
    duration = request.POST.get('duration_mins', '45')
    intensity = request.POST.get('intensity', 'moderate')
    calories = request.POST.get('calories_burned', '').strip()
    notes = request.POST.get('notes', '').strip()

    try:
        duration_mins = max(1, int(duration)) if duration.isdigit() else 45
        calories_num = int(calories) if (calories and calories.isdigit()) else None

        WorkoutLog.objects.create(
            user=user,
            date=today,
            workout_type=workout_type,
            title=title,
            duration_mins=duration_mins,
            calories_burned=calories_num,
            intensity=intensity,
            notes=notes
        )
        messages.success(request, f"Logged workout: {title} ({duration_mins}m)")
    except Exception as e:
        messages.error(request, f"Error logging workout: {e}")

    return redirect('body:dashboard')


@require_POST
@login_required
def delete_workout(request, workout_id):
    workout = get_object_or_404(WorkoutLog, id=workout_id, user=request.user)
    workout.delete()
    messages.success(request, "Workout deleted.")
    return redirect('body:dashboard')
