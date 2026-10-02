@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "APP_NAME=feishu-notes"
set "APP_URL=http://127.0.0.1:4173"
set "APP_PORT=4173"
set "SCRIPT_DIR=%~dp0"
set "APP_JS=%SCRIPT_DIR%src\cli.js"
set "LOG_DIR=%SCRIPT_DIR%data\logs"
set "LOG_PATH=%LOG_DIR%\viewer.log"
set "COMMAND_MODE=0"

if /i "%~1"=="start" (
  set "COMMAND_MODE=1"
  goto start_service
)
if /i "%~1"=="stop" (
  set "COMMAND_MODE=1"
  goto stop_service
)
if /i "%~1"=="restart" (
  set "COMMAND_MODE=1"
  goto restart_service
)
if /i "%~1"=="status" (
  set "COMMAND_MODE=1"
  goto check_status
)
if /i "%~1"=="open" (
  set "COMMAND_MODE=1"
  goto open_browser
)
if /i "%~1"=="start-open" (
  set "COMMAND_MODE=1"
  goto start_and_open
)

if not "%~1"=="" (
  echo Unknown command: %~1
  echo Valid commands: start, stop, restart, status, open, start-open
  exit /b 1
)

:menu
cls
echo feishu-notes Local Viewer
echo.
call :status_line
echo.
echo Project: %SCRIPT_DIR%
echo URL: %APP_URL%
echo Log: %LOG_PATH%
echo.
echo 1. Start viewer in background
echo 2. Stop viewer
echo 3. Restart viewer
echo 4. Open browser
echo 5. Start viewer and open browser
echo 6. Check status
echo 0. Exit
echo.
set /p "choice=Choose: "

if "%choice%"=="1" goto start_service
if "%choice%"=="2" goto stop_service
if "%choice%"=="3" goto restart_service
if "%choice%"=="4" goto open_browser
if "%choice%"=="5" goto start_and_open
if "%choice%"=="6" goto check_status
if "%choice%"=="0" goto end
goto menu

:start_service
call :is_running
if "%RUNNING%"=="1" (
  echo Viewer is already running ^(PID %SERVICE_PID%^).
  if "%COMMAND_MODE%"=="1" exit /b 0
  pause
  goto menu
)

call :check_runtime
if not "%errorlevel%"=="0" (
  if "%COMMAND_MODE%"=="1" exit /b 1
  pause
  goto menu
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$node=(Get-Command node.exe -ErrorAction Stop).Source; $args=@('%APP_JS%','serve'); Start-Process -FilePath $node -ArgumentList $args -WorkingDirectory '%SCRIPT_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%LOG_PATH%' -RedirectStandardError '%LOG_PATH%.err'"

call :wait_until_running
if "%RUNNING%"=="1" (
  echo Viewer started in background.
  echo URL: %APP_URL%
  if "%COMMAND_MODE%"=="1" exit /b 0
) else (
  echo Viewer did not start.
  echo Check: %LOG_PATH%
  echo Check: %LOG_PATH%.err
  if "%COMMAND_MODE%"=="1" exit /b 1
)
pause
goto menu

:stop_service
call :stop_service_once
if "%COMMAND_MODE%"=="1" exit /b %errorlevel%
pause
goto menu

:restart_service
call :stop_service_once
ping -n 2 127.0.0.1 >nul
goto start_service

:open_browser
call :is_running
if not "%RUNNING%"=="1" (
  echo Viewer is not running. Use "Start viewer" or "Start viewer and open browser" first.
  if "%COMMAND_MODE%"=="1" exit /b 1
  pause
  goto menu
)
start "" "%APP_URL%"
if "%COMMAND_MODE%"=="1" exit /b 0
goto menu

:start_and_open
call :is_running
if not "%RUNNING%"=="1" (
  call :check_runtime
  if not "%errorlevel%"=="0" (
    if "%COMMAND_MODE%"=="1" exit /b 1
    pause
    goto menu
  )

  if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$node=(Get-Command node.exe -ErrorAction Stop).Source; $args=@('%APP_JS%','serve'); Start-Process -FilePath $node -ArgumentList $args -WorkingDirectory '%SCRIPT_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%LOG_PATH%' -RedirectStandardError '%LOG_PATH%.err'"

  call :wait_until_running
  if not "%RUNNING%"=="1" (
    echo Viewer did not start.
    echo Check: %LOG_PATH%
    echo Check: %LOG_PATH%.err
    if "%COMMAND_MODE%"=="1" exit /b 1
    pause
    goto menu
  )
)
start "" "%APP_URL%"
echo Viewer is running at %APP_URL%
if "%COMMAND_MODE%"=="1" exit /b 0
pause
goto menu

:check_status
echo.
call :status_line
call :check_node_only
if "%NODE_OK%"=="1" (
  echo Node.js: available
) else (
  echo Node.js: not found
)
if exist "%SCRIPT_DIR%node_modules\playwright-core" (
  echo Dependencies: installed
) else (
  echo Dependencies: missing ^(run npm install^)
)
echo URL: %APP_URL%
echo Log: %LOG_PATH%
echo.
if "%COMMAND_MODE%"=="1" exit /b 0
pause
goto menu

:status_line
call :is_running
if "%RUNNING%"=="1" (
  echo Viewer status: running ^(PID %SERVICE_PID%^)
) else (
  echo Viewer status: stopped
)
exit /b 0

:wait_until_running
set "RUNNING=0"
for /l %%I in (1,1,20) do (
  call :is_running
  if "!RUNNING!"=="1" exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1

:is_running
set "RUNNING=0"
set "SERVICE_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  call :is_our_process %%P
  if "!OWN_PROCESS!"=="1" (
    set "RUNNING=1"
    set "SERVICE_PID=%%P"
  )
)
exit /b 0

:is_our_process
set "OWN_PROCESS=0"
set "CHECK_PID=%~1"
if "%CHECK_PID%"=="" exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $env:CHECK_PID) -ErrorAction SilentlyContinue; if($null -ne $p -and -not [string]::IsNullOrWhiteSpace($p.CommandLine) -and $p.CommandLine.IndexOf($env:APP_JS,[System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and $p.CommandLine -match '\sserve(\s|$)'){exit 0}; exit 1" >nul 2>nul
if "%errorlevel%"=="0" set "OWN_PROCESS=1"
exit /b 0

:stop_service_once
call :is_running
if not "%RUNNING%"=="1" (
  echo Viewer is not running. Nothing was stopped.
  exit /b 0
)
call :is_our_process %SERVICE_PID%
if not "%OWN_PROCESS%"=="1" (
  echo Refusing to stop PID %SERVICE_PID% because it is not this feishu-notes viewer.
  exit /b 1
)
taskkill /PID %SERVICE_PID% /F >nul 2>nul
if "%errorlevel%"=="0" (
  echo Viewer stopped.
  exit /b 0
)
echo Failed to stop viewer PID %SERVICE_PID%.
exit /b 1

:check_runtime
call :check_node_only
if not "%NODE_OK%"=="1" (
  echo Node.js was not found. Install Node.js and try again.
  exit /b 1
)
if not exist "%APP_JS%" (
  echo Missing application entry:
  echo %APP_JS%
  exit /b 1
)
if not exist "%SCRIPT_DIR%node_modules\playwright-core" (
  echo Project dependencies are not installed.
  echo Run: npm install
  exit /b 1
)
exit /b 0

:check_node_only
set "NODE_OK=0"
where node >nul 2>nul
if "%errorlevel%"=="0" set "NODE_OK=1"
exit /b 0

:end
endlocal
exit /b 0
