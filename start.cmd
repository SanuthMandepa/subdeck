@echo off
title Subdeck
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel%==0 (
    node serve.mjs %*
    goto :eof
)

where py >nul 2>&1
if %errorlevel%==0 (
    echo Node.js not found - falling back to Python ^(no cross-origin isolation^).
    start "" http://localhost:8080/
    py -m http.server 8080
    goto :eof
)

echo.
echo   Neither Node.js nor Python was found.
echo   Opening index.html directly - everything works except that
echo   CPU transcription will be slower.
echo.
start "" "%~dp0index.html"
pause
