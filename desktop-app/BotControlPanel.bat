@echo off
title Bot Control Panel - Launcher v3.0
cd /d "d:\les bot\bot\desktop-app"

:: Register botpanel:// protocol to launch Electron from browser
reg add "HKCU\Software\Classes\botpanel" /ve /d "URL:BotPanel Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\botpanel" /v "URL Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\botpanel\shell\open\command" /ve /d "d:\les bot\bot\desktop-app\launch-electron.bat" /f >nul 2>&1

:: Open launcher HTML in default browser
start "" "launcher.html"
exit