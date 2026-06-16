@echo off
chcp 65001 >nul
title Arret - John Helldiver Bot
cd /d "%~dp0"

echo ============================================
echo   ARRET DU BOT (PM2)
echo ============================================
echo.

:: Verification PM2
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] PM2 n'est pas installe.
    pause
    exit /b 1
)

:: Verification si le bot tourne
pm2 list | findstr "john-helldiver" >nul
if %errorlevel% neq 0 (
    echo [INFO] Le bot n'est pas en cours d'execution dans PM2.
    pause
    exit /b 0
)

:: Arret du bot
echo [INFO] Arret du bot...
call pm2 stop john-helldiver

if %errorlevel% neq 0 (
    echo [ERREUR] Echec de l'arret du bot.
    pause
    exit /b 1
)

:: Sauvegarde de la config PM2
call pm2 save

echo.
echo ============================================
echo   Bot arrete avec succes !
echo ============================================
echo.
pause
