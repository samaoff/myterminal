// Controlador de pantalla virtual (Virtual Display Driver, licencia MIT): comprobación y preparación.
// La instalación pide permisos de administrador a Windows y verifica el hash y la firma de cada archivo antes de usarlo.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const run = promisify(execFile);

function resources(app) { return app.isPackaged ? path.join(process.resourcesPath, 'driver') : path.join(__dirname, 'driver'); }
const logFile = 'C:\\ProgramData\\AI Terminal Pro\\driver-install.log';

// 'missing' (no instalado), 'disabled' (instalado pero sin iniciar) o 'ready'.
async function status() {
  const code = "$d=@(Get-CimInstance Win32_PnPEntity -Filter \"PNPClass='Display'\" | Where-Object { @($_.HardwareID) -contains 'Root\\MttVDD' -or @($_.HardwareID) -contains 'MttVDD' }); if($d.Count -eq 0){'missing'}elseif(@($d | Where-Object ConfigManagerErrorCode -eq 0).Count -gt 0){'ready'}else{'disabled'}";
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { windowsHide: true, timeout: 20000 });
  return stdout.trim();
}

async function elevated(app, file, failure) {
  const script = path.join(resources(app), file);
  if (!fs.existsSync(script)) throw new Error('No se encuentra el script incluido. Reinstala MyTerminal.');
  const quoted = script.replace(/'/g, "''");
  const command = "$p=Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + quoted + "\"' -Wait -PassThru; exit $p.ExitCode";
  try { await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, timeout: 180000 }); }
  catch { throw new Error(failure + ' Consulta ' + logFile + '.'); }
  return status();
}
const uninstall = app => elevated(app, 'uninstall-driver.ps1', 'No se pudo quitar la pantalla virtual.');

async function install(app) {
  const script = path.join(resources(app), 'install-driver.ps1');
  if (!fs.existsSync(script)) throw new Error('No se encuentra el controlador incluido. Reinstala MyTerminal.');
  const quoted = script.replace(/'/g, "''");
  const command = "$p=Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + quoted + "\"' -Wait -PassThru; exit $p.ExitCode";
  try { await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, timeout: 180000 }); }
  catch { throw new Error('Instalación cancelada o incompleta. Consulta ' + logFile + '.'); }
  return status();
}

module.exports = { status, install, uninstall, resources };
