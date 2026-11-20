@echo off
setlocal enabledelayedexpansion
title Dance Echo Launcher
cd /d "%~dp0"

echo ========================================================
echo   Dance Echo - local video library and motion workbench
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js v18+ and add it to PATH.
    pause
    exit /b 1
)

set "APP_DIR=%~dp0local vidio store"
set "SRV_DIR=%~dp0DanceEcho Server"

if not exist "%APP_DIR%\node_modules" (
    echo [INFO] First run, installing frontend dependencies...
    pushd "%APP_DIR%"
    call npm install
    popd
)

echo [1/3] Local server on 8090 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SRV_DIR%\start-wmi.ps1" >nul 2>&1

set /a n=0
:wait_srv
netstat -ano | findstr ":8090" | findstr LISTENING >nul
if not errorlevel 1 goto srv_port_ok
set /a n+=1
if !n! geq 20 goto srv_fail
ping -n 2 127.0.0.1 >nul
goto wait_srv

:srv_fail
echo       [ERROR] Server not ready in 20s. See "%SRV_DIR%\data\err.log"
pause
exit /b 1

:srv_port_ok
where curl >nul 2>nul
if errorlevel 1 (
    echo       Server port is listening: http://127.0.0.1:8090
    goto srv_done
)
curl -s -m 3 -o nul http://127.0.0.1:8090/api/v1/health
if errorlevel 1 (
    echo       [WARN] Port 8090 listens but the health check failed. Check server logs.
) else (
    echo       Server ready: http://127.0.0.1:8090
)
:srv_done

echo [2/3] Frontend dev server on 5173 ...
netstat -ano | findstr ":5173" | findstr LISTENING >nul
if not errorlevel 1 (
    echo       Frontend already running.
    goto web_ok
)
start "Dance Echo Frontend" /d "%APP_DIR%" /min cmd /k "npm run dev"

set /a n=0
:wait_web
ping -n 2 127.0.0.1 >nul
netstat -ano | findstr ":5173" | findstr LISTENING >nul
if not errorlevel 1 goto web_ok
set /a n+=1
if !n! geq 25 goto web_slow
goto wait_web

:web_slow
echo       [WARN] Frontend not ready in 25s, opening the browser anyway.

:web_ok
echo [3/3] Opening http://127.0.0.1:5173/
start "" http://127.0.0.1:5173/

echo.
echo Done. Closing this window does not stop the services.
echo Server log: DanceEcho Server\data\out.log
ping -n 4 127.0.0.1 >nul
exit /b 0
