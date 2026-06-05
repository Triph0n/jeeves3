@echo off
cd /d "C:\Users\Vladimir\.gemini\antigravity\scratch\video_to_audio"
start "Video to Audio Server" cmd /k "npm run dev"
timeout /t 3 >nul
start http://localhost:5173
