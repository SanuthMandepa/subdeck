@echo off
title Subdeck
cd /d "%~dp0"

where node >nul 2>&1
if not %errorlevel%==0 (
    echo.
    echo   Node.js is required to run Subdeck from source.
    echo   Install it from https://nodejs.org and run this again.
    echo.
    pause
    goto :eof
)

if not exist "node_modules" (
    echo Installing dependencies, one moment...
    call npm install || goto :eof
)

REM `npm run dev` serves with the COOP/COEP headers that switch on
REM cross-origin isolation - see vite.config.ts for why that matters.
call npm run dev -- --open
