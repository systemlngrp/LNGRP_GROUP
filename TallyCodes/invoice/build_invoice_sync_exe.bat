@echo off
setlocal
cd /d "%~dp0"
set "PYINSTALLER_DIR=%TEMP%\LNGRP_Invoice_Sync_PyInstaller"
echo Building unified invoice sync executable...
python -m PyInstaller --noconfirm --clean --console --distpath "%~dp0dist" --workpath "%PYINSTALLER_DIR%\build" --specpath "%PYINSTALLER_DIR%" --name LNGRP_Invoice_Sync --hidden-import invFirm1 --hidden-import invFirm2 --hidden-import invFirm3 invoice_sync_all.py
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)
if exist ".env" (
  copy /Y ".env" "dist\LNGRP_Invoice_Sync\.env" >nul
  if errorlevel 1 (
    echo Could not copy .env beside the executable.
    pause
    exit /b 1
  )
) else (
  echo WARNING: No .env file found. Place your database .env beside the executable before running it.
)
echo.
echo EXE created at:
echo %~dp0dist\LNGRP_Invoice_Sync\LNGRP_Invoice_Sync.exe
echo Keep the .env file beside the executable and do not share it.
echo.
pause
