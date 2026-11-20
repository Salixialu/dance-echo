@echo off
rem Keep this file pure ASCII: a non-ASCII batch file gets mis-parsed by cmd.
rem chcp 65001 is only here so node's UTF-8 log lines render correctly.
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Dance Echo - server only (port 8090)
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js v18+ and add it to PATH.
  pause
  exit /b 1
)
echo Foreground mode: closing this window stops the server.
echo For a detached server use "restart-server.bat", or just run the launcher one level up.
echo.
node server.mjs
echo.
echo Server stopped.
pause
