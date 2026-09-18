from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from decimal import Decimal
from .models import BodyMetric, WorkoutLog

User = get_user_model()


class BodyTrackingTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username='tester', email='tester@example.com', password='password123')
        self.client.login(username='tester', password='password123')

    def test_dashboard_access(self):
        response = self.client.get(reverse('body:dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Body &amp; Vitals')
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

    def test_log_and_delete_workout(self):
        response = self.client.post(reverse('body:log_workout'), {
            'title': 'Upper Body Push',
            'workout_type': 'gym',
            'duration_mins': '55',
            'intensity': 'high',
            'calories_burned': '450',
            'notes': 'Incline press 70kg',
        })
        self.assertEqual(response.status_code, 302)
        workout = WorkoutLog.objects.filter(user=self.user, title='Upper Body Push').first()
        self.assertIsNotNone(workout)
        self.assertEqual(workout.duration_mins, 55)

        # Delete workout
        del_resp = self.client.post(reverse('body:delete_workout', args=[workout.id]))
        self.assertEqual(del_resp.status_code, 302)
        self.assertEqual(WorkoutLog.objects.filter(id=workout.id).count(), 0)
