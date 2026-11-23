// Segunda pantalla para iPad: coordina el servidor, la ventana oculta de captura y la resolución de las pantallas virtuales.
const os = require('node:os');
const path = require('node:path');
const QRCode = require('qrcode');
const { createServer } = require('./server.cjs');
const policy = require('./policy.cjs');
const displays = require('./displays.cjs');
const driver = require('./driver.cjs');

const PORTS = [3210, 3211, 3212, 3213];
const IDLE_STOP_MS = 30 * 60 * 1000;
const hostFile = path.join(__dirname, 'host.html');

function localAddresses() {
  const rank = address => (address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2);
  return Object.values(os.networkInterfaces()).flat()
    .filter(entry => entry && entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'))
    .map(entry => entry.address)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 4);
}

function create({ app, ipcMain, BrowserWindow, desktopCapturer, screen, session, shell, getWindow, loadPrefs, savePrefs }) {
  let server = null, hostWindow = null, hostReady = null, resolveHost = null, port = 0, idleTimer = null, lastViewerAt = Date.now(), busy = false;
  let source = null;
  const saved = loadPrefs() || {};
  const state = { running: false, starting: false, sourceId: null, sourceName: '', sourceKind: '', virtual: false, viewer: false, connection: '', width: 0, height: 0, paused: false, fit: saved.fit === 'cover' ? 'cover' : 'contain', autoFit: Boolean(saved.autoFit), device: null, urls: [], pin: '', error: '', notice: '' };

  const mainWindow = () => { const window = getWindow(); return window && !window.isDestroyed() ? window : null; };
  const snapshot = () => ({ ...state });
  function emit() { mainWindow()?.webContents.send('ss-event', snapshot()); }
  const remember = () => savePrefs({ fit: state.fit, autoFit: state.autoFit });
  const sendHost = command => { if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send('ss-host-command', command); };

  async function sources() { return displays.getSources({ desktopCapturer, screen, ownWindow: mainWindow() }); }

  // El permiso de captura solo existe mientras se arranca la captura y siempre entrega la fuente elegida por la persona.
  async function allowCapture(sourceId) {
    const all = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    const chosen = all.find(entry => entry.id === sourceId);
    if (!chosen) throw new Error('La pantalla elegida ya no está disponible. Actualiza la lista.');
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({ video: chosen }), { useSystemPicker: false });
    setTimeout(() => { try { session.defaultSession.setDisplayMediaRequestHandler(null); } catch { /* sin acción */ } }, 10000).unref();
  }

  async function createHost() {
    hostReady = new Promise(resolve => { resolveHost = resolve; });
    hostWindow = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { preload: path.join(__dirname, 'host-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    hostWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    hostWindow.on('closed', () => { hostWindow = null; });
    await hostWindow.loadFile(hostFile);
    await Promise.race([hostReady, new Promise((_, reject) => setTimeout(() => reject(new Error('La captura no ha arrancado.')), 8000))]);
  }

  function handleHostEvent(message) {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'host-ready') resolveHost?.();
    else if (message.type === 'signal' && message.message) server?.send(message.message);
    else if (message.type === 'status') {
      if (message.state === 'capturing') { state.width = message.width; state.height = message.height; state.error = ''; }
      if (message.state === 'peer') { state.connection = message.connection; if (message.width) { state.width = message.width; state.height = message.height; } }
      if (message.state === 'paused') state.paused = Boolean(message.paused);
      if (message.state === 'viewer-left') state.connection = '';
      emit();
    } else if (message.type === 'error') { state.error = String(message.message || 'Error de captura'); emit(); }
    else if (message.type === 'ended') { state.error = 'La captura se ha cerrado (la ventana o pantalla ya no está disponible).'; emit(); }
  }

  function handleViewerSignal(message) {
    sendHost({ type: 'signal', message });
    if (message.type === 'device') {
      state.device = { width: message.width, height: message.height, dpr: message.dpr };
      emit();
      if (state.autoFit) fitToDevice().catch(error => { state.error = error.message; emit(); });
    }
    if (message.type === 'bye') { state.device = null; state.viewer = false; emit(); }
  }

  function handleServerEvent(event) {
    if (event.type === 'viewer') { state.viewer = event.connected; if (!event.connected) state.connection = ''; lastViewerAt = Date.now(); emit(); }
  }

  async function connectionUrls() {
    const urls = [];
    for (const address of localAddresses()) {
      const url = 'http://' + address + ':' + port + '/';
      urls.push({ url, qr: await QRCode.toDataURL(url + '#' + server.token, { margin: 1, width: 220, errorCorrectionLevel: 'M' }) });
    }
    return urls;
  }

  async function listen(candidate) {
    await new Promise((resolve, reject) => { const onError = error => reject(error); server.server.once('error', onError); server.server.listen(candidate, '0.0.0.0', () => { server.server.removeListener('error', onError); resolve(); }); });
  }

  async function start(sourceId) {
    if (busy) throw new Error('Espera a que termine el cambio anterior.');
    busy = true;
    try {
      await stop(true);
      state.starting = true; state.error = ''; state.notice = ''; emit();
      const all = await sources();
      source = all.find(entry => entry.id === sourceId);
      if (!source) throw new Error('La pantalla elegida ya no está disponible. Actualiza la lista.');
      server = createServer({ assets: __dirname, onSignal: handleViewerSignal, onEvent: handleServerEvent });
      let bound = false, lastError = null;
      for (const candidate of PORTS) { try { await listen(candidate); port = candidate; bound = true; break; } catch (error) { lastError = error; server.server.removeAllListeners('listening'); } }
      if (!bound) { server.close(); server = null; throw new Error('No se pudo abrir el puerto de la segunda pantalla: ' + (lastError?.message || 'ocupado')); }
      state.urls = await connectionUrls();
      state.pin = server.pin;
      await createHost();
      await allowCapture(source.id);
      const size = policy.captureSize(source.width || 1920, source.height || 1080);
      sendHost({ type: 'start', width: size.width, height: size.height });
      sendHost({ type: 'fit', value: state.fit });
      Object.assign(state, { running: true, starting: false, sourceId: source.id, sourceName: source.name, sourceKind: source.kind, virtual: source.virtual, width: size.width, height: size.height, paused: false, connection: '', viewer: false, device: null });
      lastViewerAt = Date.now();
      clearInterval(idleTimer);
      idleTimer = setInterval(() => { if (state.running && !server?.viewerConnected() && Date.now() - lastViewerAt > IDLE_STOP_MS) { stop(false, 'La transmisión se detuvo por inactividad.').catch(() => {}); } }, 60000);
      idleTimer.unref?.();
      emit();
    } catch (error) {
      await stop(true);
      state.starting = false; state.error = error.message; emit();
      throw error;
    } finally { busy = false; }
  }

  async function stop(silent, notice) {
    clearInterval(idleTimer); idleTimer = null;
    try { sendHost({ type: 'stop' }); } catch { /* sin acción */ }
    if (hostWindow && !hostWindow.isDestroyed()) hostWindow.destroy();
    hostWindow = null;
    try { session.defaultSession.setDisplayMediaRequestHandler(null); } catch { /* sin acción */ }
    if (server) { server.close(); server = null; }
    Object.assign(state, { running: false, starting: false, viewer: false, connection: '', urls: [], pin: '', device: null, paused: false });
    if (notice) state.notice = notice;
    if (!silent) emit();
  }

  async function restartCapture() {
    if (!state.running || !source) return;
    const refreshed = (await sources()).find(entry => entry.id === source.id || (source.device && entry.device === source.device));
    if (!refreshed) throw new Error('La pantalla ya no está disponible.');
    source = refreshed;
    await allowCapture(source.id);
    const size = policy.captureSize(source.width || 1920, source.height || 1080);
    sendHost({ type: 'start', width: size.width, height: size.height });
    Object.assign(state, { sourceId: source.id, width: size.width, height: size.height });
    emit();
  }

  async function applyResolution(mode, automatic) {
    if (!source?.virtual) throw new Error('Selecciona una pantalla virtual para cambiar su resolución.');
    if (source.width === mode.width && source.height === mode.height) { state.notice = 'La pantalla ya está a ' + mode.width + ' × ' + mode.height + '.'; emit(); return; }
    state.notice = 'Ajustando la pantalla…'; emit();
    sendHost({ type: 'stop' });
    await displays.setResolution({ desktopCapturer, screen, ownWindow: mainWindow(), id: source.id, width: mode.width, height: mode.height });
    await new Promise(resolve => setTimeout(resolve, 700));
    await restartCapture();
    state.notice = (automatic ? 'Resolución compatible con el dispositivo: ' : 'Resolución aplicada: ') + mode.width + ' × ' + mode.height + '.';
    emit();
  }
  async function fitToDevice() {
    if (!state.device || !source?.virtual) return;
    await applyResolution(policy.bestMode(source.modes, state.device), true);
  }

  // Controles de la ventana principal
  ipcMain.handle('ss-state', () => snapshot());
  ipcMain.handle('ss-sources', () => sources());
  ipcMain.handle('ss-start', async (_event, sourceId) => { if (typeof sourceId !== 'string' || sourceId.length > 200) throw new Error('Fuente no válida.'); await start(sourceId); return snapshot(); });
  ipcMain.handle('ss-stop', async () => { await stop(false); return snapshot(); });
  ipcMain.handle('ss-fit', (_event, value) => { state.fit = value === 'cover' ? 'cover' : 'contain'; remember(); sendHost({ type: 'fit', value: state.fit }); emit(); return snapshot(); });
  ipcMain.handle('ss-pause', (_event, value) => { sendHost({ type: 'pause', value: Boolean(value) }); state.paused = Boolean(value); emit(); return snapshot(); });
  ipcMain.handle('ss-auto-fit', async (_event, value) => { state.autoFit = Boolean(value); remember(); emit(); if (state.autoFit) await fitToDevice(); return snapshot(); });
  ipcMain.handle('ss-resolution', async (_event, { width, height } = {}) => { if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('Resolución no válida'); await applyResolution({ width, height }, false); return snapshot(); });
  ipcMain.handle('ss-fit-device', async () => { await fitToDevice(); return snapshot(); });
  ipcMain.handle('ss-driver-status', () => driver.status());
  ipcMain.handle('ss-driver-install', () => driver.install(app));
  ipcMain.handle('ss-driver-uninstall', async () => { if (state.running && state.virtual) await stop(false); return driver.uninstall(app); });
  ipcMain.handle('ss-display-settings', () => shell.openExternal('ms-settings:display'));
  ipcMain.on('ss-host-event', (event, message) => { if (hostWindow && !hostWindow.isDestroyed() && event.sender === hostWindow.webContents) handleHostEvent(message); });
  app.on('before-quit', () => { stop(true).catch(() => {}); });

  return { start, stop, snapshot, sources, restartCapture, fitToDevice, applyResolution, hostFile, get server() { return server; } };
}

module.exports = { create, hostFile, localAddresses };
