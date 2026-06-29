$ErrorActionPreference = "Stop"
$DbPort = 5433
$DatabaseUrl = "postgresql://postgres:postgres@localhost:$DbPort/imagion_ai_radar?schema=public"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Test-Port($port) {
  $result = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
  return [bool]$result.TcpTestSucceeded
}

Write-Step "Checking .env"
if (!(Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "Created .env from .env.example. Review secrets when you can." -ForegroundColor Yellow
}

$envContent = Get-Content -Raw -LiteralPath ".env"
if ($envContent -match '(?m)^DATABASE_URL=') {
  $envContent = $envContent -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=""$DatabaseUrl"""
} else {
  $envContent = "DATABASE_URL=""$DatabaseUrl""" + [Environment]::NewLine + $envContent
}
Set-Content -LiteralPath ".env" -Value $envContent -NoNewline
$env:DATABASE_URL = $DatabaseUrl

Write-Step "Checking Docker"
$dockerOk = $false
try {
  docker version *> $null
  $dockerOk = $true
} catch {
  $dockerOk = $false
}

if (!$dockerOk) {
  Write-Host "Docker is not running or is not accessible." -ForegroundColor Red
  Write-Host "Open Docker Desktop from the Start menu, wait until it says it is running, then execute this script again."
  exit 1
}

Write-Step "Starting PostgreSQL container"
docker compose up -d --force-recreate

Write-Step "Waiting for PostgreSQL on localhost:$DbPort"
$ready = $false
for ($i = 1; $i -le 30; $i++) {
  if (Test-Port $DbPort) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (!$ready) {
  Write-Host "PostgreSQL did not become ready on localhost:$DbPort." -ForegroundColor Red
  docker compose ps
  exit 1
}

Write-Step "Applying Prisma migrations"
try {
  npm.cmd run db:migrate
} catch {
  Write-Host "Prisma migration failed. If this is the first local run and the database volume was created with wrong credentials, run:" -ForegroundColor Red
  Write-Host "docker compose down -v"
  Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\dev-start.ps1"
  exit 1
}

Write-Step "Running seed"
try {
  npm.cmd run db:seed
} catch {
  Write-Host "Seed failed. Fix the database error above and run this script again." -ForegroundColor Red
  exit 1
}

Write-Step "Starting Next.js"
if (Test-Port 3000) {
  Write-Host "Port 3000 is already in use. Stop the previous dev server with Ctrl+C, then run this script again." -ForegroundColor Red
  exit 1
}
Write-Host "Open http://localhost:3000 and http://localhost:3000/admin"
npm.cmd run dev
