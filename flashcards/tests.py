from django.test import TestCase
from django.utils import timezone
from .models import FlashCard

class FlashCardSpacedRepetitionTestCase(TestCase):
    def setUp(self):
        self.card = FlashCard.objects.create(
            word="Epiphany",
            definition="A sudden realization",
            difficulty=3
        )

    def test_initial_values(self):
        self.assertEqual(self.card.review_count, 0)
        self.assertEqual(self.card.correct_count, 0)
        self.assertEqual(self.card.interval_days, 1)

    def test_spaced_repetition_progression(self):
        # First correct review -> interval should go to 3
        self.card.review(was_correct=True)
        self.assertEqual(self.card.review_count, 1)
        self.assertEqual(self.card.correct_count, 1)
        self.assertEqual(self.card.interval_days, 3)

        # Second correct review -> interval should go to 7
        self.card.review(was_correct=True)
        self.assertEqual(self.card.interval_days, 7)

        # Third correct review -> interval should go to 14
        self.card.review(was_correct=True)
        self.assertEqual(self.card.interval_days, 14)

        # Fourth correct review -> interval should double to 28
        self.card.review(was_correct=True)
        self.assertEqual(self.card.interval_days, 28)

        # Incorrect review -> interval should reset to 1
        self.card.review(was_correct=False)
        self.assertEqual(self.card.interval_days, 1)
        self.assertEqual(self.card.review_count, 5)
        self.assertEqual(self.card.correct_count, 4)
