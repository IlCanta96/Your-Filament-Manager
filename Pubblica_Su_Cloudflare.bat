@echo off
title Pubblica Elegoo Filament su Cloudflare (Attivo 24/7)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_cloudflare.ps1"
pause
