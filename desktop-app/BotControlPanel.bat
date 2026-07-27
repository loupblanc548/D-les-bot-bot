@echo off
title Bot Control Panel v2.0
cd /d "d:\les bot\bot\desktop-app"
mode con: cols=62 lines=20
color 0B

echo  ============================================================
echo                                                           
echo    [##]   BOT CONTROL PANEL v2.0                 [##]     
echo    [##]   Glassmorphism Edition                    [##]     
echo                                                           
echo  ============================================================
echo.
echo   [1]  Lancer l'app locale (Electron)
echo   [2]  Ouvrir la version en ligne (Netlify)
echo   [3]  Ouvrir le dashboard web (VPS)
echo   [4]  Quitter
echo.
echo   ----------------------------------------
echo   Serveur: 31.220.79.90:3002
echo   ----------------------------------------
echo.
set /p choice="  Choix (1/2/3/4): "

if "%choice%"=="1" (
    echo.
    echo  [*] Demarrage de l'app Electron...
    start "" npm start
    exit
)
if "%choice%"=="2" (
    echo.
    echo  [*] Ouverture du panel en ligne (Netlify)...
    start "" "https://bot-control-panel.netlify.app"
    exit
)
if "%choice%"=="3" (
    echo.
    echo  [*] Ouverture du dashboard web (VPS)...
    start "" "http://31.220.79.90:3721"
    exit
)
if "%choice%"=="4" exit

echo.
echo  [!] Choix invalide.
pause
