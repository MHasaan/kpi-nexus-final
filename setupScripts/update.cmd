@echo off
REM Double-clickable "rebuild after edits" helper for KPI Nexus Final.
REM Delegates to update.ps1 (install + prisma generate + migrate + rebuild packages).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
echo.
pause
