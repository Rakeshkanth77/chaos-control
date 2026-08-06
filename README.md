# Chaos Control: Executive Productivity & Time Audit System

Chaos Control is a full-featured productivity dashboard and time-audit system built with Django, SQLite, and Vanilla CSS/JS. It features a responsive, glassmorphism-inspired UI designed for structured task capture, Signal/Noise prioritization, Pomodoro focus tracking, and granular 15-minute micro-audits.

---

## Core System Modules

### 1. Task Capture & Brain Dump (Phase 1)
- Capture unstructured mental noise in real-time.
- Smart parsing extracts individual actionable tasks automatically.

### 2. Signal & Noise Focus Framework (Phase 2)
- Organize tasks into high-impact Signal objectives versus low-priority Noise boundaries.
- Full Eisenhower Matrix classification (Urgent & Important, Important & Not Urgent, Urgent & Not Important, Neither).

### 3. Execution & Sprint Engine (Phase 3)
- Integrated 25-minute Pomodoro focus timer with Web Audio notifications and circular progress indicators.
- Habit protocol automation with streak tracking and keyword auto-completion.

### 4. 15-Minute Time Audit & Micro-Logging
- Log activity across 15-minute intervals between 05:00 and 22:00.
- Multi-slot batch selection mode to log continuous blocks of work at once.
- Smart predictions based on historic logging patterns.
- Automated hourly break reminders with positive reinforcement notifications.

### 5. Productive Analytics & Reporting
- Dynamic Day, Week, and Month analytics views.
- 10-category breakdown tracking (PhD, Side Projects, Life Skills, Spiritual, Cooking, Driving, Exercise, Break, Distracted, Other) across interactive bar and donut charts.
- Exportable Markdown time-audit reports with preset timeframes (Today, 3 Days, 1 Week, 1 Month, 1 Year, All Time).

---

## Technical Stack

- **Backend**: Python 3.13 / Django 5.x / SQLite.
- **Frontend**: Vanilla HTML5, CSS3 (Glassmorphism, custom CSS variables, responsive grid layouts), and Vanilla JavaScript (Chart.js integrations).
- **AI & Natural Language Engine**: Dual-client integration supporting OpenAI (`gpt-4o-mini`) and Groq (`llama-3.1-8b-instant`) with rule-based regex fallback parsers.

---

## Installation & Setup

### 1. Clone Repository
```bash
git clone https://github.com/Rakeshkanth77/chaos-control.git
cd chaos-control
```

### 2. Environment Setup & Dependencies
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment Variables Configuration
Create a `.env` file in the project root:
```env
SECRET_KEY=your_django_secret_key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# AI API Key (OpenAI or Groq)
OPENAI_API_KEY=your_api_key_here
```
*Note: Keys starting with `gsk_` automatically route to the Groq Llama API endpoint.*

### 4. Database Initialization & Migration
```bash
python manage.py migrate
```

### 5. Administrative Account Creation
```bash
python manage.py createsuperuser
```

### 6. Development Server Execution
```bash
python manage.py runserver
```
Access the application at `http://127.0.0.1:8000`.

---

## License & Attribution

Developed for high-performance daily planning, execution tracking, and academic/project time auditing.
