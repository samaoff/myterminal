# Quita solo los adaptadores virtuales que instaló MyTerminal (los registrados en driver-owned.json).
$ErrorActionPreference='Stop'
$logRoot=Join-Path $env:ProgramData 'AI Terminal Pro'
try{
  if(-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Se requieren permisos de administrador'}
  $owned=Join-Path $logRoot 'driver-owned.json'
  if(-not (Test-Path -LiteralPath $owned)){throw 'Este controlador no lo instaló MyTerminal; no se quita.'}
  $ids=@((Get-Content -Raw -LiteralPath $owned | ConvertFrom-Json).instances)
  foreach($id in $ids){ & pnputil.exe /remove-device "$id" | Out-Null }
  Remove-Item -LiteralPath $owned -Force
  Add-Content -LiteralPath (Join-Path $logRoot 'driver-install.log') -Value ("Controlador quitado: " + (Get-Date -Format o))
  exit 0
}catch{
  try{New-Item -ItemType Directory -Force -Path $logRoot | Out-Null;Add-Content -LiteralPath (Join-Path $logRoot 'driver-install.log') -Value $_.Exception.Message}catch{}
  [Console]::Error.WriteLine($_.Exception.Message); exit 1
}
