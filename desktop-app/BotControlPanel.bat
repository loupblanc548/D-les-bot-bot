@echo off
title Bot Control Panel
cd /d "d:\les bot\bot\desktop-app"
mode con: cols=50 lines=12
color 0B

echo ==========================================
echo        BOT CONTROL PANEL
echo ==========================================
echo.
echo  1. Lancer l'app locale (Electron)
echo  2. Ouvrir la version en ligne (Netlify)
echo  3. Quitter
echo.
set /p choice="Choix (1/2/3): "

if "%choice%"=="1" (
    echo.
    echo [*] Demarrage de l'app Electron...
    start "" npm start
    exit
)
if "%choice%"=="2" (
    echo.
    echo [*] Ouverture du panel en ligne...
    start "" "https://bot-control-panel.netlify.app"
    exit
)
if "%choice%"=="3" exit

echo Choix invalide.
pause
