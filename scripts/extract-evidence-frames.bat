@echo off
setlocal
node "%~dp0extract-evidence-frames.js" %*
exit /b %ERRORLEVEL%
