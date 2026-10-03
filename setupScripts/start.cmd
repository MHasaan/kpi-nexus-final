@echo off
REM Double-clickable launcher for KPI Nexus Final.
REM Delegates to start.ps1 (handles Docker, deps, infra, db, dev server).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
echo.
pause
