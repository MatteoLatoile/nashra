param(
  [switch]$Production,
  [string]$Url = ''
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath '.\desktop\package.json')) {
  throw 'Lance cette commande dans le dossier racine de Nashra après avoir extrait le ZIP.'
}

Write-Host '1/3 Installation des dépendances Electron...' -ForegroundColor Cyan
& npm install --prefix .\desktop
if ($LASTEXITCODE -ne 0) { throw 'npm install a échoué.' }

Write-Host '2/3 Vérification du projet...' -ForegroundColor Cyan
& npm run check --prefix .\desktop
if ($LASTEXITCODE -ne 0) { throw 'Tests échoués.' }

Write-Host '3/3 Génération de l’installeur Windows...' -ForegroundColor Cyan
if ($Production) {
  if ([string]::IsNullOrWhiteSpace($Url)) { throw 'Pour la production, passe -Url https://ton-domaine.com/dashboard' }
  $env:NASHRA_DESKTOP_URL = $Url
  & npm run dist:win --prefix .\desktop
} else {
  & npm run dist:win:local --prefix .\desktop
}
if ($LASTEXITCODE -ne 0) { throw 'La génération de l’installeur a échoué.' }

Write-Host 'Installeur créé dans : .\desktop-dist\' -ForegroundColor Green
Get-ChildItem -Path .\desktop-dist\Nashra*Setup*.exe | Select-Object FullName, Length
