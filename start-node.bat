@echo off
title MirtCoin Node
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs"
where node >nul 2>nul || (echo Node.js was not found. Install it from https://nodejs.org and run this again. & pause & exit /b 1)
rem ---- optional: public internet link through Cloudflare Tunnel ----
if exist "cloudflared.exe" (
  if exist "tunnel-token.txt" (
    set /p TUNNEL_TOKEN=<tunnel-token.txt
    start "Cloudflare Tunnel" /min cloudflared.exe tunnel run --token %TUNNEL_TOKEN%
  ) else (
    start "Cloudflare Tunnel" /min cloudflared.exe tunnel --url http://localhost:8332
  )
)
rem ---- node restarts by itself if it ever crashes ----
:loop
node server.js
echo Node stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
