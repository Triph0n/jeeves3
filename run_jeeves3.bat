@echo off
cd /d "%~dp0"
title Jeeves 3 Launcher
start "Jeeves 3 Server" cmd /k "npm run dev"
start "Jeeves 3 Discord Bot" cmd /k "npm run discord"
echo Spoustim Jeeves 3 Server, Discord bota a cekam na localhost:3000...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait_for_jeeves.ps1"
if errorlevel 1 (
  echo Jeeves server zatim neodpovida. Oteviram prohlizec i tak, zkontroluj okno Jeeves 3 Server.
)
start http://localhost:3000
exit
