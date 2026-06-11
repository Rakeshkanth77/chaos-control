from django.test import TestCase
from django.utils import timezone
from django.contrib.auth.models import User
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile
from .services import parse_brain_dump, generate_ai_reflection


class DashboardServicesTestCase(TestCase):
    def test_local_parse_brain_dump(self):
        # Test line splitting and bullet cleaning
        import unittest.mock as mock
        with mock.patch('os.getenv', return_value=None):
            dump_text = "- Buy groceries\n* Finish essay\n1. Call dentist\n  Just relax"
            todos = parse_brain_dump(dump_text)
            self.assertEqual(len(todos), 4)
            self.assertEqual(todos[0], "Buy groceries")
            self.assertEqual(todos[1], "Finish essay")
            self.assertEqual(todos[2], "Call dentist")
            self.assertEqual(todos[3], "Just relax")

    def test_local_parse_brain_dump_compound(self):
        # Test Todoist Ramble compound parsing
        import unittest.mock as mock
        with mock.patch('os.getenv', return_value=None):
            dump_text = "I have to do emails and I want to work on paper two and paper three"
            todos = parse_brain_dump(dump_text)
            self.assertEqual(len(todos), 3)
            self.assertEqual(todos[0], "Do emails")
            self.assertEqual(todos[1], "Work on paper two")
            self.assertEqual(todos[2], "Work on paper three")

    def test_local_generate_ai_reflection_fallback(self):
        # Test keyword analysis
        import unittest.mock as mock
        with mock.patch('os.getenv', return_value=None):
            notes = "Felt very distracted today by my phone. Also stayed up too late and was tired."
            mistakes, suggestions = generate_ai_reflection(notes)
            self.assertIn("digital distractions", mistakes.lower())
            self.assertIn("energy levels were low", mistakes.lower())
            self.assertIn("phone", suggestions.lower())
            self.assertIn("sleep", suggestions.lower())

class DashboardModelsTestCase(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.dump = BrainDump.objects.create(content="Test dump", date=self.today)

    def test_todo_creation(self):
        todo = Todo.objects.create(
            title="Clean room",
            source_dump=self.dump,
            priority="urgent_important",
            date=self.today
        )
        self.assertEqual(todo.title, "Clean room")
        self.assertEqual(todo.priority, "urgent_important")
        self.assertFalse(todo.is_completed)

    def test_reflection_creation(self):
        reflection = DailyReflection.objects.create(
            date=self.today,
            notes="Today was okay",
            mistakes="No mistakes",
            suggestions="No suggestions"
        )
        self.assertEqual(reflection.notes, "Today was okay")

class UserProfileSignalTestCase(TestCase):
    def test_user_profile_creation_signal(self):
        user = User.objects.create_user(username='testoperator', password='testpassword')
        # Check that profile is automatically created
        profile = UserProfile.objects.filter(user=user).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.plan, 'free')

class AuthenticationAndAccessTestCase(TestCase):
    def setUp(self):
        self.operator = User.objects.create_user(username='operator', password='password123', email='op@chaoscontrol.com')
        self.staff_user = User.objects.create_user(username='officer', password='password123', email='staff@chaoscontrol.com', is_staff=True)

    def test_anonymous_redirected_to_landing_on_index(self):
        # When logged out, index view renders landing
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'dashboard/landing.html')

    def test_authenticated_shows_dashboard(self):
        self.client.login(username='operator', password='password123')
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'dashboard/index.html')

    def test_profile_requires_login(self):
        response = self.client.get('/profile/')
        self.assertEqual(response.status_code, 302) # Redirects to login

    def test_profile_accessible_logged_in(self):
        self.client.login(username='operator', password='password123')
        response = self.client.get('/profile/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'dashboard/profile.html')

    def test_ops_dashboard_restricted_to_staff(self):
        # Anonymous redirect
        response = self.client.get('/ops/dashboard/')
        self.assertEqual(response.status_code, 302)

        # Operator redirect (not staff)
        self.client.login(username='operator', password='password123')
        response = self.client.get('/ops/dashboard/')
        self.assertEqual(response.status_code, 302)

        # Staff access allowed
        self.client.login(username='officer', password='password123')
        response = self.client.get('/ops/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'dashboard/ops_dashboard.html')

    def test_api_requires_login_json(self):
        response = self.client.post('/api/todo/add/', content_type='application/json')
        self.assertEqual(response.status_code, 401)

