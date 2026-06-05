@echo off
cd /d "C:\Users\Vladimir\.gemini\antigravity\scratch\Jeeves 3\Baxter"
call .venv\Scripts\activate.bat
start "Baxter Secretariat" python app.py
timeout /t 2 >nul
start http://127.0.0.1:8765
