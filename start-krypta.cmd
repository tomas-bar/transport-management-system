@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" -StartOnly
if errorlevel 1 (
  echo.
  echo Krypta could not start. Read the error above.
  pause
  exit /b 1
)
