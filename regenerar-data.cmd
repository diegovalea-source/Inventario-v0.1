@echo off
setlocal

set "APP_DIR=%~dp0"
set "EXCEL_DIR=%~1"
if "%EXCEL_DIR%"=="" set "EXCEL_DIR=%APP_DIR%.."

set "CODEX_PY=C:\Users\Esther\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%CODEX_PY%" (
  "%CODEX_PY%" "%APP_DIR%regenerar-data.py" "%EXCEL_DIR%"
  pause
  exit /b %errorlevel%
)

python "%APP_DIR%regenerar-data.py" "%EXCEL_DIR%"
pause
