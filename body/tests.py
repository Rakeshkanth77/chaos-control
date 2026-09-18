from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from decimal import Decimal
from .models import BodyMetric, WorkoutLog, ExerciseSet, FoodLog

User = get_user_model()


class BodyTrackingTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username='tester', email='tester@example.com', password='password123')
        self.client.login(username='tester', password='password123')

    def test_dashboard_access(self):
        response = self.client.get(reverse('body:dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Body, Lifting &amp; Food')
        self.assertEqual(response.context['active_workspace'], 'body')

    def test_log_metric(self):
        response = self.client.post(reverse('body:log_metric'), {
            'weight_kg': '75.2',
            'waist_cm': '83.5',
            'water_liters': '2.8',
            'sleep_hours': '8.0',
            'energy_level': '4',
            'notes': 'Feeling energized',
        })
        self.assertEqual(response.status_code, 302)
        metric = BodyMetric.objects.filter(user=self.user).first()
        self.assertIsNotNone(metric)
        self.assertEqual(metric.weight_kg, Decimal('75.2'))
        self.assertEqual(metric.energy_level, 4)

    def test_hevy_workout_with_sets(self):
        response = self.client.post(reverse('body:log_workout'), {
            'title': 'Chest & Triceps Push',
            'split_type': 'push',
            'duration_mins': '55',
            'intensity': 'high',
            'exercise_name': ['Barbell Bench Press', 'Incline Dumbbell Press'],
            'set_weight': ['70.0', '28.0'],
            'set_reps': ['10', '8'],
            'notes': 'Hit bench PR',
        })
        self.assertEqual(response.status_code, 302)
        workout = WorkoutLog.objects.filter(user=self.user, title='Chest & Triceps Push').first()
        self.assertIsNotNone(workout)
        self.assertEqual(workout.split_type, 'push')
        self.assertEqual(workout.exercise_sets.count(), 2)

        # Verify volume calculation: (70 * 10) + (28 * 8) = 700 + 224 = 924 kg
        self.assertEqual(workout.total_volume_kg, Decimal('924.0'))

        # Delete workout
        del_resp = self.client.post(reverse('body:delete_workout', args=[workout.id]))
        self.assertEqual(del_resp.status_code, 302)
        self.assertEqual(WorkoutLog.objects.filter(id=workout.id).count(), 0)
        self.assertEqual(ExerciseSet.objects.filter(workout_id=workout.id).count(), 0)

    def test_nhs_food_logging_and_deletion(self):
        response = self.client.post(reverse('body:log_food'), {
            'meal_type': 'lunch',
            'food_name': 'Grilled Chicken & Brown Rice Bowl',
            'calories': '550',
            'protein_g': '42.0',
            'is_healthy_choice': 'on',
            'notes': 'High protein fuel',
        })
        self.assertEqual(response.status_code, 302)
        food = FoodLog.objects.filter(user=self.user, food_name='Grilled Chicken & Brown Rice Bowl').first()
        self.assertIsNotNone(food)
        self.assertEqual(food.calories, 550)
        self.assertEqual(food.protein_g, Decimal('42.0'))
        self.assertTrue(food.is_healthy_choice)

        # Verify on dashboard
        dash = self.client.get(reverse('body:dashboard'))
        self.assertEqual(dash.context['total_calories'], 550)
        self.assertEqual(dash.context['healthy_items_count'], 1)

        # Delete food
        del_resp = self.client.post(reverse('body:delete_food', args=[food.id]))
        self.assertEqual(del_resp.status_code, 302)
        self.assertEqual(FoodLog.objects.filter(id=food.id).count(), 0)
