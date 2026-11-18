@echo off
setlocal
cd /d "%~dp0"
echo Building unified invoice sync executable...
python -m PyInstaller --noconfirm --clean --console --name LNGRP_Invoice_Sync --hidden-import invFirm1 --hidden-import invFirm2 --hidden-import invFirm3 --add-data ".env;." invoice_sync_all.py
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)
echo.
echo EXE created at:
echo %~dp0dist\LNGRP_Invoice_Sync\LNGRP_Invoice_Sync.exe
echo.
pause
