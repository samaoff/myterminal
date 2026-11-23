param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$bundleRoot=$PSScriptRoot
$logRoot=Join-Path $env:ProgramData 'AI Terminal Pro'
function Get-Vdd { @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Display'" | Where-Object { @($_.HardwareID) -contains 'Root\MttVDD' -or @($_.HardwareID) -contains 'MttVDD' } | ForEach-Object { Get-PnpDevice -InstanceId $_.PNPDeviceID -ErrorAction Stop }) }
try {
  if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Este instalador requiere Windows x64.' }
  foreach($item in @('MttVDD.inf','MttVDD.dll','mttvdd.cat','vdd_settings.xml','nefconw.exe')) {
    if(-not (Test-Path -LiteralPath (Join-Path $bundleRoot $item))){throw "Falta el archivo $item"}
  }
  $manifest=Get-Content -Raw -LiteralPath (Join-Path $bundleRoot 'hashes.json') | ConvertFrom-Json
  foreach($property in $manifest.PSObject.Properties){
    if((Get-FileHash -LiteralPath (Join-Path $bundleRoot $property.Name) -Algorithm SHA256).Hash -ne $property.Value){throw "Integridad incorrecta: $($property.Name)"}
  }
  foreach($item in @('mttvdd.cat','nefconw.exe')){
    if((Get-AuthenticodeSignature -LiteralPath (Join-Path $bundleRoot $item)).Status -ne 'Valid'){throw "Firma no valida: $item"}
  }
  if($CheckOnly){Write-Output 'Paquete verificado';exit 0}
  if(-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Se requieren permisos de administrador'}
  New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
  Start-Transcript -Path (Join-Path $logRoot 'driver-install.log') -Append | Out-Null
  $existing=Get-Vdd
  if($existing.Count -gt 0){
    foreach($device in $existing){if($device.Status -ne 'OK'){Enable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false}}
    Write-Output 'Controlador existente conservado. No se crea otro adaptador.'
  }else{
    $target=Join-Path $env:SystemDrive 'VirtualDisplayDriver'
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    foreach($item in @('MttVDD.inf','MttVDD.dll','mttvdd.cat')){Copy-Item -LiteralPath (Join-Path $bundleRoot $item) -Destination (Join-Path $target $item) -Force}
    if(-not (Test-Path -LiteralPath (Join-Path $target 'vdd_settings.xml'))){Copy-Item -LiteralPath (Join-Path $bundleRoot 'vdd_settings.xml') -Destination $target}
    & (Join-Path $bundleRoot 'nefconw.exe') install (Join-Path $target 'MttVDD.inf') 'Root\MttVDD'
    if($LASTEXITCODE -notin @(0,3010)){throw "Error de instalacion: $LASTEXITCODE"}
    Start-Sleep -Seconds 3
    $installed=Get-Vdd
    if($installed.Count -eq 0){throw 'Windows no ha detectado el adaptador virtual. Puede ser necesario reiniciar.'}
    @{installedBy='AI Terminal Pro';instances=@($installed | Select-Object -ExpandProperty InstanceId);date=(Get-Date -Format o)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logRoot 'driver-owned.json')
  }
  $final=Get-Vdd
  if(@($final | Where-Object Status -eq 'OK').Count -eq 0){throw 'El adaptador existe pero Windows no lo ha iniciado. Reinicia Windows y revisa el registro.'}
  Write-Output 'Controlador preparado.'
  Stop-Transcript | Out-Null
  exit 0
}catch{
  try{New-Item -ItemType Directory -Force -Path $logRoot | Out-Null;Add-Content -LiteralPath (Join-Path $logRoot 'driver-install.log') -Value $_.Exception.Message}catch{}
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
