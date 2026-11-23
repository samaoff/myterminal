// Endurecimiento de Electron: solo la página de la aplicación puede usar los canales IPC,
// los permisos del navegador se deniegan salvo el portapapeles, y ninguna ventana nueva ni navegación es posible.
const path = require('node:path');
const { fileURLToPath } = require('node:url');

// Un marco es de confianza si carga exactamente el index.html de la aplicación.
function isTrustedUrl(url, indexPath) {
  if (typeof url !== 'string' || !url.startsWith('file:')) return false;
  try { return path.resolve(fileURLToPath(url)).toLowerCase() === path.resolve(indexPath).toLowerCase(); } catch { return false; }
}

const allowedPermissions = new Set(['clipboard-read', 'clipboard-sanitized-write']);
// La ventana oculta de captura de la segunda pantalla es la única que puede pedir captura de pantalla.
const capturePermissions = new Set(['display-capture', 'media']);
function permissionAllowed(permission, url, indexPath, captureFile) {
  if (captureFile && capturePermissions.has(permission) && isTrustedUrl(url, captureFile)) return true;
  return allowedPermissions.has(permission) && isTrustedUrl(url, indexPath);
}

// Envuelve ipcMain.handle y ipcMain.on antes de registrar los canales.
// extraChannels: canales concretos que además puede usar otra página de la aplicación (por ejemplo la captura oculta).
function guardIpc(ipcMain, indexPath, extraChannels = {}) {
  const urlOf = event => event.senderFrame?.url || event.sender?.getURL?.() || '';
  const trustedFor = channel => event => isTrustedUrl(urlOf(event), extraChannels[channel] || indexPath);
  const originalHandle = ipcMain.handle.bind(ipcMain), originalOn = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (channel, listener) => originalHandle(channel, (event, ...args) => {
    if (!trustedFor(channel)(event)) throw new Error('Origen no autorizado para ' + channel + '.');
    return listener(event, ...args);
  });
  ipcMain.on = (channel, listener) => originalOn(channel, (event, ...args) => {
    if (!trustedFor(channel)(event)) { if (event.returnValue === undefined) event.returnValue = null; return; }
    return listener(event, ...args);
  });
}

function hardenSession(electronSession, indexPath, captureFile) {
  electronSession.setPermissionRequestHandler((contents, permission, callback) => callback(permissionAllowed(permission, contents.getURL(), indexPath, captureFile)));
  electronSession.setPermissionCheckHandler((contents, permission, origin) => permissionAllowed(permission, contents?.getURL?.() || origin, indexPath, captureFile));
}

// Cualquier contenido web futuro nace sin navegación, sin ventanas nuevas y sin webviews.
function hardenContents(app) {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', event => event.preventDefault());
    contents.on('will-attach-webview', event => event.preventDefault());
  });
}

module.exports = { isTrustedUrl, permissionAllowed, guardIpc, hardenSession, hardenContents };
