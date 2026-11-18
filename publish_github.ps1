# =============================================================================
# Pubblicazione automatica su GitHub (scarica Git e GitHub CLI portatili)
# =============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$ToolsDir   = Join-Path $ScriptDir ".tools"
$MinGitDir  = Join-Path $ToolsDir "mingit"
$GhDir      = Join-Path $ToolsDir "gh"
$StageDir   = Join-Path $ToolsDir "release_stage"
$ReleaseZip = Join-Path $ToolsDir "Your_Filament_Manager_v1.2.0_Windows.zip"

$RepoName        = "Your-Filament-Manager"
$RepoDescription = "Your Filament Manager — Automatic 4-Slot Canvas & Spool Weight Tracker for Elegoo Centauri Carbon 2 (100% Local Windows App + QR-Locked Mobile PWA). By Giulio Cantarelli."
$RepoHomepage    = "https://ko-fi.com/giuliocantarelli"
$ReleaseTag      = "v1.2.0"

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  YOUR FILAMENT MANAGER - PUBBLICAZIONE AUTOMATICA SU GITHUB" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $ToolsDir)) {
    New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
}

function Resolve-GitExe {
    $sys = Get-Command git -ErrorAction SilentlyContinue
    if ($null -ne $sys) { return $sys.Source }
    $portable = Join-Path $MinGitDir "cmd\git.exe"
    if (Test-Path $portable) { return $portable }
    return $null
}

function Resolve-GhExe {
    $sys = Get-Command gh -ErrorAction SilentlyContinue
    if ($null -ne $sys) { return $sys.Source }
    $found = Get-ChildItem -Path $GhDir -Filter "gh.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $found) { return $found.FullName }
    return $null
}

# 1. Prepara Git portatile se non installato
$GitExe = Resolve-GitExe
if (-not $GitExe) {
    Write-Host "[1/5] Scarico Git Portatile (MinGit)..." -ForegroundColor Yellow
    $gitRel = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers @{ "User-Agent" = "YourFilamentManager-Publisher" }
    $gitAsset = $gitRel.assets | Where-Object { $_.name -match '^MinGit-.*-64-bit\.zip$' -and $_.name -notmatch 'busybox' } | Select-Object -First 1
    if (-not $gitAsset) { throw "Impossibile trovare asset MinGit 64-bit su GitHub." }

    $gitZip = Join-Path $ToolsDir "mingit.zip"
    Invoke-WebRequest -Uri $gitAsset.browser_download_url -OutFile $gitZip -UseBasicParsing
    if (Test-Path $MinGitDir) { Remove-Item $MinGitDir -Recurse -Force }
    Expand-Archive -Path $gitZip -DestinationPath $MinGitDir -Force
    Remove-Item $gitZip -Force -ErrorAction SilentlyContinue
    $GitExe = Resolve-GitExe
    if (-not $GitExe) { throw "git.exe non trovato dopo l'estrazione." }
    Write-Host "[OK] Git Portatile pronto." -ForegroundColor Green
} else {
    Write-Host "[OK] Git rilevato." -ForegroundColor Green
}

# 2. Prepara GitHub CLI (gh) portatile se non installato
$GhExe = Resolve-GhExe
if (-not $GhExe) {
    Write-Host "[2/5] Scarico GitHub CLI Portatile..." -ForegroundColor Yellow
    $ghRel = Invoke-RestMethod -Uri "https://api.github.com/repos/cli/cli/releases/latest" -Headers @{ "User-Agent" = "YourFilamentManager-Publisher" }
    $ghAsset = $ghRel.assets | Where-Object { $_.name -match '^gh_.*_windows_amd64\.zip$' } | Select-Object -First 1
    if (-not $ghAsset) { throw "Impossibile trovare asset GitHub CLI windows_amd64." }

    $ghZip = Join-Path $ToolsDir "gh.zip"
    Invoke-WebRequest -Uri $ghAsset.browser_download_url -OutFile $ghZip -UseBasicParsing
    if (Test-Path $GhDir) { Remove-Item $GhDir -Recurse -Force }
    Expand-Archive -Path $ghZip -DestinationPath $GhDir -Force
    Remove-Item $ghZip -Force -ErrorAction SilentlyContinue
    $GhExe = Resolve-GhExe
    if (-not $GhExe) { throw "gh.exe non trovato dopo l'estrazione." }
    Write-Host "[OK] GitHub CLI pronto." -ForegroundColor Green
} else {
    Write-Host "[OK] GitHub CLI rilevato." -ForegroundColor Green
}

# Aggiungi Git al PATH per gh
$GitCmdDir = Split-Path -Parent $GitExe
$env:PATH = "$GitCmdDir;$env:PATH"

# 3. Inizializza repository Git locale e verifica privacy prima del commit
Write-Host ""
Write-Host "[3/5] Preparazione repository e controllo privacy..." -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $ScriptDir ".git"))) {
    & $GitExe init -b main | Out-Null
}

& $GitExe config user.name "Giulio Cantarelli"
& $GitExe config user.email "giuliocantarelli@users.noreply.github.com"

& $GitExe add -A

$stagedFiles = & $GitExe diff --cached --name-only
$allTracked = @(& $GitExe ls-files) + @($stagedFiles) | Select-Object -Unique
foreach ($f in $allTracked) {
    if ($f -match '^(data/|\.wrangler/|\.tools/|node_modules/)' -or $f -match '(filament_db|slicer_pairing|cloud_url\.txt)') {
        throw "BLOCCO PRIVACY: file privato individuato in staging ($f). Pubblicazione annullata!"
    }
}

$hasPending = (& $GitExe status --porcelain)
$hasCommit = $false
try {
    & $GitExe rev-parse --verify HEAD 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $hasCommit = $true }
} catch {}

if (-not $hasCommit -or $hasPending) {
    & $GitExe commit -m "Initial release: Your Filament Manager (AGPLv3 + Commons Clause)" | Out-Null
}
Write-Host "[OK] Commit pronto e verificato (nessun dato personale incluso)." -ForegroundColor Green

# 4. Prepara pacchetto ZIP pulito per la Release Windows
Write-Host ""
Write-Host "[4/5] Creazione pacchetto release pulito per Windows..." -ForegroundColor Cyan
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
if (Test-Path $ReleaseZip) { Remove-Item $ReleaseZip -Force }
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

$releaseItems = @(
    "Elegoo_Filament_App.exe",
    "Avvia_Elegoo_Filament.bat",
    "Pubblica_Su_Cloudflare.bat",
    "deploy_cloudflare.ps1",
    "worker.js",
    "wrangler.toml",
    "app.manifest",
    "AppLauncher.cs",
    "LICENSE",
    "README.md",
    "public"
)

foreach ($item in $releaseItems) {
    $src = Join-Path $ScriptDir $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $StageDir $item) -Recurse -Force
    }
}

[System.IO.Compression.ZipFile]::CreateFromDirectory($StageDir, $ReleaseZip)
Remove-Item $StageDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Archivio release pronto: $ReleaseZip" -ForegroundColor Green

# 5. Login GitHub (se necessario) e creazione/aggiornamento Repository + Release
Write-Host ""
Write-Host "[5/5] Collegamento al tuo account GitHub e pubblicazione..." -ForegroundColor Cyan

$ErrorActionPreference = "Continue"
& $GhExe auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Devi collegare il tuo account GitHub (basta una sola volta):" -ForegroundColor Yellow
    Write-Host "  1. Quando premi INVIO, si aprira' github.com nel tuo browser." -ForegroundColor White
    Write-Host "  2. Il codice a 8 caratteri viene copiato negli appunti: fai Ctrl+V nel browser e clicca Authorize." -ForegroundColor White
    Write-Host ""
    & $GhExe auth login --hostname github.com --git-protocol https --web --clipboard
    if ($LASTEXITCODE -ne 0) {
        throw "Accesso a GitHub non completato."
    }
}

& $GhExe auth setup-git | Out-Null

$ghUser = (& $GhExe api user --jq ".login" 2>$null).Trim()
if (-not $ghUser) { throw "Impossibile leggere lo username GitHub." }

$fullRepo = "$ghUser/$RepoName"
& $GhExe repo view $fullRepo 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creo la repository pubblica https://github.com/$fullRepo ..." -ForegroundColor Cyan
    & $GhExe repo create $RepoName --public --description $RepoDescription --homepage $RepoHomepage --source $ScriptDir --remote origin --push
} else {
    Write-Host "Repository https://github.com/$fullRepo trovata: aggiorno codice e dettagli..." -ForegroundColor Cyan
    $existingRemote = (& $GitExe remote 2>$null) -contains "origin"
    if (-not $existingRemote) {
        & $GitExe remote add origin "https://github.com/$fullRepo.git"
    }
    & $GitExe push -u origin main
    & $GhExe repo edit $fullRepo --description $RepoDescription --homepage $RepoHomepage
}

& $GhExe repo edit $fullRepo --add-topic "elegoo" --add-topic "centauri-carbon" --add-topic "3d-printing" --add-topic "filament-tracker" --add-topic "elegoo-slicer" 2>&1 | Out-Null

& $GhExe release view $ReleaseTag --repo $fullRepo 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pubblico la Release Windows $ReleaseTag..." -ForegroundColor Cyan
    $releaseNotes = @"
## Your Filament Manager $ReleaseTag

- **100% Local Windows Desktop App** (``Elegoo_Filament_App.exe``)
- **Automatic 4-Slot Elegoo Canvas & Spool Weight Tracking**
- **Optional QR-Locked Mobile PWA** on Cloudflare Workers
- **English / Italian UI Switcher**

### Quick Install
1. Download ``Your_Filament_Manager_v1.2.0_Windows.zip`` below and extract all files into one folder.
2. Double-click ``Elegoo_Filament_App.exe``.

---
**Author:** Giulio Cantarelli | **Ko-fi:** https://ko-fi.com/giuliocantarelli | **MakerWorld:** https://makerworld.com/it/@IlCanta96
"@
    & $GhExe release create $ReleaseTag $ReleaseZip --repo $fullRepo --title "Your Filament Manager $ReleaseTag (Windows)" --notes $releaseNotes
} else {
    & $GhExe release upload $ReleaseTag $ReleaseZip --repo $fullRepo --clobber
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "  PUBBLICAZIONE SU GITHUB COMPLETATA!" -ForegroundColor Green
Write-Host "  La tua pagina pubblica: https://github.com/$fullRepo" -ForegroundColor Yellow
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Start-Process "https://github.com/$fullRepo"
