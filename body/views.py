from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages
from django.utils import timezone
from django.db.models import Max, Count
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from .models import BodyMetric, WorkoutLog, ExerciseSet, FoodLog
from .hevy_import import parse_and_import_hevy_csv


DEFAULT_DAILY_CALORIE_TARGET = 2000

COMMON_EXERCISES = {
    'push': [
        'Barbell Bench Press',
        'Incline Dumbbell Press',
        'Overhead Shoulder Press',
        'Dips / Chest Dips',
        'Cable Chest Fly',
        'Lateral Raises',
        'Tricep Rope Pushdown',
        'Skull Crushers',
    ],
    'pull': [
        'Barbell Deadlift',
        'Lat Pulldown',
        'Pull-Ups / Chin-Ups',
        'Barbell Bent-Over Row',
        'Seated Cable Row',
        'Face Pulls',
        'Bicep Barbell Curl',
        'Hammer Curls',
    ],
    'legs': [
        'Barbell Back Squat',
        'Leg Press',
        'Romanian Deadlift (RDL)',
        'Bulgarian Split Squat',
        'Leg Extension',
        'Lying Leg Curl',
        'Standing Calf Raises',
        'Walking Lunges',
    ],
    'core': [
        'Hanging Leg Raises',
        'Cable Woodchoppers',
        'Plank Holds',
        'Ab Wheel Rollout',
        'Russian Twists',
        'Decline Sit-Ups',
    ],
}


@login_required
def body_dashboard(request):
    user = request.user
    today = timezone.localdate()

    # Automatically load user's Hevy workout history if no workouts exist yet
    if not WorkoutLog.objects.filter(user=user).exists():
        from .hevy_default_data import DEFAULT_HEVY_CSV
        parse_and_import_hevy_csv(DEFAULT_HEVY_CSV, user)

    # 1. Vitals & Weight progression
    today_metric = BodyMetric.objects.filter(user=user, date=today).first()
    latest_metric = BodyMetric.objects.filter(user=user, weight_kg__isnull=False).first()

    thirty_days_ago = today - timedelta(days=30)
    recent_metrics = BodyMetric.objects.filter(user=user, date__gte=thirty_days_ago).order_by('date')
    chart_labels = [m.date.strftime('%b %d') for m in recent_metrics if m.weight_kg is not None]
    chart_weights = [float(m.weight_kg) for m in recent_metrics if m.weight_kg is not None]

    # 2. Workout activity & Lifting stats (Hevy History)
    seven_days_ago = today - timedelta(days=7)
    recent_workouts = (
        WorkoutLog.objects.filter(user=user)
        .prefetch_related('exercise_sets')
        .order_by('-date', '-created_at')[:60]
    )
    total_workouts_count = WorkoutLog.objects.filter(user=user).count()

    week_workouts = WorkoutLog.objects.filter(user=user, date__gte=seven_days_ago)
    week_count = week_workouts.count()
    week_minutes = sum(w.duration_mins for w in week_workouts)

    today_workouts = WorkoutLog.objects.filter(user=user, date=today).prefetch_related('exercise_sets')
    today_sets_count = sum(w.exercise_sets.count() for w in today_workouts)
    today_volume_kg = sum(w.total_volume_kg for w in today_workouts)

    # All-time volume & Personal Records (PRs)
    user_sets = ExerciseSet.objects.filter(workout__user=user)
    total_all_time_volume = sum((s.weight_kg or 0) * (s.reps or 0) for s in user_sets)

    personal_records = list(
        ExerciseSet.objects.filter(workout__user=user, is_warmup=False, weight_kg__gt=0)
        .values('exercise_name')
        .annotate(max_weight=Max('weight_kg'), total_sets=Count('id'))
        .order_by('-max_weight')
    )

    split_counts = {
        'all': total_workouts_count,
        'push': WorkoutLog.objects.filter(user=user, split_type='push').count(),
        'pull': WorkoutLog.objects.filter(user=user, split_type='pull').count(),
        'legs': WorkoutLog.objects.filter(user=user, split_type='legs').count(),
        'core': WorkoutLog.objects.filter(user=user, split_type='core').count(),
    }

    # 3. NHS-Style Food Intake & Calories
    today_foods = FoodLog.objects.filter(user=user, date=today).order_by('created_at')
    total_calories = sum(f.calories for f in today_foods)
    calorie_target = DEFAULT_DAILY_CALORIE_TARGET
    calories_left = max(0, calorie_target - total_calories)
    calories_pct = min(100, int((total_calories / calorie_target) * 100)) if calorie_target else 0
    healthy_items_count = today_foods.filter(is_healthy_choice=True).count()

    context = {
        'active_workspace': 'body',
        'today': today,
        'today_metric': today_metric,
        'latest_metric': latest_metric,
        'recent_workouts': recent_workouts,
        'total_workouts_count': total_workouts_count,
        'total_all_time_volume': total_all_time_volume,
        'personal_records': personal_records,
        'split_counts': split_counts,
        'week_count': week_count,
        'week_minutes': week_minutes,
        'today_workouts': today_workouts,
        'today_sets_count': today_sets_count,
        'today_volume_kg': today_volume_kg,
        'chart_labels': chart_labels,
        'chart_weights': chart_weights,
        'workout_types': WorkoutLog.WORKOUT_TYPES,
        'split_choices': WorkoutLog.SPLIT_CHOICES,
        'intensity_choices': WorkoutLog.INTENSITY_CHOICES,
        'common_exercises': COMMON_EXERCISES,
        # Food & Nutrition
        'today_foods': today_foods,
        'total_calories': total_calories,
        'calorie_target': calorie_target,
        'calories_left': calories_left,
        'calories_pct': calories_pct,
        'healthy_items_count': healthy_items_count,
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
        messages.success(request, "Daily vitals logged!")
    except (InvalidOperation, ValueError):
        messages.error(request, "Invalid number entered for vitals.")

    return redirect('body:dashboard')


@require_POST
@login_required
def log_workout(request):
    """Hevy-inspired weight training log: support multi-set logging for Push, Pull, Legs, Core."""
    user = request.user
    today = timezone.localdate()

    title = request.POST.get('title', '').strip() or 'Workout Session'
    split_type = request.POST.get('split_type', 'push')
    duration = request.POST.get('duration_mins', '45')
    intensity = request.POST.get('intensity', 'moderate')
    calories = request.POST.get('calories_burned', '').strip()
    notes = request.POST.get('notes', '').strip()

    try:
        duration_mins = max(1, int(duration)) if duration.isdigit() else 45
        calories_num = int(calories) if (calories and calories.isdigit()) else None

        workout = WorkoutLog.objects.create(
            user=user,
            date=today,
            workout_type='gym',
            split_type=split_type,
            title=title,
            duration_mins=duration_mins,
            calories_burned=calories_num,
            intensity=intensity,
            notes=notes
        )

        # Parse set inputs: exercise_name[], set_weight[], set_reps[]
        exercises = request.POST.getlist('exercise_name')
        weights = request.POST.getlist('set_weight')
        reps_list = request.POST.getlist('set_reps')

        created_sets = 0
        total_volume = Decimal(0)
        for i in range(len(exercises)):
            ex_name = exercises[i].strip() if i < len(exercises) else ''
            if not ex_name:
                continue

            try:
                wt_val = Decimal(weights[i].strip()) if (i < len(weights) and weights[i].strip()) else Decimal(0)
            except (InvalidOperation, ValueError):
                wt_val = Decimal(0)

            try:
                rep_val = int(reps_list[i].strip()) if (i < len(reps_list) and reps_list[i].strip().isdigit()) else 10
            except ValueError:
                rep_val = 10

            ExerciseSet.objects.create(
                workout=workout,
                exercise_name=ex_name,
                set_number=created_sets + 1,
                weight_kg=wt_val,
                reps=rep_val,
            )
            created_sets += 1
            total_volume += wt_val * rep_val

        if created_sets > 0:
            messages.success(
                request,
                f"🔥 Beast mode! Logged {workout.title} ({created_sets} sets, {int(total_volume)} kg lifted!)"
            )
        else:
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


@require_POST
@login_required
def log_food(request):
    """NHS-Style Food & Calorie intake log."""
    user = request.user
    today = timezone.localdate()

    meal_type = request.POST.get('meal_type', 'lunch')
    food_name = request.POST.get('food_name', '').strip()
    calories = request.POST.get('calories', '').strip()
    protein = request.POST.get('protein_g', '').strip()
    is_healthy = request.POST.get('is_healthy_choice') == 'on'
    notes = request.POST.get('notes', '').strip()

    if not food_name:
        messages.error(request, "Please enter what you ate.")
        return redirect('body:dashboard')

    try:
        cal_val = max(1, int(calories)) if (calories and calories.isdigit()) else 250
        prot_val = Decimal(protein) if protein else None

        FoodLog.objects.create(
            user=user,
            date=today,
            meal_type=meal_type,
            food_name=food_name,
            calories=cal_val,
            protein_g=prot_val,
            is_healthy_choice=is_healthy,
            notes=notes
        )
        messages.success(request, f"🥗 Logged {food_name} (+{cal_val} kcal). Great job fueling your body!")
    except Exception as e:
        messages.error(request, f"Error logging food: {e}")

    return redirect('body:dashboard')


@require_POST
@login_required
def delete_food(request, food_id):
    food = get_object_or_404(FoodLog, id=food_id, user=request.user)
    food.delete()
    messages.success(request, "Meal entry removed.")
    return redirect('body:dashboard')


@require_POST
@login_required
def import_hevy_csv(request):
    """Import workout sessions and sets from a Hevy export CSV file or pasted text."""
    csv_text = ''
    if 'csv_file' in request.FILES:
        uploaded_file = request.FILES['csv_file']
        try:
            csv_text = uploaded_file.read().decode('utf-8-sig', errors='replace')
        except Exception as e:
            messages.error(request, f"Could not read CSV file: {e}")
            return redirect('body:dashboard')
    elif 'csv_text' in request.POST:
        csv_text = request.POST.get('csv_text', '').strip()

    if not csv_text:
        messages.error(request, "Please select a Hevy CSV file or paste CSV content.")
        return redirect('body:dashboard')

    res = parse_and_import_hevy_csv(csv_text, request.user)
    if res.get('status') == 'success':
        messages.success(
            request,
            f"🎉 Imported {res.get('workouts_created')} workout sessions and {res.get('sets_created')} sets from Hevy!"
        )
    else:
        messages.error(request, f"Import error: {res.get('message', 'Unknown error')}")

    return redirect('body:dashboard')


@require_POST
@login_required
def sync_default_hevy(request):
    """1-tap action to load or restore all 30 Hevy workouts."""
    from .hevy_default_data import DEFAULT_HEVY_CSV
    res = parse_and_import_hevy_csv(DEFAULT_HEVY_CSV, request.user)
    if res.get('status') == 'success':
        messages.success(
            request,
            f"💪 Synced {res.get('workouts_created')} workout sessions and {res.get('sets_created')} sets from Hevy!"
        )
    else:
        messages.error(request, f"Sync error: {res.get('message')}")
    return redirect('body:dashboard')
