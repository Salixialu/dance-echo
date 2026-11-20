@echo off
cd /d "%~dp0"
echo ============================================
echo   Dance Echo - 重启服务端（后台常驻）
echo ============================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8090" ^| findstr LISTENING') do (
  echo [1/2] 结束旧服务进程 PID %%a
  taskkill /F /PID %%a >nul 2>&1
  set FOUND=1
)
if "%FOUND%"=="0" echo [1/2] 8090 上没有在跑的服务端，直接启动。

ping -n 2 127.0.0.1 >nul
echo [2/2] 通过 WMI 启动新服务（父进程是 WmiPrvSE，关掉本窗口也不会停）...
powershell -NoProfile -ExecutionPolicy Bypass -File "start-wmi.ps1"

echo.
echo 完成。日志：data\out.log / data\err.log
ping -n 4 127.0.0.1 >nul
