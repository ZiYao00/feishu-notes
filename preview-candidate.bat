@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  set "NODE_BIN=%CD%\runtime\node.exe"
) else (
  set "NODE_BIN=node"
)
echo Starting isolated source candidate Reader on http://127.0.0.1:4174/
echo This does not change the formal library.
"%NODE_BIN%" "scripts\preview-source-candidate.js"
if errorlevel 1 echo Candidate preview could not start. Check the message above.
pause
