// Fuentes de captura de la segunda pantalla: la ventana de la aplicación y las pantallas de Windows.
// Las pantallas virtuales (Virtual Display Driver) permiten además cambiar la resolución desde aquí.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { matchDevice } = require('./policy.cjs');
const run = promisify(execFile);

const virtualDescription = /Virtual Display|MttVDD|IddSample/i;

// Con la aplicación empaquetada el script debe estar fuera del asar para que PowerShell pueda leerlo.
async function native(args = []) {
  const root = __dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'set-resolution.ps1'), ...args], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout.replace(/^\uFEFF/, ''));
}

async function getSources({ desktopCapturer, screen, ownWindow }) {
  const [sources, devices] = await Promise.all([
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 } }),
    native().catch(() => [])
  ]);
  const ownId = ownWindow && !ownWindow.isDestroyed() ? ownWindow.getMediaSourceId() : null;
  const result = [];
  for (const source of sources) {
    if (source.id.startsWith('window:')) {
      if (source.id !== ownId) continue;
      const bounds = ownWindow.getContentBounds();
      const factor = screen.getDisplayMatching(ownWindow.getBounds()).scaleFactor || 1;
      const width = Math.round(bounds.width * factor), height = Math.round(bounds.height * factor);
      result.push({ id: source.id, kind: 'window', name: 'Esta ventana (MyTerminal)', primary: false, size: width + ' × ' + height, width, height, device: null, displayId: null, virtual: false, modes: [], thumbnail: source.thumbnail.toDataURL() });
      continue;
    }
    const display = screen.getAllDisplays().find(entry => String(entry.id) === source.display_id);
    const bounds = display ? screen.dipToScreenRect(null, display.bounds) : null;
    const device = bounds ? matchDevice(devices, bounds) : null;
    const width = device?.Width || Math.round((display?.size.width || 1920) * (display?.scaleFactor || 1));
    const height = device?.Height || Math.round((display?.size.height || 1080) * (display?.scaleFactor || 1));
    const primary = display?.id === screen.getPrimaryDisplay().id;
    // Sin datos de Windows se reconoce por la etiqueta del monitor, pero no se podrá cambiar su resolución.
    const virtual = device ? !device.Primary && virtualDescription.test(device.Description) : false;
    result.push({ id: source.id, kind: 'screen', name: source.name, primary, size: width + ' × ' + height, width, height, device: device?.Device || null, displayId: display ? display.id : null, virtual, labelVirtual: !device && /vdd|mtt|virtual/i.test(display?.label || ''), modes: virtual ? device.Modes : [], thumbnail: source.thumbnail.toDataURL() });
  }
  return result.sort((a, b) => (a.kind === 'window' ? -1 : 0) - (b.kind === 'window' ? -1 : 0));
}

async function setResolution({ desktopCapturer, screen, ownWindow, id, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 640 || height < 480 || width > 3840 || height > 3840) throw new Error('Resolución no válida');
  const selected = (await getSources({ desktopCapturer, screen, ownWindow })).find(source => source.id === id);
  if (!selected?.virtual) throw new Error('Selecciona una pantalla virtual. Los monitores físicos no se modifican.');
  if (!selected.modes.some(mode => mode.width === width && mode.height === height)) throw new Error('Selecciona una resolución compatible de la lista');
  await native(['-DeviceName', selected.device, '-Width', String(width), '-Height', String(height)]);
  return { device: selected.device, width, height };
}

module.exports = { native, getSources, setResolution };
