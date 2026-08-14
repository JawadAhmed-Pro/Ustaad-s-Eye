@echo off
echo.
echo ========================================
echo    USTAAD'S EYE - Starting App
echo ========================================
echo.

echo [1/2] Starting FastAPI Backend...
start "Ustaad Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak > nul

echo [2/2] Starting React Frontend...
start "Ustaad Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 5 /nobreak > nul

echo.
echo ========================================
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  API Docs: http://localhost:8000/docs
echo ========================================
echo.
start "" "http://localhost:5173"
