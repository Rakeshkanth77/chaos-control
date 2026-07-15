import json
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth.models import User
import unittest.mock as mock
import os
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile
from .services import parse_brain_dump, generate_ai_reflection, clean_ramble_text


class DashboardServicesTestCase(TestCase):
    @mock.patch('google.generativeai.GenerativeModel')
    def test_parse_brain_dump_gemini(self, mock_model_class):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "mock_gemini_key", "OPENAI_API_KEY": ""}):
            mock_model = mock.MagicMock()
            mock_model.generate_content.return_value = mock.MagicMock(text='["Buy groceries", "Finish essay"]')
            mock_model_class.return_value = mock_model
            
            todos = parse_brain_dump("some dump text")
            self.assertEqual(todos, ["Buy groceries", "Finish essay"])

    @mock.patch('openai.OpenAI')
    def test_parse_brain_dump_openai(self, mock_client_class):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "mock_openai_key"}):
            mock_client = mock.MagicMock()
            mock_client.chat.completions.create.return_value = mock.MagicMock(
                choices=[mock.MagicMock(message=mock.MagicMock(content='["Do emails", "Work on paper two"]'))]
            )
            mock_client_class.return_value = mock_client
            
            todos = parse_brain_dump("some dump text")
            self.assertEqual(todos, ["Do emails", "Work on paper two"])

    def test_parse_brain_dump_no_keys(self):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": ""}):
            with self.assertRaises(ValueError):
                parse_brain_dump("some dump text")


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
        self.assertEqual(response.status_code, 302)
        self.assertTrue('/profile/?tab=ops' in response.url)

    def test_api_requires_login_json(self):
        response = self.client.post('/api/todo/add/', content_type='application/json')
        self.assertEqual(response.status_code, 401)


class CleanRambleTestCase(TestCase):
    @mock.patch('google.generativeai.GenerativeModel')
    def test_clean_ramble_text_gemini(self, mock_model_class):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "mock_gemini_key", "OPENAI_API_KEY": ""}):
            mock_model = mock.MagicMock()
            mock_model.generate_content.return_value = mock.MagicMock(text='Cleaned gemini content')
            mock_model_class.return_value = mock_model
            
            cleaned = clean_ramble_text("some ramble text")
            self.assertEqual(cleaned, "Cleaned gemini content")

    @mock.patch('openai.OpenAI')
    def test_clean_ramble_text_openai(self, mock_client_class):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "mock_openai_key"}):
            mock_client = mock.MagicMock()
            mock_client.chat.completions.create.return_value = mock.MagicMock(
                choices=[mock.MagicMock(message=mock.MagicMock(content='Cleaned openai content'))]
            )
            mock_client_class.return_value = mock_client
            
            cleaned = clean_ramble_text("some ramble text")
            self.assertEqual(cleaned, "Cleaned openai content")

    def test_clean_ramble_text_fallback(self):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": ""}):
            raw_text = "um, so yeah, basically I need to ah work on this uh project."
            cleaned = clean_ramble_text(raw_text)
            self.assertNotIn("um", cleaned.lower())
            self.assertNotIn("uh", cleaned.lower())
            self.assertNotIn("ah", cleaned.lower())
            self.assertIn("work on this project", cleaned.lower())


class BrainDumpApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testapiuser', password='password123')
        self.today = timezone.localdate()

    @mock.patch('dashboard.services.clean_ramble_text')
    def test_clean_ramble_api_success(self, mock_clean_service):
        mock_clean_service.return_value = "This is a clean brain dump."
        self.client.login(username='testapiuser', password='password123')
        
        response = self.client.post('/api/braindump/clean-ramble/', data=json.dumps({
            'content': 'um, so yeah, raw ramble text',
            'date': self.today.strftime('%Y-%m-%d')
        }), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertEqual(res_data['status'], 'success')
        self.assertEqual(res_data['content'], 'This is a clean brain dump.')
        
        bd = BrainDump.objects.filter(user=self.user, date=self.today).first()
        self.assertIsNotNone(bd)
        self.assertEqual(bd.content, 'This is a clean brain dump.')


class PomodoroApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='pomouser', password='password123')
        self.client.login(username='pomouser', password='password123')
        self.today = timezone.localdate()

    def test_start_pomodoro_clears_existing_active(self):
        # Create an incomplete session
        old_session = PomodoroSession.objects.create(
            user=self.user,
            duration_minutes=25,
            completed=False,
            date=self.today
        )
        
        # Start a new one
        response = self.client.post('/api/pomodoro/start/', data=json.dumps({
            'duration_minutes': 45,
            'date': self.today.strftime('%Y-%m-%d')
        }), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')
        
        # Check that old one is deleted
        self.assertFalse(PomodoroSession.objects.filter(id=old_session.id).exists())
        # Check new one exists
        new_session = PomodoroSession.objects.get(user=self.user, completed=False)
        self.assertEqual(new_session.duration_minutes, 45)

    def test_pomodoro_status_syncs_expired_timer(self):
        # Create a session that started 30 mins ago for 25 min duration
        started_at = timezone.now() - timezone.timedelta(minutes=30)
        session = PomodoroSession.objects.create(
            user=self.user,
            duration_minutes=25,
            completed=False,
            date=self.today
        )
        # Manually force started_at back in time (auto_now_add makes it hard to set on create)
        PomodoroSession.objects.filter(id=session.id).update(started_at=started_at)
        
        # Call status view
        response = self.client.get('/api/pomodoro/status/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertIsNone(data.get('active_session'))
        
        # Check that it is now marked completed
        session.refresh_from_db()
        self.assertTrue(session.completed)
        
        # Check that it flags it for prompt log since focus_log is empty
        self.assertEqual(data['prompt_log_session']['id'], session.id)

    def test_save_pomodoro_log(self):
        session = PomodoroSession.objects.create(
            user=self.user,
            duration_minutes=25,
            completed=True,
            date=self.today
        )
        
        response = self.client.post('/api/pomodoro/save-log/', data=json.dumps({
            'session_id': session.id,
            'focus_log': 'Implemented nice feature'
        }), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.focus_log, 'Implemented nice feature')

    def test_cancel_pomodoro(self):
        session = PomodoroSession.objects.create(
            user=self.user,
            duration_minutes=25,
            completed=False,
            date=self.today
        )
        
        response = self.client.post('/api/pomodoro/cancel/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(PomodoroSession.objects.filter(id=session.id).exists())


