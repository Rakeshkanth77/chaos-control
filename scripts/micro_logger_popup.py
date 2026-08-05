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
    "[R] Research   [C] Coding   [A] Admin\n"
    "[M] Meeting    [D] Distraction   [B] Break\n"
    "(or type custom description & press Enter)"
)

def log_entry(user_text, category_code="other"):
    now_dt = datetime.datetime.now()
    date_str = now_dt.strftime("%Y-%m-%d")
    time_slot_str = now_dt.strftime("%H:%M")
    
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
            "category": category_code,
            "source": "desktop"
        }).encode('utf-8')

        req = urllib.request.Request(
            DJANGO_API_URL, 
            data=payload, 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=2) as response:
            res_data = json.loads(response.read().decode())
            print(f"[{time_slot_str}] Synced to Django DB: {res_data.get('status')}")
    except Exception as e:
        print(f"[{time_slot_str}] Django server offline or unreachable (Saved to local CSV only).")

def show_popup():
    root = tk.Tk()
    root.title("15-Min Time Audit")
    
    # Force popup to float ON TOP of VS Code and all windows
    root.attributes('-topmost', True)
    root.geometry("380x180+500+250")  # Size and position
    root.config(bg="#181825")
    root.resizable(False, False)

    now_str = datetime.datetime.now().strftime("%H:%M")

    # Header
    title_lbl = tk.Label(
        root, 
        text=f"⏰ {now_str} — What did you just work on?", 
        fg="#cdd6f4", bg="#181825", 
        font=("Segoe UI", 11, "bold")
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
            log_entry(text)
        root.destroy()

    entry.bind("<Return>", submit)

    # Auto-dismiss after 30 seconds if away from desk
    root.after(30000, root.destroy)
    
    root.mainloop()

def run_timer_loop():
    print("=" * 60)
    print(" ⏰ 15-MINUTE TIME AUDIT DESKTOP POPUP ACTIVE ")
    print(f" Log File: {LOG_FILE}")
    print(f" Django API: {DJANGO_API_URL}")
    print(" Press Ctrl+C in terminal to stop.")
    print("=" * 60)

    # Show initial popup immediately
    show_popup()

    while True:
        time.sleep(INTERVAL_MINUTES * 60)
        show_popup()

if __name__ == "__main__":
    run_timer_loop()
