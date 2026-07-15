from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.utils import timezone
from dashboard.models import PomodoroSession
from datetime import timedelta

class PomodoroAnalyticsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password123')
        self.client = Client()
        self.client.login(username='testuser', password='password123')
        
    def test_get_pomodoro_analytics_empty(self):
        response = self.client.get('/analytics/api/pomodoro/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['hourly_peak'], [0] * 24)
        self.assertEqual(data['daily_peak'], [0] * 7)
        self.assertEqual(data['word_cloud'], [])
        
    def test_get_pomodoro_analytics_with_data(self):
        # Create a completed session with focus log text
        session = PomodoroSession.objects.create(
            user=self.user,
            duration_minutes=25,
            completed=True,
            date=timezone.localdate(),
            focus_log="Drafted models, ran migrations, and tested database logic."
        )
        
        response = self.client.get('/analytics/api/pomodoro/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        
        # Verify word frequencies
        word_cloud = data['word_cloud']
        words = [w['text'] for w in word_cloud]
        self.assertIn('models', words)
        self.assertIn('migrations', words)
        self.assertIn('database', words)
        self.assertIn('logic', words)
        # Should filter out common stop words
        self.assertNotIn('and', words)
        self.assertNotIn('ran', words)
