@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" %*
exit /b %errorlevel%
