@echo off
chcp 65001 >nul
title Demarrage - John Helldiver Bot
cd /d "%~dp0"

echo ============================================
echo   DEMARRAGE DU BOT (PM2)
echo ============================================
echo.

:: Verification Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
    pause
    exit /b 1
)

:: Verification PM2
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] PM2 n'est pas installe globalement. Installation...
    call npm install -g pm2
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec de l'installation de PM2.
        pause
        exit /b 1
    )
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

:: Generation Prisma
if not exist "node_modules\.prisma\" (
    echo [INFO] Generation du client Prisma...
    call npx prisma generate
)

:: Nettoyage des processus fantomes puis demarrage propre
echo [INFO] Nettoyage des anciens processus PM2...
call pm2 delete john-helldiver >nul 2>&1
echo [INFO] Demarrage du bot via PM2...
call pm2 start ecosystem.config.cjs

if %errorlevel% neq 0 (
    echo [ERREUR] Echec du demarrage PM2.
    pause
    exit /b 1
)

:: Sauvegarde de la config PM2
call pm2 save

echo.
echo ============================================
echo   Bot demarre avec succes !
echo   Nom PM2 : john-helldiver
echo   Logs    : pm2 logs john-helldiver
echo ============================================
echo.
pause
