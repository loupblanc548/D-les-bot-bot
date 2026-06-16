@echo off
chcp 65001 >nul
title Redemarrage - John Helldiver Bot
cd /d "%~dp0"

echo ============================================
echo   REDEMARRAGE DU BOT (PM2)
echo ============================================
echo.

:: Verification PM2
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] PM2 n'est pas installe.
    pause
    exit /b 1
)

:: Verification node_modules
if not exist "node_modules\" (
    echo [INFO] Installation des dependances...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec du npm install.
        pause
        exit /b 1
    )
)

:: Nettoyage des processus fantomes puis redemarrage propre
echo [INFO] Nettoyage des anciens processus PM2...
call pm2 delete john-helldiver >nul 2>&1
echo [INFO] Redemarrage du bot...
call pm2 start ecosystem.config.cjs

if %errorlevel% neq 0 (
    echo [ERREUR] Echec du redemarrage PM2.
    pause
    exit /b 1
)

:: Sauvegarde de la config PM2
call pm2 save

echo.
echo ============================================
echo   Bot redemarre avec succes !
echo   Nom PM2 : john-helldiver
echo ============================================
echo.
pause
