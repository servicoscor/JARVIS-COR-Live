param(
  [string]$RepoPath = "C:\JARVIS-COR-Live",
  [string]$Branch = "main",
  [string]$BindHost = "0.0.0.0",
  [int]$Port = 4173,
  [int]$IntervalSeconds = 60
)

$ErrorActionPreference = "Stop"
$deployScript = Join-Path $RepoPath "scripts\server-pull-deploy.ps1"

Write-Host "Monitorando origin/$Branch a cada $IntervalSeconds segundos..."

while ($true) {
  try {
    & $deployScript -RepoPath $RepoPath -Branch $Branch -BindHost $BindHost -Port $Port
  } catch {
    Write-Host "Erro no deploy: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $IntervalSeconds
}
