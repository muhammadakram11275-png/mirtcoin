@echo off
title Build MirtCoin Desktop (.exe)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nai. https://nodejs.org theke LTS install koro, tarpor abar chalao. & pause & exit /b 1)
echo [1/2] Installing packages (first time e kichu minute lagbe)...
call npm install
if errorlevel 1 (echo npm install fail hoyeche. Internet check koro. & pause & exit /b 1)
echo [2/2] Building .exe ...
call npm run dist
if errorlevel 1 (echo Build fail. "symbolic link" error hole: Windows Settings ^> Developer Mode ON koro, ba ei file Run as administrator diye chalao. & pause & exit /b 1)
echo.
echo DONE. dist folder e MirtCoin-Setup-4.3.0.exe ar MirtCoin-Portable-4.3.0.exe ache.
explorer dist
pause
