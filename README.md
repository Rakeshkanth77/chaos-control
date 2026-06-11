# 🌪️ chaos-control: The Tactical Execution Protocol

A premium daily productivity dashboard built with **pure Django**, **SQLite**, and **Vanilla CSS/JS** featuring a responsive iOS-inspired Glassmorphism user interface. 

Designed for high-performance builders who want to capture mental noise, isolate critical targets, and execute with absolute authority.

## ⚡ The Three-Phase Protocol

1. **Phase 1: Purge (Brain Dump)**
   * Unload your raw, chaotic thoughts on the screen. The AI parser (or smart local fallback regex splitter) automatically extracts distinct tasks.
2. **Phase 2: Prioritize (Eisenhower Matrix)**
   * Drag-and-drop tasks into a vertically stackedpriority deck: 🔴 Urgent & Important, 🟠 Important & Not Urgent, 🟡 Urgent & Not Important, 🟢 Neither.
3. **Phase 3: Conquest (Pomodoro Sprints & Reflection)**
   * Run focused 25-minute sprints (with a custom circular progress ring and gentle Web Audio API completion chimes).
   * Write daily notes and let the LLM extract mistakes to avoid and recommendations for tomorrow.
   * View streaks and progress trends rendered in custom **Chart.js** layouts.

---

## 🛠️ Features & Stack

* **Backend**: Django (SQLite database).
* **AI Engine**: Auto-configured client supporting both **OpenAI** (`gpt-4o-mini`) and **Groq** (`llama-3.1-8b-instant`) keys, with a robust rule-based regex fallback parser.
* **Front-end**: Pure HTML5/CSS3. Translucent frosted glass panel overlays, animated gradient backgrounds (`backdrop-filter: blur(20px)`), and CSS 3D perspective flashcard flipping.
* **Interactions**: Drag-and-drop prioritizing, debounced auto-saving on text inputs, and dynamic chart renders.

---

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Rakeshkanth77/chaos-control.git
   cd chaos-control
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   # API Configuration (Add Groq or OpenAI key)
   OPENAI_API_KEY=your_api_key_here
   
   # Django config
   SECRET_KEY=your_secret_key_here
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1
   ```
   *Note: If the key starts with `gsk_`, the app will automatically route requests to the Groq Llama API instead of OpenAI.*

4. **Initialize Database**:
   ```bash
   python manage.py migrate
   ```

5. **Create Superuser (for Admin panel access)**:
   ```bash
   python manage.py createsuperuser
   ```

6. **Start the Engine**:
   ```bash
   python manage.py runserver
   ```
   Open http://127.0.0.1:8000 in your browser to command your day.
