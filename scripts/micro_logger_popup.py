"""
15-Minute Micro-Audit Desktop Logger (AlwaysOnTop)
--------------------------------------------------
Runs in background, pops up over VS Code every 15 mins.
Allows typing free-text or single-letter shortcut keys.
Saves to local CSV (~/Desktop/15min_time_log.csv) and posts to local Django app DB.
"""

import os
import sys
import csv
import datetime
import threading
import time
import urllib.request
import urllib.parse
import json
import tkinter as tk

# File Paths & Config
DESKTOP_PATH = os.path.join(os.path.expanduser("~"), "Desktop")
LOG_FILE = os.path.join(DESKTOP_PATH, "15min_time_log.csv")
DJANGO_API_URL = "http://127.0.0.1:8000/api/time-audit/save/"
INTERVAL_MINUTES = 15

CATEGORIES_HELP = (
    "[P] PhD     [J] Side Projects   [PL] Planning   [L] Life Skills\n"
    "[S] Spiritual [C] Cooking [V] Driving [D] Distracted [B] Break\n"
    "(or type custom description & press Enter)"
)

def get_completed_slot_str():
    """Returns the HH:MM string for the 15-minute slot that just ended (e.g., at 10:15 returns '10:00')."""
    now_dt = datetime.datetime.now()
    prev_dt = now_dt - datetime.timedelta(minutes=1)
    slot_min = (prev_dt.minute // 15) * 15
    return f"{prev_dt.hour:02d}:{slot_min:02d}"

def log_entry(user_text, time_slot_str=None, category_code="other"):
    now_dt = datetime.datetime.now()
    date_str = now_dt.strftime("%Y-%m-%d")
    if not time_slot_str:
        time_slot_str = get_completed_slot_str()
    
    # 1. Local CSV Backup
    file_exists = os.path.isfile(LOG_FILE)
    try:
        with open(LOG_FILE, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Date", "TimeSlot", "RawText", "Category", "LoggedAt"])
            writer.writerow([date_str, time_slot_str, user_text, category_code, now_dt.strftime("%H:%M:%S")])
        print(f"[{time_slot_str}] Local CSV updated: {user_text}")
    except Exception as err:
        print(f"Error saving to CSV: {err}")

    # 2. Sync to Django Web App API if server running
    try:
        payload = json.dumps({
            "date": date_str,
            "time_slot": time_slot_str,
            "raw_text": user_text,
            "source": "desktop_popup"
        }).encode('utf-8')

        req = urllib.request.Request(
            DJANGO_API_URL, 
            data=payload, 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            print(f"[{time_slot_str}] Synced to DB! Category: {res_data.get('category')}")
    except Exception as err:
        print(f"[{time_slot_str}] Saved locally (Django API offline/error: {err})")

def get_slot_range_str(slot_str):
    if not slot_str or ':' not in slot_str:
        return slot_str
    h, m = map(int, slot_str.split(':'))
    end_m = (m + 15) % 60
    end_h = (h + 1) % 24 if end_m == 0 else h
    return f"{slot_str} - {end_h:02d}:{end_m:02d}"

def is_slot_already_logged(target_slot):
    """
    Checks whether the target_slot is already logged for today:
    1. Checks Django Web App API /api/time-audit/today/ if Django server is running.
    2. Checks the local CSV file backup (~/Desktop/15min_time_log.csv).
    Returns True if already logged, False otherwise.
    """
    now_dt = datetime.datetime.now()
    date_str = now_dt.strftime("%Y-%m-%d")

    # 1. Check Django Web App API
    try:
        today_api_url = f"http://127.0.0.1:8000/api/time-audit/today/?date={date_str}"
        req = urllib.request.Request(today_api_url)
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('status') == 'success' and 'slots' in data:
                if target_slot in data['slots'] and data['slots'][target_slot].get('raw_text'):
                    return True
    except Exception:
        pass

    # 2. Check Local CSV File Backup
    if os.path.isfile(LOG_FILE):
        try:
            with open(LOG_FILE, mode='r', newline='', encoding='utf-8') as f:
                reader = csv.reader(f)
                header = next(reader, None)
                for row in reader:
                    if len(row) >= 3 and row[0] == date_str and row[1] == target_slot:
                        if row[2].strip():
                            return True
        except Exception:
            pass

    return False

def show_popup(target_slot=None, force=False):
    """Displays AlwaysOnTop Tkinter window for quick input."""
    if not target_slot:
        target_slot = get_completed_slot_str()

    if not force and is_slot_already_logged(target_slot):
        print(f"[{target_slot}] Slot is already logged for today! Skipping popup prompt.")
        return

    slot_range = get_slot_range_str(target_slot)

    root = tk.Tk()
    root.title(f"15-Min Time Audit ({slot_range})")
    root.geometry("380x210")
    root.attributes("-topmost", True)
    root.configure(bg="#181825")

    # Center window
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    x = (screen_width - 380) // 2
    y = (screen_height - 210) // 2
    root.geometry(f"380x210+{x}+{y}")

    # Header
    title_lbl = tk.Label(
        root, 
        text=f"⏰ Slot {slot_range} Completed — What did you work on?", 
        fg="#2dd4bf", bg="#181825", 
        font=("Segoe UI", 10, "bold")
    )
    title_lbl.pack(pady=(12, 5))

    # Helper text
    help_lbl = tk.Label(
        root, 
        text=CATEGORIES_HELP, 
        fg="#a6adc8", bg="#181825", 
        font=("Segoe UI", 9)
    )
    help_lbl.pack(pady=2)

    # Input Box
    entry_var = tk.StringVar()
    entry = tk.Entry(
        root, 
        textvariable=entry_var, 
        font=("Segoe UI", 11), 
        width=30, 
        bg="#313244", 
        fg="#ffffff", 
        insertbackground="white",
        justify="center"
    )
    entry.pack(pady=10)
    entry.focus_set()

    def submit(event=None):
        text = entry_var.get().strip()
        if text:
            log_entry(text, time_slot_str=target_slot)
        root.destroy()

    entry.bind("<Return>", submit)

    # Auto-dismiss after 30 seconds if away from desk
    root.after(30000, root.destroy)
    
    root.mainloop()

def is_outside_audit_hours_uk():
    """Checks if current time in UK timezone is outside 05:00 AM - 10:00 PM (05:00 - 22:00)."""
    try:
        import zoneinfo
        uk_tz = zoneinfo.ZoneInfo("Europe/London")
        uk_now = datetime.datetime.now(uk_tz)
    except Exception:
        uk_now = datetime.datetime.now()
    return uk_now.hour < 5 or uk_now.hour >= 22


def run_timer_loop():
    print("=" * 60)
    print(" ⏰ 15-MINUTE TIME AUDIT DESKTOP POPUP ACTIVE ")
    print(f" Log File: {LOG_FILE}")
    print(f" Django API: {DJANGO_API_URL}")
    print(" Active Window: 5:00 AM to 10:00 PM (05:00 - 22:00 UK Time)")
    print(" Auto-dismiss: 30 seconds if unhandled")
    print(" Press Ctrl+C in terminal to stop.")
    print("=" * 60)

    if is_outside_audit_hours_uk():
        print("🛑 Current UK time is outside audit window (5:00 AM - 10:00 PM). Auto-paused!")

    while True:
        # Sleep until exact next 15-minute boundary (:00, :15, :30, :45)
        now = datetime.datetime.now()
        mins_mod = now.minute % 15
        secs_mod = now.second
        secs_until_boundary = (15 - mins_mod) * 60 - secs_mod
        
        if secs_until_boundary > 0:
            rem_m = secs_until_boundary // 60
            rem_s = secs_until_boundary % 60
            print(f"Next 15-min slot ends in {rem_m}m {rem_s}s...")
            time.sleep(secs_until_boundary)

        if is_outside_audit_hours_uk():
            print("\n🌙 10:00 PM UK Time reached / outside hours! Pausing until 5:00 AM.")
            time.sleep(60)
            continue

        show_popup()
        # Avoid double trigger within the same second
        time.sleep(2)

if __name__ == "__main__":
    run_timer_loop()


