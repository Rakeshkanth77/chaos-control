import json
from functools import wraps
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from .models import FlashCard

def api_login_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'status': 'error', 'message': 'Authentication required'}, status=401)
        return view_func(request, *args, **kwargs)
    return _wrapped_view

@require_GET
@api_login_required
def get_next_card(request):
    try:
        now = timezone.now()
        # Find due cards (next_review in the past)
        due_cards = FlashCard.objects.filter(user=request.user, next_review__lte=now)
        
        is_due = True
        card = due_cards.order_by('difficulty', 'created_at').first()
        
        # If no cards are due, look for ANY card that hasn't been reviewed much or just a random one
        if not card:
            is_due = False
            card = FlashCard.objects.filter(user=request.user).order_by('?').first()

        if not card:
            return JsonResponse({'status': 'empty', 'message': 'No flashcards found. Create some!'})

        return JsonResponse({
            'status': 'success',
            'card': {
                'id': card.id,
                'word': card.word,
                'definition': card.definition,
                'example': card.example or '',
                'difficulty': card.difficulty,
                'review_count': card.review_count,
                'is_due': is_due
            }
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def submit_answer(request):
    try:
        data = json.loads(request.body)
        card_id = data.get('id')
        was_correct = data.get('was_correct', False)

        card = FlashCard.objects.get(id=card_id, user=request.user)
        card.review(was_correct)

        # Get count of remaining due cards
        now = timezone.now()
        due_count = FlashCard.objects.filter(user=request.user, next_review__lte=now).count()

        return JsonResponse({
            'status': 'success',
            'due_count': due_count,
            'next_review': card.next_review.strftime('%Y-%m-%d %H:%M:%S')
        })
    except FlashCard.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Card not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def create_card(request):
    try:
        data = json.loads(request.body)
        word = data.get('word', '').strip()
        definition = data.get('definition', '').strip()
        example = data.get('example', '').strip()
        difficulty = int(data.get('difficulty', 3))

        if not word or not definition:
            return JsonResponse({'status': 'error', 'message': 'Word and Definition are required'}, status=400)

        card = FlashCard.objects.create(
            user=request.user,
            word=word,
            definition=definition,
            example=example if example else None,
            difficulty=difficulty
        )

        return JsonResponse({
            'status': 'success',
            'card_id': card.id,
            'word': card.word
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@csrf_exempt
@require_POST
@api_login_required
def update_card(request):
    try:
        data = json.loads(request.body)
        card_id = data.get('id')
        word = data.get('word', '').strip()
        definition = data.get('definition', '').strip()
        example = data.get('example', '').strip()

        if not word or not definition:
            return JsonResponse({'status': 'error', 'message': 'Word and Definition are required'}, status=400)

        card = FlashCard.objects.get(id=card_id, user=request.user)
        card.word = word
        card.definition = definition
        card.example = example if example else None
        card.save()

        return JsonResponse({
            'status': 'success',
            'card': {
                'id': card.id,
                'word': card.word,
                'definition': card.definition,
                'example': card.example or ''
            }
        })
    except FlashCard.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Card not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

