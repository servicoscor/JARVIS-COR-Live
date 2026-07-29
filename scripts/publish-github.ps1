param(
  [string]$Message = "Atualiza JARVIS COR",
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"

if (-not $Branch) {
  $Branch = (git branch --show-current).Trim()
}

if (-not $Branch) {
  throw "Nao foi possivel descobrir a branch atual."
}

Write-Host "Branch: $Branch"
Write-Host "Sincronizando com origin/$Branch..."
git pull --rebase origin $Branch

$changes = (git status --porcelain)
if ($changes) {
  Write-Host "Commitando alteracoes locais..."
  git add -A
  git commit -m $Message
} else {
  Write-Host "Sem alteracoes locais para commitar."
}

Write-Host "Enviando para GitHub..."
git push origin $Branch
Write-Host "Publicado em origin/$Branch."
