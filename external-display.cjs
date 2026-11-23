// Pantalla externa: describe los monitores disponibles y localiza «Al lado», la aplicación que convierte un iPad en segunda pantalla.
const fs = require('node:fs');
const path = require('node:path');

// El controlador de pantalla virtual que usa Al lado se presenta como «VDD by MTT» / «Virtual Display».
const virtualLabel = /\b(vdd|mtt|virtual|iddsample|spacedesk|indirect)\b/i;

function describeDisplays(displays, primaryId, currentId) {
  return displays.map((display, index) => {
    const label = String(display.label || '').trim();
    const width = Math.round((display.size?.width || display.bounds?.width || 0) * (display.scaleFactor || 1));
    const height = Math.round((display.size?.height || display.bounds?.height || 0) * (display.scaleFactor || 1));
    return {
      id: display.id,
      name: label || 'Pantalla ' + (index + 1),
      width, height,
      primary: display.id === primaryId,
      current: display.id === currentId,
      virtual: virtualLabel.test(label)
    };
  });
}

// Rutas habituales de Al lado: instalación para todos los usuarios, para el usuario actual y la ruta que haya elegido la persona.
function alLadoCandidates(env, savedPath) {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432].filter(Boolean).map(dir => path.join(dir, 'Al lado', 'Al lado.exe'));
  if (env.LOCALAPPDATA) roots.push(path.join(env.LOCALAPPDATA, 'Programs', 'Al lado', 'Al lado.exe'));
  return [savedPath, ...roots].filter(Boolean);
}
function findAlLado({ env = process.env, savedPath = '', exists = file => { try { return fs.statSync(file).isFile(); } catch { return false; } } } = {}) {
  return alLadoCandidates(env, savedPath).find(file => /\.exe$/i.test(file) && exists(file)) || null;
}

// Validación del identificador que llega desde la ventana.
function pickDisplay(displays, requestedId) {
  return Number.isInteger(requestedId) ? displays.find(display => display.id === requestedId) || null : null;
}

module.exports = { describeDisplays, findAlLado, alLadoCandidates, pickDisplay, virtualLabel };
