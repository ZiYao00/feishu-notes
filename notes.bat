@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0src\cli.js" %*
) else (
  where.exe node.exe >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found. Extract the complete portable ZIP or install Node.js 24 LTS for source use.
    exit /b 1
  )
  node "%~dp0src\cli.js" %*
)
exit /b %errorlevel%
