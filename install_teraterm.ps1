# install_teraterm.ps1 — Installation automatique de Tera Term v5.6.2
# Télécharge, vérifie SHA256, installe silencieusement et crée un raccourci bureau

$ErrorActionPreference = "Stop"

$version = "5.6.2"
$arch = "x64"
$url = "https://github.com/TeraTermProject/teraterm/releases/download/v${version}/teraterm-${version}-${arch}.exe"
$expectedSha256 = "ce18ce457ac45f2ffb57bf1854c3458cb4dc766a60dde3793915dabcd181b901"
$tempDir = "$env:TEMP\teraterm_install"
$installerPath = "$tempDir\teraterm-${version}-${arch}.exe"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Tera Term v$version ($arch) Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Créer le dossier temporaire
if (!(Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

# 2. Télécharger l'installeur
Write-Host "[1/5] Téléchargement de Tera Term v$version..." -ForegroundColor Yellow
try {
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing
    $ProgressPreference = "Continue"
    Write-Host "  OK - $([math]::Round((Get-Item $installerPath).Length / 1MB, 1)) MB téléchargés" -ForegroundColor Green
} catch {
    Write-Host "  ERREUR: Téléchargement échoué - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Vérifier SHA256
Write-Host "[2/5] Vérification de l'intégrité (SHA256)..." -ForegroundColor Yellow
$actualHash = (Get-FileHash $installerPath -Algorithm SHA256).Hash.ToLower()
if ($actualHash -ne $expectedSha256.ToLower()) {
    Write-Host "  ERREUR: Hash incorrect!" -ForegroundColor Red
    Write-Host "  Attendu: $expectedSha256" -ForegroundColor Red
    Write-Host "  Obtenu:  $actualHash" -ForegroundColor Red
    exit 1
}
Write-Host "  OK - Intégrité vérifiée" -ForegroundColor Green

# 4. Installer silencieusement
Write-Host "[3/5] Installation de Tera Term..." -ForegroundColor Yellow
$installDir = "$env:ProgramFiles\teraterm5"
try {
    $process = Start-Process -FilePath $installerPath -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/DIR=`"$installDir`"" -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Host "  ERREUR: Code sortie $($process.ExitCode)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK - Installé dans $installDir" -ForegroundColor Green
} catch {
    Write-Host "  ERREUR: Installation échouée - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 5. Créer un raccourci sur le bureau
Write-Host "[4/5] Création du raccourci bureau..." -ForegroundColor Yellow
$exePath = "$installDir\ttermpro.exe"
if (Test-Path $exePath) {
    $shortcutPath = "$env:USERPROFILE\Desktop\Tera Term.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.IconLocation = $exePath
    $shortcut.Description = "Tera Term v$version - Terminal Emulator"
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Save()
    Write-Host "  OK - Raccourci créé sur le bureau" -ForegroundColor Green
} else {
    Write-Host "  ATTENTION: ttermpro.exe non trouvé dans $installDir" -ForegroundColor DarkYellow
}

# 6. Nettoyer
Write-Host "[5/5] Nettoyage..." -ForegroundColor Yellow
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Tera Term v$version installe avec succes!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Executable: $exePath" -ForegroundColor White
Write-Host "  Raccourci:  Bureau > Tera Term" -ForegroundColor White
Write-Host ""
Write-Host "  Fonctionnalites:" -ForegroundColor Cyan
Write-Host "    - SSH1/SSH2 (TTSSH)" -ForegroundColor White
Write-Host "    - Telnet" -ForegroundColor White
Write-Host "    - Port serie (COM)" -ForegroundColor White
Write-Host "    - Transfert: ZMODEM, Kermit, B-Plus" -ForegroundColor White
Write-Host "    - Macros TTL (Tera Term Language)" -ForegroundColor White
Write-Host "    - Multi-langue (JP/EN/FR/DE/CN/KR/RU/ES/IT/PT/PL/TR)" -ForegroundColor White
Write-Host ""
Write-Host "  Documentation: https://teratermproject.github.io/manual/5/" -ForegroundColor Cyan
Write-Host "  Repo GitHub:   https://github.com/TeraTermProject/teraterm" -ForegroundColor Cyan
Write-Host ""
