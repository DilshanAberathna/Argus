@echo off
echo ============================================
echo   ARGUS Face Recognition Bridge API
echo ============================================
echo.
echo Starting server on http://localhost:8000
echo API docs at:  http://localhost:8000/docs
echo Health check: http://localhost:8000/health
echo.

cd /d "%~dp0"
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
