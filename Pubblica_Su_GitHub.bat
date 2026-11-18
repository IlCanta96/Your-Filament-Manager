@echo off
title Your Filament Manager - Pubblica su GitHub
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish_github.ps1"
pause
