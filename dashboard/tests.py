from django.test import TestCase
from django.utils import timezone
from .models import BrainDump, Todo, DailyReflection, PomodoroSession
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
