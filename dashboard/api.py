import json
from functools import wraps
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from datetime import datetime
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile, Project
from .services import parse_brain_dump, generate_ai_reflection

def get_date_from_request(data):
    """
    Helper to extract and parse date from request dictionary or default to today.
    """
    date_str = data.get('date')
    if date_str:
        try:
            return datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            pass
    return timezone.localdate()

def api_login_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'status': 'error', 'message': 'Authentication required'}, status=401)
        return view_func(request, *args, **kwargs)
    return _wrapped_view

@csrf_exempt
@require_POST
@api_login_required
def save_braindump(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        content = data.get('content', '').strip()

        braindump, created = BrainDump.objects.get_or_create(
            date=target_date,
            user=request.user,
            defaults={'content': content}
        )
        if not created:
            braindump.content = content
            braindump.save()

        return JsonResponse({'status': 'success', 'content': braindump.content})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def generate_todos(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)

        # Retrieve brain dump
        braindump = BrainDump.objects.filter(date=target_date, user=request.user).first()
        if not braindump or not braindump.content.strip():
            return JsonResponse({'status': 'error', 'message': 'Brain dump is empty.'}, status=400)

        # Run LLM or fallback parsing service
        todo_titles = parse_brain_dump(braindump.content)
        
        # Create todos in DB (avoid duplicates for same day/dump if desired, or just create them)
        created_todos = []
        # Get current order offset
        max_order = Todo.objects.filter(date=target_date, user=request.user).count()
        
        for i, title in enumerate(todo_titles):
            # Check if this todo title already exists for today to avoid duplicate generations
            if Todo.objects.filter(date=target_date, title=title, user=request.user).exists():
                continue
                
            todo = Todo.objects.create(
                user=request.user,
                title=title,
                source_dump=braindump,
                priority='unassigned',
                order=max_order + i,
                date=target_date
            )
            created_todos.append({
                'id': todo.id,
                'title': todo.title,
                'priority': todo.priority,
                'is_completed': todo.is_completed,
            })

        return JsonResponse({
            'status': 'success', 
            'todos': created_todos,
            'count': len(created_todos)
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def add_todo(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        title = data.get('title', '').strip()
        priority = data.get('priority', 'unassigned')

        if not title:
            return JsonResponse({'status': 'error', 'message': 'Title is required'}, status=400)

        max_order = Todo.objects.filter(date=target_date, user=request.user).count()

        todo = Todo.objects.create(
            user=request.user,
            title=title,
            priority=priority,
            order=max_order,
            date=target_date
        )

        return JsonResponse({
            'status': 'success',
            'todo': {
                'id': todo.id,
                'title': todo.title,
                'priority': todo.priority,
                'is_completed': todo.is_completed
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_todo_priority(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        new_priority = data.get('priority')
        # Optional: ordered list of ids to adjust sorting order within the quadrant
        ordered_ids = data.get('ordered_ids', [])

        todo = Todo.objects.get(id=todo_id, user=request.user)
        
        if new_priority in dict(Todo.PRIORITY_CHOICES).keys():
            todo.priority = new_priority
            todo.save()

        # Reorder items if requested
        if ordered_ids:
            for index, tid in enumerate(ordered_ids):
                Todo.objects.filter(id=tid, user=request.user).update(order=index)

        return JsonResponse({'status': 'success'})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def toggle_todo(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        todo = Todo.objects.get(id=todo_id, user=request.user)
        todo.is_completed = not todo.is_completed
        todo.save()
        return JsonResponse({'status': 'success', 'is_completed': todo.is_completed})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def delete_todo(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        todo = Todo.objects.get(id=todo_id, user=request.user)
        todo.delete()
        return JsonResponse({'status': 'success'})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Todo not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def save_reflection(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        notes = data.get('notes', '').strip()

        reflection, created = DailyReflection.objects.get_or_create(
            date=target_date,
            user=request.user,
            defaults={'notes': notes}
        )
        if not created:
            reflection.notes = notes
            reflection.save()

        return JsonResponse({'status': 'success', 'notes': reflection.notes})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def generate_suggestions_view(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)

        # Retrieve reflection notes
        reflection = DailyReflection.objects.filter(date=target_date, user=request.user).first()
        if not reflection or not reflection.notes.strip():
            return JsonResponse({'status': 'error', 'message': 'Daily reflection notes are empty.'}, status=400)

        # Generate mistakes & suggestions via LLM service
        mistakes, suggestions = generate_ai_reflection(reflection.notes)
        
        reflection.mistakes = mistakes
        reflection.suggestions = suggestions
        reflection.save()

        return JsonResponse({
            'status': 'success',
            'mistakes': reflection.mistakes,
            'suggestions': reflection.suggestions
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def start_pomodoro(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        duration = data.get('duration_minutes', 25)

        session = PomodoroSession.objects.create(
            user=request.user,
            duration_minutes=duration,
            completed=False,
            date=target_date
        )

        return JsonResponse({'status': 'success', 'session_id': session.id})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def complete_pomodoro(request):
    try:
        data = json.loads(request.body)
        session_id = data.get('session_id')
        session = PomodoroSession.objects.get(id=session_id, user=request.user)
        session.completed = True
        session.save()
        
        # Get count for today
        count = PomodoroSession.objects.filter(date=session.date, completed=True, user=request.user).count()
        return JsonResponse({'status': 'success', 'count': count})
    except PomodoroSession.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Session not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_plan(request):
    try:
        data = json.loads(request.body)
        plan = data.get('plan')
        if plan not in [choice[0] for choice in UserProfile.PLAN_CHOICES]:
            return JsonResponse({'status': 'error', 'message': 'Invalid plan choice'}, status=400)
            
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.plan = plan
        profile.save()
        
        return JsonResponse({'status': 'success', 'plan': profile.plan})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_avatar(request):
    try:
        if 'avatar' not in request.FILES:
            return JsonResponse({'status': 'error', 'message': 'No avatar file provided'}, status=400)
        
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        
        # If there's an existing avatar, delete the file if possible to keep it clean
        if profile.avatar:
            try:
                profile.avatar.delete(save=False)
            except Exception:
                pass
                
        profile.avatar = request.FILES['avatar']
        profile.save()
        
        return JsonResponse({
            'status': 'success',
            'avatar_url': profile.get_avatar_url
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_todo_title(request):
    try:
        data = json.loads(request.body)
        todo_id = data.get('id')
        new_title = data.get('title', '').strip()
        if not new_title:
            return JsonResponse({'status': 'error', 'message': 'Title cannot be empty'}, status=400)

        todo = Todo.objects.get(id=todo_id, user=request.user)
        todo.title = new_title
        todo.save()
        return JsonResponse({'status': 'success', 'title': todo.title})
    except Todo.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Task not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


# ========== PROJECT CRUD API ==========

@csrf_exempt
@require_POST
@api_login_required
def add_project(request):
    try:
        data = json.loads(request.body)
        name = data.get('name', '').strip()
        url = data.get('url', '').strip()
        description = data.get('description', '').strip()

        if not name or not url:
            return JsonResponse({'status': 'error', 'message': 'Name and URL are required'}, status=400)

        max_order = Project.objects.filter(user=request.user).count()

        project = Project.objects.create(
            user=request.user,
            name=name,
            url=url,
            description=description,
            order=max_order
        )

        return JsonResponse({
            'status': 'success',
            'project': {
                'id': project.id,
                'name': project.name,
                'url': project.url,
                'description': project.description,
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_project(request):
    try:
        data = json.loads(request.body)
        project_id = data.get('id')
        name = data.get('name', '').strip()
        url = data.get('url', '').strip()
        description = data.get('description', '').strip()

        if not name or not url:
            return JsonResponse({'status': 'error', 'message': 'Name and URL are required'}, status=400)

        project = Project.objects.get(id=project_id, user=request.user)
        project.name = name
        project.url = url
        project.description = description
        project.save()

        return JsonResponse({
            'status': 'success',
            'project': {
                'id': project.id,
                'name': project.name,
                'url': project.url,
                'description': project.description,
            }
        })
    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Project not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def delete_project(request):
    try:
        data = json.loads(request.body)
        project_id = data.get('id')

        project = Project.objects.get(id=project_id, user=request.user)
        project.delete()

        return JsonResponse({'status': 'success'})
    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Project not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@csrf_exempt
@require_POST
@api_login_required
def clean_ramble(request):
    try:
        data = json.loads(request.body)
        target_date = get_date_from_request(data)
        content = data.get('content', '').strip()

        if not content:
            return JsonResponse({'status': 'error', 'message': 'Content is empty.'}, status=400)

        # Import the service function
        from .services import clean_ramble_text
        cleaned_content = clean_ramble_text(content)

        # Save to BrainDump object
        braindump, created = BrainDump.objects.get_or_create(
            date=target_date,
            user=request.user,
            defaults={'content': cleaned_content}
        )
        if not created:
            braindump.content = cleaned_content
            braindump.save()

        return JsonResponse({
            'status': 'success',
            'content': cleaned_content
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


# ========== BIBLE MEMORY API ==========

from django.db.models import Q
from datetime import timedelta
from .models import BibleVerse

DEFAULT_VERSES = [
    {
        "reference": "2 Timothy 1:7",
        "text": "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.",
        "category": "Fear",
        "hook": "Fear is not from God. Power, love, and a sound mind are.",
        "context": "Paul encouraging Timothy to be bold in the ministry."
    },
    {
        "reference": "Isaiah 41:10",
        "text": "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.",
        "category": "Fear",
        "hook": "Five 'I will' statements of comfort from God.",
        "context": "God's promise of help and strength to Israel."
    },
    {
        "reference": "Psalm 56:3",
        "text": "What time I am afraid, I will trust in thee.",
        "category": "Fear",
        "hook": "A short, simple weapon against fear: trust.",
        "context": "A psalm of David when the Philistines took him in Gath."
    },
    {
        "reference": "Psalm 27:1",
        "text": "The Lord is my light and my salvation; whom shall I fear? the Lord is the strength of my life; of whom shall I be afraid?",
        "category": "Fear",
        "hook": "Light, salvation, strength. With these, fear is impossible.",
        "context": "David's declaration of fearless trust in God."
    },
    {
        "reference": "Psalm 95:6",
        "text": "O come, let us worship and bow down: let us kneel before the Lord our maker.",
        "category": "Worship",
        "hook": "An invitation to humble physical worship.",
        "context": "A call to praise and obedience."
    },
    {
        "reference": "John 4:24",
        "text": "God is a Spirit: and they that worship him must worship him in spirit and in truth.",
        "category": "Worship",
        "hook": "Spirit and truth: the two essential requirements of worship.",
        "context": "Jesus' conversation with the Samaritan woman at the well."
    },
    {
        "reference": "Psalm 29:2",
        "text": "Give unto the Lord the glory due unto his name; worship the Lord in the beauty of holiness.",
        "category": "Worship",
        "hook": "Give God His due glory in the beauty of holiness.",
        "context": "A psalm of David describing the powerful voice of God in the storm."
    },
    {
        "reference": "Joshua 1:9",
        "text": "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the Lord thy God is with thee whithersoever thou goest.",
        "category": "Courage",
        "hook": "God's command to Joshua: Courage is not optional, and God goes with you.",
        "context": "God commissioning Joshua to lead Israel into the Promised Land."
    },
    {
        "reference": "Psalm 31:24",
        "text": "Be of good courage, and he shall strengthen your heart, all ye that hope in the Lord.",
        "category": "Courage",
        "hook": "Courage leads to a strengthened heart for those who hope.",
        "context": "David praising God for his goodness and calling the saints to love Him."
    },
    {
        "reference": "Deuteronomy 31:6",
        "text": "Be strong and of a good courage, fear not, nor be afraid of them: for the Lord thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.",
        "category": "Courage",
        "hook": "God goes with you; He will never fail or forsake you.",
        "context": "Moses' final words of encouragement to the congregation of Israel."
    },
    {
        "reference": "Philippians 4:7",
        "text": "And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.",
        "category": "Peace",
        "hook": "God's peace transcends human logic and guards your heart.",
        "context": "Paul's exhortation to pray instead of being anxious."
    },
    {
        "reference": "Isaiah 26:3",
        "text": "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.",
        "category": "Peace",
        "hook": "Perfect peace is the result of a mind anchored on God.",
        "context": "A song of praise for God's protection and judgment."
    },
    {
        "reference": "John 14:27",
        "text": "Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.",
        "category": "Peace",
        "hook": "Jesus' legacy: His divine, unique peace that cures troubled hearts.",
        "context": "Jesus' farewell discourse to the disciples before His crucifixion."
    },
    {
        "reference": "Philippians 4:13",
        "text": "I can do all things through Christ which strengtheneth me.",
        "category": "Strength",
        "hook": "All things through Christ, our source of power.",
        "context": "Paul sharing the secret of contentment in all circumstances."
    },
    {
        "reference": "Isaiah 40:31",
        "text": "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.",
        "category": "Strength",
        "hook": "Waiting on God yields eagles' wings, endurance to run and walk.",
        "context": "Isaiah comforting the weary exiles with the greatness of God."
    }
]

def seed_user_default_verses(user):
    created_count = 0
    for v in DEFAULT_VERSES:
        if not BibleVerse.objects.filter(user=user, reference=v['reference']).exists():
            BibleVerse.objects.create(
                user=user,
                reference=v['reference'],
                text=v['text'],
                category=v['category'],
                hook=v['hook'],
                context=v['context'],
                ease_factor=2.5,
                interval_days=0,
                next_review=timezone.now(),
                mastered=False
            )
            created_count += 1
    return created_count

@csrf_exempt
@api_login_required
def get_bible_verses(request):
    try:
        practice_type = request.GET.get('practice_type', 'bible')
        verses = BibleVerse.objects.filter(user=request.user, practice_type=practice_type)
        
        # Serialize verses list
        result = []
        for v in verses:
            result.append({
                'id': v.id,
                'reference': v.reference,
                'text': v.text,
                'category': v.category,
                'hook': v.hook,
                'context': v.context,
                'practice_type': v.practice_type,
                'ease_factor': v.ease_factor,
                'interval_days': v.interval_days,
                'next_review': v.next_review.isoformat(),
                'last_reviewed': v.last_reviewed.isoformat() if v.last_reviewed else None,
                'mastered': v.mastered,
                'review_count': v.review_count,
            })
            
        # Get goal
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        
        return JsonResponse({
            'status': 'success',
            'verses': result,
            'goal': profile.bible_memory_goal
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def add_bible_verse(request):
    try:
        data = json.loads(request.body)
        reference = data.get('reference', '').strip()
        text = data.get('text', '').strip()
        category = data.get('category', 'unassigned').strip()
        hook = data.get('hook', '').strip()
        context = data.get('context', '').strip()
        practice_type = data.get('practice_type', 'bible').strip()

        if not reference or not text:
            return JsonResponse({'status': 'error', 'message': 'Reference/Word and Text/Definition are required'}, status=400)

        # Normalize category
        if not category:
            category = 'unassigned'

        verse = BibleVerse.objects.create(
            user=request.user,
            reference=reference,
            text=text,
            category=category,
            hook=hook,
            context=context,
            practice_type=practice_type,
            next_review=timezone.now()
        )

        return JsonResponse({
            'status': 'success',
            'verse': {
                'id': verse.id,
                'reference': verse.reference,
                'text': verse.text,
                'category': verse.category,
                'hook': verse.hook,
                'context': verse.context,
                'practice_type': verse.practice_type,
                'mastered': verse.mastered
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_bible_verse(request):
    try:
        data = json.loads(request.body)
        verse_id = data.get('id')
        reference = data.get('reference', '').strip()
        text = data.get('text', '').strip()
        category = data.get('category', 'unassigned').strip()
        hook = data.get('hook', '').strip()
        context = data.get('context', '').strip()

        if not reference or not text:
            return JsonResponse({'status': 'error', 'message': 'Reference and text are required'}, status=400)

        verse = BibleVerse.objects.get(id=verse_id, user=request.user)
        verse.reference = reference
        verse.text = text
        verse.category = category if category else 'unassigned'
        verse.hook = hook
        verse.context = context
        verse.save()

        return JsonResponse({
            'status': 'success',
            'verse': {
                'id': verse.id,
                'reference': verse.reference,
                'text': verse.text,
                'category': verse.category,
                'hook': verse.hook,
                'context': verse.context,
                'mastered': verse.mastered
            }
        })
    except BibleVerse.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Verse not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def delete_bible_verse(request):
    try:
        data = json.loads(request.body)
        verse_id = data.get('id')
        
        verse = BibleVerse.objects.get(id=verse_id, user=request.user)
        verse.delete()
        
        return JsonResponse({'status': 'success'})
    except BibleVerse.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Verse not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def rate_bible_verse(request):
    try:
        data = json.loads(request.body)
        verse_id = data.get('id')
        rating = int(data.get('rating')) # 1 = Blank, 2 = Partial, 3 = Almost, 4 = Got it!

        if rating < 1 or rating > 4:
            return JsonResponse({'status': 'error', 'message': 'Rating must be between 1 and 4'}, status=400)

        verse = BibleVerse.objects.get(id=verse_id, user=request.user)
        
        verse.review_count += 1
        verse.last_reviewed = timezone.now()
        
        # Calculate new ease factor
        # ef_change matches the prototype formula roughly: 0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)
        ef_change = 0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)
        verse.ease_factor = max(1.3, verse.ease_factor + ef_change)
        
        # Determine next review interval in days
        if rating == 4:
            verse.mastered = True
            if verse.interval_days == 0:
                verse.interval_days = 7
            else:
                verse.interval_days = min(365, max(1, int(verse.interval_days * verse.ease_factor)))
        elif rating == 3:
            verse.mastered = False
            verse.interval_days = 3
        elif rating == 2:
            verse.mastered = False
            verse.interval_days = 1
        else: # rating == 1 (Blank)
            verse.mastered = False
            verse.interval_days = 0 # review today (added back to queue)
            
        verse.next_review = timezone.now() + timedelta(days=verse.interval_days)
        verse.save()

        return JsonResponse({
            'status': 'success',
            'verse': {
                'id': verse.id,
                'reference': verse.reference,
                'mastered': verse.mastered,
                'interval_days': verse.interval_days,
                'next_review': verse.next_review.isoformat()
            }
        })
    except BibleVerse.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Verse not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_bible_goal(request):
    try:
        data = json.loads(request.body)
        goal = int(data.get('goal', 1))
        
        if goal <= 0:
            return JsonResponse({'status': 'error', 'message': 'Goal must be greater than 0'}, status=400)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.bible_memory_goal = goal
        profile.save()

        return JsonResponse({'status': 'success', 'goal': profile.bible_memory_goal})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def seed_bible_verses(request):
    try:
        count = seed_user_default_verses(request.user)
        return JsonResponse({'status': 'success', 'seeded_count': count})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def fetch_daily_vocab(request):
    try:
        from .services import fetch_vocab_words_via_search
        words = fetch_vocab_words_via_search()
        return JsonResponse({
            'status': 'success',
            'words': words
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


