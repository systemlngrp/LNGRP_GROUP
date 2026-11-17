@echo off
REM Brings this computer's copy of the code up to date with GitHub (main branch).
REM Stop the invoice sync windows first, run this, then start them again.
cd /d "%~dp0.."
git pull --ff-only origin main
echo.
pause
