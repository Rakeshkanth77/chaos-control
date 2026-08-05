import json
from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth.models import User
import unittest.mock as mock
import os
from datetime import timedelta
from .models import BrainDump, Todo, DailyReflection, PomodoroSession, UserProfile, TimeAuditLog
from .services import parse_brain_dump, generate_ai_reflection, clean_ramble_text
from .api import get_slot_predictions, previous_slot


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

    def test_api_requires_login_json(self):
        response = self.client.post('/api/todo/add/', content_type='application/json')
        self.assertEqual(response.status_code, 401)


class PwaAndLegalTestCase(TestCase):
    def test_service_worker_served_at_root(self):
        response = self.client.get('/sw.js')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Service-Worker-Allowed'], '/')
        self.assertIn('javascript', response['Content-Type'])

    def test_offline_page(self):
        self.assertEqual(self.client.get('/offline/').status_code, 200)

    def test_privacy_page_discloses_ai_sharing(self):
        response = self.client.get('/privacy/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Gemini')


class AccountDeletionTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='doomed', password='pw123', email='doomed@t.local')

    def test_delete_requires_login(self):
        self.assertEqual(self.client.post('/account/delete/').status_code, 302)

    def test_delete_rejects_get(self):
        self.client.login(username='doomed', password='pw123')
        self.assertEqual(self.client.get('/account/delete/').status_code, 405)

    def test_delete_removes_user_and_data(self):
        Todo.objects.create(user=self.user, title='doomed task', date=timezone.localdate())
        self.client.login(username='doomed', password='pw123')
        response = self.client.post('/account/delete/')
        self.assertEqual(response.status_code, 302)
        self.assertFalse(User.objects.filter(username='doomed').exists())
        self.assertEqual(Todo.objects.filter(title='doomed task').count(), 0)


class AIRateLimitTestCase(TestCase):
    @override_settings(DAILY_AI_LIMIT=2)
    def test_quota_blocks_after_limit(self):
        from dashboard.api import consume_ai_quota
        user = User.objects.create_user(username='heavy', password='pw123')
        results = [consume_ai_quota(user)[0] for _ in range(3)]
        self.assertEqual(results, [True, True, False])

    @override_settings(DAILY_AI_LIMIT=1)
    def test_staff_exempt_from_quota(self):
        from dashboard.api import consume_ai_quota
        staff = User.objects.create_user(username='boss', password='pw123', is_staff=True)
        self.assertTrue(all(consume_ai_quota(staff)[0] for _ in range(5)))


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


class TimeAuditApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='auditor', password='password123')
        self.client.login(username='auditor', password='password123')
        self.today_str = timezone.localdate().strftime("%Y-%m-%d")

    def test_save_time_audit_auto_categorize(self):
        response = self.client.post('/api/time-audit/save/', data=json.dumps({
            'time_slot': '10:15',
            'raw_text': 'scrolling instagram reels',
            'date': self.today_str
        }), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['category'], 'distracted')

    def test_get_time_audit_today_and_stats(self):
        # Create 2 logs
        self.client.post('/api/time-audit/save/', data=json.dumps({
            'time_slot': '09:00',
            'raw_text': 'reading thesis paper',
            'category': 'phd',
            'date': self.today_str
        }), content_type='application/json')

        response = self.client.get(f'/api/time-audit/today/?date={self.today_str}')
        self.assertEqual(response.status_code, 200)
        today_data = response.json()
        self.assertEqual(today_data['count'], 1)
        self.assertIn('09:00', today_data['slots'])

        stats_resp = self.client.get('/api/time-audit/stats/?days=3')
        self.assertEqual(stats_resp.status_code, 200)
        stats_data = stats_resp.json()
        self.assertEqual(stats_data['total_blocks'], 1)


class SlotPredictionTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='predictor', password='password123')
        self.client.login(username='predictor', password='password123')
        self.today = timezone.localdate()

    def log(self, days_ago, time_slot, raw_text, category='other'):
        return TimeAuditLog.objects.create(
            user=self.user,
            date=self.today - timedelta(days=days_ago),
            time_slot=time_slot,
            raw_text=raw_text,
            category=category,
        )

    def test_previous_slot_wraps_at_midnight(self):
        self.assertEqual(previous_slot('09:15'), '09:00')
        self.assertEqual(previous_slot('09:00'), '08:45')
        self.assertEqual(previous_slot('00:00'), '23:45')
        self.assertIsNone(previous_slot('nonsense'))

    def test_no_history_returns_no_predictions(self):
        self.assertEqual(get_slot_predictions(self.user, '09:00', self.today), [])

    def test_same_weekday_routine_outranks_other_days(self):
        # Same weekday as today, 7 and 14 days back.
        self.log(7, '09:00', 'supervisor meeting', 'phd')
        self.log(14, '09:00', 'supervisor meeting', 'phd')
        # Same slot but different weekdays, logged more often.
        for days_ago in (1, 2, 3):
            self.log(days_ago, '09:00', 'checking email', 'other')

        predictions = get_slot_predictions(self.user, '09:00', self.today)

        self.assertEqual(predictions[0]['text'], 'supervisor meeting')
        self.assertEqual(predictions[0]['category'], 'phd')
        self.assertIn('checking email', [p['text'] for p in predictions])

    def test_continuation_uses_previous_slot_logged_today(self):
        # On earlier days, "writing chapter 3" at 14:00 was always followed by
        # more of the same at 14:15.
        for days_ago in (1, 2, 3):
            self.log(days_ago, '14:00', 'writing chapter 3', 'phd')
            self.log(days_ago, '14:15', 'writing chapter 3', 'phd')
        # An unrelated entry that is otherwise frequent at 14:15.
        for days_ago in (4, 5):
            self.log(days_ago, '14:15', 'lunch washing up', 'cooking')

        # Today the previous slot says the same thing, so continuation should fire.
        TimeAuditLog.objects.create(
            user=self.user, date=self.today, time_slot='14:00',
            raw_text='writing chapter 3', category='phd',
        )

        predictions = get_slot_predictions(self.user, '14:15', self.today)
        self.assertEqual(predictions[0]['text'], 'writing chapter 3')

    def test_predictions_respect_limit_and_skip_target_slot_today(self):
        for days_ago in (1, 2, 3, 4):
            self.log(days_ago, '11:00', f'task {days_ago}', 'other')
        TimeAuditLog.objects.create(
            user=self.user, date=self.today, time_slot='11:00',
            raw_text='already logged this one', category='other',
        )

        predictions = get_slot_predictions(self.user, '11:00', self.today)

        self.assertLessEqual(len(predictions), 3)
        self.assertNotIn('already logged this one', [p['text'] for p in predictions])

    def test_today_endpoint_returns_predictions_only_when_slot_given(self):
        self.log(7, '09:00', 'supervisor meeting', 'phd')

        with_slot = self.client.get('/api/time-audit/today/?slot=09:00').json()
        self.assertEqual(with_slot['predictions'][0]['text'], 'supervisor meeting')

        without_slot = self.client.get('/api/time-audit/today/').json()
        self.assertEqual(without_slot['predictions'], [])


class HabitProtocolTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.login(username='testuser', password='password')
        self.today = timezone.localdate()
        self.today_str = str(self.today)

    def test_create_and_list_habit_protocols(self):
        from dashboard.models import HabitProtocol
        resp = self.client.post('/api/protocols/create/', data=json.dumps({
            'title': 'Take Isabgol',
            'target_time': '11:30',
            'keywords': 'isabgol, fibre',
            'category': 'life_skills',
            'icon': '💊'
        }), content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['protocol']['title'], 'Take Isabgol')

        list_resp = self.client.get('/api/protocols/list/')
        self.assertEqual(list_resp.status_code, 200)
        l_data = list_resp.json()
        self.assertEqual(l_data['total_count'], 1)
        self.assertFalse(l_data['protocols'][0]['is_completed_today'])

    def test_auto_trigger_habit_protocol_from_time_audit_log(self):
        from dashboard.models import HabitProtocol
        protocol = HabitProtocol.objects.create(
            user=self.user,
            title='Take Isabgol',
            keywords='isabgol, fibre',
            target_time='11:30',
            icon='💊'
        )

        save_resp = self.client.post('/api/time-audit/save/', data=json.dumps({
            'time_slot': '11:30',
            'raw_text': 'took isabgol with water',
            'category': 'life_skills',
            'date': self.today_str
        }), content_type='application/json')
        self.assertEqual(save_resp.status_code, 200)
        save_data = save_resp.json()
        self.assertEqual(len(save_data['auto_executed_protocols']), 1)
        self.assertEqual(save_data['auto_executed_protocols'][0]['title'], 'Take Isabgol')

        protocol.refresh_from_db()
        self.assertTrue(protocol.is_completed_today())
        self.assertEqual(protocol.streak_count, 1)

    def test_toggle_complete_habit_protocol(self):
        from dashboard.models import HabitProtocol
        protocol = HabitProtocol.objects.create(
            user=self.user,
            title='Night Reflection',
            target_time='22:00'
        )
        toggle_resp = self.client.post('/api/protocols/complete/', data=json.dumps({
            'id': protocol.id
        }), content_type='application/json')
        self.assertEqual(toggle_resp.status_code, 200)
        t_data = toggle_resp.json()
        self.assertTrue(t_data['completed'])
        self.assertEqual(t_data['streak_count'], 1)



