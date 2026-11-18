# =============================================================================
# Pubblicazione automatica su Cloudflare Workers (scarica Node.js portatile se manca)
# =============================================================================

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  ELEGOO CENTAURI CARBON 2 - PUBBLICAZIONE AUTOMATICA SU CLOUDFLARE" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Normalizza automaticamente il nome in wrangler.toml (Cloudflare accetta solo lettere minuscole, numeri e trattini)
$TomlPath = Join-Path $ScriptDir "wrangler.toml"
if (Test-Path $TomlPath) {
    $tomlContent = [System.IO.File]::ReadAllText($TomlPath, [System.Text.Encoding]::UTF8)
    if ($tomlContent -match 'name\s*=\s*"([^"]+)"') {
        $rawName = $Matches[1]
        $cleanName = $rawName.ToLowerInvariant() -replace '[^a-z0-9\-]', '-' -replace '\-+', '-'
        $cleanName = $cleanName.Trim('-')
        if ($rawName -cne $cleanName) {
            Write-Host "[INFO] Cloudflare richiede nomi tutti in minuscolo: '$rawName' -> '$cleanName'" -ForegroundColor Yellow
            $tomlContent = $tomlContent -replace 'name\s*=\s*"[^"]+"', "name = `"$cleanName`""
            [System.IO.File]::WriteAllText($TomlPath, $tomlContent, [System.Text.Encoding]::UTF8)
        }
    }
}

# 1. Cerca Node.js sul sistema o nella cartella locale .tools
$ToolsDir = Join-Path $ScriptDir ".tools"
$NodeDir  = Join-Path $ToolsDir "node-v22.14.0-win-x64"
$NodeExe  = Join-Path $NodeDir "node.exe"
$NpxCmd   = Join-Path $NodeDir "npx.cmd"

$sysNode = Get-Command node -ErrorAction SilentlyContinue
if ($null -ne $sysNode) {
    $NpxCmd = "npx.cmd"
    Write-Host "[OK] Node.js rilevato nel sistema." -ForegroundColor Green
} else {
    if (-not (Test-Path $NodeExe)) {
        Write-Host "[1/3] Scarico Node.js Portatile..." -ForegroundColor Yellow
        if (-not (Test-Path $ToolsDir)) {
            New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
        }
        $ZipPath = Join-Path $ToolsDir "node.zip"
        $NodeUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip"

        Invoke-WebRequest -Uri $NodeUrl -OutFile $ZipPath -UseBasicParsing
        Write-Host "      Estrazione di Node.js Portatile in corso..." -ForegroundColor Yellow
        Expand-Archive -Path $ZipPath -DestinationPath $ToolsDir -Force
        Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Node.js Portatile pronto!" -ForegroundColor Green
    } else {
        Write-Host "[OK] Node.js Portatile pronto." -ForegroundColor Green
    }

    $env:PATH = "$NodeDir;$env:PATH"
}

Write-Host ""
Write-Host "[2/3] Verifica sessione Cloudflare e pubblicazione della Web App..." -ForegroundColor Cyan

$deployOut = (& $NpxCmd --yes wrangler@latest deploy 2>&1 | Tee-Object -Variable deployLines)
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Sessione Cloudflare non attiva, apro il login nel browser..." -ForegroundColor Yellow
    & $NpxCmd --yes wrangler@latest login
    Write-Host ""
    Write-Host "Riprovo la pubblicazione..." -ForegroundColor Cyan
    $deployOut = (& $NpxCmd --yes wrangler@latest deploy 2>&1 | Tee-Object -Variable deployLines)
}

if ($LASTEXITCODE -eq 0) {
    $deployText = ($deployOut | Out-String)
    if ($deployText -match '(https://[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-]+\.workers\.dev)') {
        $workerUrl = $Matches[1].TrimEnd('/')
        $DataDir = Join-Path $ScriptDir "data"
        if (-not (Test-Path $DataDir)) {
            New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
        }
        $CloudUrlFile = Join-Path $DataDir "cloud_url.txt"
        [System.IO.File]::WriteAllText($CloudUrlFile, $workerUrl, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "[OK] URL personale salvato in locale in data\cloud_url.txt: $workerUrl" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host "  PUBBLICAZIONE COMPLETATA CON SUCCESSO!" -ForegroundColor Green
    Write-Host "  La Web App e' sincronizzata automaticamente con la app PC." -ForegroundColor Yellow
    Write-Host "============================================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERRORE] Si e' verificato un problema durante il deploy." -ForegroundColor Red
}

Write-Host ""
