from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.utils import timezone
from dashboard.models import Todo, PomodoroSession


class SummaryStatsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password123')
        self.client = Client()
        self.client.login(username='testuser', password='password123')

    def test_summary_stats(self):
        Todo.objects.create(
            title="Analytics test task",
            date=timezone.localdate(),
            is_completed=True,
            user=self.user
        )
        PomodoroSession.objects.create(
            user=self.user,
            duration_minutes=25,
            completed=True,
            date=timezone.localdate()
        )

        response = self.client.get('/analytics/api/summary/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['totals']['todos_completed'], 1)
        self.assertEqual(data['totals']['pomodoros_completed'], 1)


