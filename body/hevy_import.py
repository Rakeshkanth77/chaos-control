import csv
import io
from datetime import datetime
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from .models import WorkoutLog, ExerciseSet


def determine_split_type(title, exercises):
    title_lower = title.lower()
    if 'pull' in title_lower:
        return 'pull'
    elif 'push' in title_lower:
        return 'push'
    elif 'leg' in title_lower or 'squat' in title_lower:
        return 'legs'
    elif 'core' in title_lower or 'ab' in title_lower:
        return 'core'
    
    # Check exercises
    all_ex = ' '.join(exercises).lower()
    if any(k in all_ex for k in ['bench', 'shoulder press', 'incline', 'tricep', 'pec deck', 'lateral raise']):
        return 'push'
    if any(k in all_ex for k in ['pulldown', 'row', 'curl', 'deadlift', 'face pull', 'shrug']):
        return 'pull'
    if any(k in all_ex for k in ['leg press', 'leg curl', 'leg extension', 'calf', 'squat', 'lunge']):
        return 'legs'
    return 'full'


def parse_and_import_hevy_csv(csv_content, user):
    """
    Parses a Hevy workout export CSV and creates/updates WorkoutLog and ExerciseSet instances.
    Returns a dict with summary stats (workouts_created, sets_created).
    """
    if isinstance(csv_content, bytes):
        csv_content = csv_content.decode('utf-8-sig', errors='replace')
    elif not isinstance(csv_content, str):
        csv_content = str(csv_content)

    reader = csv.DictReader(io.StringIO(csv_content))
    
    # Group rows by workout session key: (start_time, title)
    sessions = {}
    
    for row in reader:
        start_time_str = (row.get('start_time') or '').strip()
        if not start_time_str:
            continue
            
        title = (row.get('title') or 'Workout').strip()
        session_key = (start_time_str, title)
        
        if session_key not in sessions:
            sessions[session_key] = {
                'title': title,
                'start_time_str': start_time_str,
                'end_time_str': (row.get('end_time') or '').strip(),
                'description': (row.get('description') or '').strip(),
                'rows': []
            }
        sessions[session_key]['rows'].append(row)

    workouts_created = 0
    sets_created = 0

    # Date parsing formats
    date_formats = [
        '%b %d, %Y, %I:%M %p',
        '%b %d, %Y, %H:%M',
        '%Y-%m-%d %H:%M:%S',
        '%d/%m/%Y %H:%M',
    ]

    def parse_dt(s):
        if not s:
            return None
        for fmt in date_formats:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
        return None

    for (start_time_str, title), session in sessions.items():
        start_dt = parse_dt(start_time_str)
        if not start_dt:
            continue
            
        end_dt = parse_dt(session['end_time_str'])
        workout_date = start_dt.date()
        
        duration_mins = 45
        if end_dt and end_dt > start_dt:
            duration_mins = max(1, int((end_dt - start_dt).total_seconds() / 60))

        exercise_names = [r.get('exercise_title', '').strip() for r in session['rows'] if r.get('exercise_title')]
        split = determine_split_type(title, exercise_names)

        # Collect any special cardio / warmup notes
        special_notes = []
        for r in session['rows']:
            ex_t = (r.get('exercise_title') or '').strip()
            dist = (r.get('distance_km') or '').strip()
            dur_s = (r.get('duration_seconds') or '').strip()
            if ex_t.lower() in ['warm up', 'walking', 'running', 'cardio']:
                dur_txt = f"{int(dur_s)//60}m {int(dur_s)%60}s" if dur_s and dur_s.isdigit() else ""
                dist_txt = f"{dist}km" if dist else ""
                info = ' '.join(filter(None, [dist_txt, dur_txt]))
                if info:
                    special_notes.append(f"{ex_t} ({info})")

        combined_notes = session['description']
        if special_notes:
            extra = ', '.join(special_notes)
            combined_notes = f"{combined_notes} • {extra}" if combined_notes else extra

        # Check if identical workout already exists on that date
        workout, created = WorkoutLog.objects.get_or_create(
            user=user,
            date=workout_date,
            title=title,
            defaults={
                'workout_type': 'gym',
                'split_type': split,
                'duration_mins': duration_mins,
                'intensity': 'moderate',
                'notes': combined_notes
            }
        )
        if created:
            workouts_created += 1
        else:
            # Update fields if needed
            workout.split_type = split
            workout.duration_mins = duration_mins
            if combined_notes and not workout.notes:
                workout.notes = combined_notes
            workout.save()

        # Delete existing sets if re-importing to prevent duplicates
        if not created:
            workout.exercise_sets.all().delete()

        # Create sets
        set_counter = {}
        for r in session['rows']:
            ex_title = (r.get('exercise_title') or '').strip()
            if not ex_title or ex_title.lower() in ['warm up']:
                continue

            # Weight and reps
            wt_str = (r.get('weight_kg') or '').strip()
            rep_str = (r.get('reps') or '').strip()
            set_type = (r.get('set_type') or 'normal').strip().lower()

            if not wt_str and not rep_str:
                # E.g. purely duration or distance based row without weights
                continue

            try:
                wt_val = Decimal(wt_str) if wt_str else Decimal('0.00')
            except (InvalidOperation, ValueError):
                wt_val = Decimal('0.00')

            try:
                reps_val = int(rep_str) if rep_str else 0
            except ValueError:
                reps_val = 0

            set_counter[ex_title] = set_counter.get(ex_title, 0) + 1
            set_num = set_counter[ex_title]

            ExerciseSet.objects.create(
                workout=workout,
                exercise_name=ex_title,
                set_number=set_num,
                weight_kg=wt_val,
                reps=reps_val,
                is_warmup=(set_type == 'warmup')
            )
            sets_created += 1

    return {
        'status': 'success',
        'workouts_count': len(sessions),
        'workouts_created': workouts_created,
        'sets_created': sets_created
    }
