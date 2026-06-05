@echo off
cd /d "C:\Users\Vladimir\.gemini\antigravity\scratch\Baxter"
start "Old Baxter Server" cmd /k "npm run dev"
timeout /t 3 >nul
start http://localhost:3000
