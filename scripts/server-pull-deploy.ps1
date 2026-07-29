param(
  [string]$RepoPath = "C:\JARVIS-COR-Live",
  [string]$Branch = "main",
  [string]$BindHost = "0.0.0.0",
  [int]$Port = 4173,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RepoPath)) {
  throw "Repositorio nao encontrado em $RepoPath"
}

Set-Location $RepoPath

Write-Host "Buscando atualizacoes do GitHub..."
git fetch origin $Branch

$local = (git rev-parse HEAD).Trim()
$remote = (git rev-parse "origin/$Branch").Trim()

if (($local -eq $remote) -and (-not $Force)) {
  Write-Host "Sem atualizacao nova. HEAD atual: $local"
  exit 0
}

Write-Host "Atualizando codigo para origin/$Branch..."
git checkout $Branch
git pull --ff-only origin $Branch

if (Test-Path "package-lock.json") {
  Write-Host "Instalando dependencias com npm ci..."
  npm ci
} else {
  Write-Host "Instalando dependencias com npm install..."
  npm install
}

Write-Host "Gerando build..."
npm run build

$pidFile = Join-Path $RepoPath ".jarvis-server.pid"
if (Test-Path $pidFile) {
  $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($oldPid) {
    $process = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
    if ($process) {
      Write-Host "Parando processo antigo PID $oldPid..."
      Stop-Process -Id ([int]$oldPid) -Force
    }
  }
}

Write-Host "Iniciando servidor em http://$BindHost`:$Port ..."
$env:HOST = $BindHost
$env:PORT = "$Port"
$server = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $RepoPath -WindowStyle Hidden -PassThru
Set-Content -Path $pidFile -Value $server.Id

Write-Host "Deploy concluido. PID: $($server.Id)"
Write-Host "Acesse: http://10.50.30.161:$Port/"
