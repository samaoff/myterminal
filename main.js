const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Notification } = require('electron');
const { spawn } = require('node:child_process');
const { AppUpdates, RELEASES: UPDATE_RELEASES } = require('./app-updates.cjs');
let appUpdates, updatesReady, installingUpdate = false;
// Keep native RDP child windows visible above Chromium's content surface.
if (process.platform === 'win32') app.commandLine.appendSwitch('disable-direct-composition');
const pty = require('node-pty');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { RecentProjects } = require('./recent-projects.cjs');
const { UserProfiles } = require('./user-profiles.cjs');
const { RemoteConnections, remoteClient, connectionLaunch } = require('./remote-connections.cjs');
const { RdpSessions } = require('./rdp-sessions.cjs');
const { SftpBrowser } = require('./sftp-browser.cjs');
const trustedSftpHosts = new Map();
const sftpBrowser = new SftpBrowser({
  verifyHost: async (entry, fingerprint) => {
    const key = entry.host + ':' + entry.port;
    if (trustedSftpHosts.get(key) === fingerprint) return true;
    const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'Identidad del servidor SFTP', message: 'Comprueba la huella de ' + key, detail: fingerprint + '\nConfirma esta huella con el administrador del servidor. Se recordará durante esta ejecución.', buttons: ['Cancelar', 'Confiar y conectar'], defaultId: 0, cancelId: 0 });
    if (answer.response !== 1) return false;
    trustedSftpHosts.set(key, fingerprint); return true;
  },
  progress: message => { if (!window?.isDestroyed()) window.webContents.send('sftp-progress', message); },
  closed: id => { if (!window?.isDestroyed()) window.webContents.send('sftp-closed', id); }
});
let rdpSessions;
const remoteConnections = () => new RemoteConnections(profileDirectory());
const userDataOverride=app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', userDataOverride ? path.resolve(userDataOverride) : path.join(app.getPath('appData'), 'ai-terminal-pro'));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let userProfiles;
const profileDirectory = () => userProfiles.directory();
const tools = require('./project-tools');
const { TerminalProfiles, findExecutable, scriptCommand, setDetectedShells, getDetectedShells } = require('./terminal-profiles');
const { detectShells } = require('./shell-detect.cjs');
const security = require('./security.cjs');
const indexFile = require('node:path').join(__dirname, 'index.html');
// Antes de registrar cualquier canal: solo la página de la aplicación puede usarlos.
const captureFile = require('node:path').join(__dirname, 'second-screen', 'host.html');
security.guardIpc(ipcMain, indexFile, { 'ss-host-event': captureFile });
security.hardenContents(app);
let terminalProfiles, secondScreen;
// La detección tarda un instante (WSL); se lanza una vez al arrancar y las peticiones esperan a que termine.
const detectedShellsReady = detectShells().then(setDetectedShells).catch(() => setDetectedShells([]));
const { UsageTracker } = require('./ai-usage');
let usageTracker;
const skillCatalog = new Map();
const selectedProjects = new Set();
const skillPlans = new Map();
const { randomUUID } = require('node:crypto');
let closeApproved = false, closePrompt = false;
// Mantener los terminales al cerrar la ventana: se oculta y la aplicación sigue en la bandeja del sistema.
let keepRunning = false, tray = null, quitting = false, backgroundTimer = null;
app.on('before-quit', () => { quitting = true; });
function openFromTray() {
  if (!window || window.isDestroyed()) return;
  window.show(); if (window.isMinimized()) window.restore(); window.focus();
  window.webContents.send('rdp-layout-request');
}
function ensureTray() {
  if (tray) return;
  const { Tray, Menu, nativeImage } = require('electron');
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico')));
  tray.setToolTip('MyTerminal');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir MyTerminal', click: openFromTray },
    { type: 'separator' },
    { label: 'Salir y cerrar los terminales', click: () => { closeApproved = true; quitting = true; app.quit(); } }
  ]));
  tray.on('click', openFromTray);
}
function removeTray() {
  if (tray) { tray.destroy(); tray = null; }
  if (backgroundTimer) { clearInterval(backgroundTimer); backgroundTimer = null; }
}
function hideToBackground() {
  const count = sessions.size + rdpSessions.size + sftpBrowser.size;
  ensureTray();
  rdpSessions.hideAll();
  window.hide();
  // Sin terminales en marcha no hay nada que conservar: la aplicación se cierra sola.
  if (!backgroundTimer) backgroundTimer = setInterval(() => { if (sessions.size + rdpSessions.size + sftpBrowser.size === 0) { closeApproved = true; app.quit(); } }, 5000);
  if (Notification.isSupported()) new Notification({ title: 'MyTerminal sigue abierto', body: count + (count === 1 ? ' terminal continúa' : ' terminales continúan') + ' en segundo plano. Ábrelo desde el icono de la bandeja.' }).show();
}
async function confirmClose(count) {
  const result = await dialog.showMessageBox(window, { type: 'warning', title: 'Cerrar sesiones', message: count === 1 ? '¿Cerrar esta sesión?' : `¿Cerrar ${count} sesiones abiertas?`, detail: 'Se terminarán sus procesos. Si una IA está trabajando, su tarea se interrumpirá. La aplicación no puede distinguir una tarea activa de una sesión en espera.', buttons: ['Seguir trabajando', 'Cerrar y terminar procesos'], defaultId: 0, cancelId: 0, noLink: true });
  return result.response === 1;
}
function allowedProject(folder) { if (folder !== null && !selectedProjects.has(folder) && !recent().includes(folder)) throw new Error('Abre el proyecto desde el selector de carpetas.'); return folder; }
const sessions = new Map();
const outputPressure = new Map();
ipcMain.on('terminal-consumed', (event, {id, length} = {}) => {
  if (event.sender !== window?.webContents || !Number.isSafeInteger(length) || length < 0) return;
  const state = outputPressure.get(id); if (!state) return;
  state.pending = Math.max(0, state.pending - length);
  if (state.paused && state.pending < 65536) { state.paused = false; sessions.get(id)?.resume(); }
});
let window;
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
let sequence = 0;
const recentFile = () => path.join(profileDirectory(), 'projects.json');
function recent() {
  return new RecentProjects(recentFile()).list();
}
function dispose() { sftpBrowser.dispose(); for (const term of sessions.values()) { try { term.kill(); } catch {} } sessions.clear(); usageTracker?.dispose();rdpSessions?.dispose(); }
app.whenReady().then(() => {
  security.hardenSession(require('electron').session.defaultSession, indexFile, captureFile);
  // Segunda pantalla para iPad: servidor local, captura oculta y controles de resolución.
  const { desktopCapturer, screen: displayScreen, session: electronSession } = require('electron');
  secondScreen = require('./second-screen/service.cjs').create({
    app, ipcMain, BrowserWindow, desktopCapturer, screen: displayScreen, session: electronSession, shell, getWindow: () => window,
    loadPrefs: () => readUiPreferences().secondScreen,
    savePrefs: value => { const preferences = readUiPreferences(); preferences.secondScreen = value; writeUiPreferences(preferences); }
  });
  if (!primaryInstance) return;
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  userProfiles = new UserProfiles(app.getPath('userData'));
  usageTracker = new UsageTracker(app.getPath('userData'));
  terminalProfiles = new TerminalProfiles(profileDirectory());
  app.setAppUserModelId('local.ai-terminal-pro.desktop');
  window = new BrowserWindow({ width: 1380, height: 860, minWidth: 950, minHeight: 580, icon: path.join(__dirname, 'build', 'icon.ico'), backgroundColor: '#10131a', title: 'MyTerminal', autoHideMenuBar: true, titleBarStyle: 'hidden', titleBarOverlay: { color: '#171b24', symbolColor: '#e4e8ef', height: 44 }, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  applyOpeningSize(readUiPreferences().openingSize);
  if (app.commandLine.hasSwitch('sftp-preview')) {
    window.setTitle('MyTerminal - PRUEBA SFTP VISUAL');
    window.on('page-title-updated', event => event.preventDefault());
  }
  rdpSessions=new RdpSessions(window,{helperPath:app.isPackaged?path.join(process.resourcesPath,'rdp-host.exe'):require('./build-rdp-host.cjs').buildRdpHost(),onEvent:message=>{if(!window.isDestroyed())window.webContents.send('rdp-status',message);}});
  window.on('minimize',()=>rdpSessions.hideAll());
  window.on('restore',()=>window.webContents.send('rdp-layout-request'));
  window.on('move',()=>window.webContents.send('rdp-layout-request'));
  window.webContents.on('did-start-loading',()=>rdpSessions.hideAll());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  appUpdates = new AppUpdates({directory:app.getPath('userData'), version:app.getVersion(), packaged:app.isPackaged, safeStorage});
  appUpdates.on('change', state => { if (!window.isDestroyed()) window.webContents.send('app-update-state',state); });
  updatesReady = appUpdates.initialize();
  if (app.isPackaged) {
    const timer = setTimeout(async () => { await updatesReady; if (appUpdates.settings.autoCheck && !window.isDestroyed()) await appUpdates.check(); }, 15000);
    timer.unref();
  }
  keepRunning = readUiPreferences().keepRunning === true;
  window.loadFile(path.join(__dirname, 'index.html'));
  window.on('close', event => {
    if (keepRunning && !quitting && !installingUpdate && !closeApproved && sessions.size + rdpSessions.size + sftpBrowser.size > 0) { event.preventDefault(); hideToBackground(); return; }
    if (closeApproved || sessions.size + rdpSessions.size + sftpBrowser.size === 0) return;
    event.preventDefault();
    if (closePrompt) return;
    closePrompt = true;
    rdpSessions.hideAll();
    confirmClose(sessions.size + rdpSessions.size + sftpBrowser.size).then(approved => { if (approved) { closeApproved = true; window.close(); } else window.webContents.send('rdp-layout-request'); }).finally(() => { closePrompt = false; });
  });
  window.on('leave-full-screen', () => { if (externalState && !externalBusy) { externalState = null; notifyExternal(); } });
  window.on('show', removeTray);
  window.on('closed', () => { removeTray(); dispose(); });
});
app.on('window-all-closed', () => app.quit());
ipcMain.handle('titlebar-set', (_event, colors) => {
  const valid = value => typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
  if (!colors || !valid(colors.color) || !valid(colors.symbolColor) || !window || window.isDestroyed()) return false;
  if (valid(colors.background)) window.setBackgroundColor(colors.background.slice(0, 7));
  if (process.platform === 'win32') window.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor.slice(0, 7), height: 44 });
  return true;
});
// Pantalla externa: mover el terminal a otro monitor (por ejemplo el iPad con Al lado) en pantalla completa y volver.
const externalDisplay = require('./external-display.cjs');
let externalState = null, externalBusy = false;
function externalSnapshot() {
  const { screen } = require('electron');
  const primary = screen.getPrimaryDisplay().id;
  const current = window && !window.isDestroyed() ? screen.getDisplayMatching(window.getBounds()).id : primary;
  const saved = readUiPreferences().externalDisplay?.alLadoPath;
  return { displays: externalDisplay.describeDisplays(screen.getAllDisplays(), primary, current), active: Boolean(externalState), displayId: externalState ? externalState.displayId : null, alLado: Boolean(externalDisplay.findAlLado({ savedPath: saved })) };
}
function notifyExternal() { if (window && !window.isDestroyed()) { window.webContents.send('external-mode', externalSnapshot()); window.webContents.send('rdp-layout-request'); } }
const afterEvent = (emitter, eventName, action, fallbackMs = 1500) => new Promise(resolve => {
  let finished = false;
  const done = () => { if (finished) return; finished = true; clearTimeout(timer); emitter.removeListener(eventName, done); resolve(); };
  const timer = setTimeout(done, fallbackMs);
  emitter.once(eventName, done);
  action();
});
async function enterExternal(displayId) {
  const { screen } = require('electron');
  const target = externalDisplay.pickDisplay(screen.getAllDisplays(), displayId);
  if (!target) throw new Error('Esa pantalla ya no está disponible. Actualiza la lista.');
  if (externalBusy) throw new Error('Espera a que termine el cambio de pantalla anterior.');
  externalBusy = true;
  try {
    if (!externalState) externalState = { bounds: window.getBounds(), maximized: window.isMaximized(), displayId: target.id };
    externalState.displayId = target.id;
    rdpSessions.hideAll();
    if (window.isFullScreen()) await afterEvent(window, 'leave-full-screen', () => window.setFullScreen(false));
    if (window.isMaximized()) window.unmaximize();
    const width = Math.max(600, Math.min(1200, target.bounds.width - 80)), height = Math.max(400, Math.min(800, target.bounds.height - 80));
    window.setBounds({ x: target.bounds.x + 40, y: target.bounds.y + 40, width, height });
    await new Promise(resolve => setTimeout(resolve, 200));
    await afterEvent(window, 'enter-full-screen', () => window.setFullScreen(true));
  } finally { externalBusy = false; }
  notifyExternal();
  return externalSnapshot();
}
async function exitExternal() {
  if (!externalState) return externalSnapshot();
  const state = externalState;
  externalState = null;
  externalBusy = true;
  try {
    if (!window.isDestroyed()) {
      if (window.isFullScreen()) await afterEvent(window, 'leave-full-screen', () => window.setFullScreen(false));
      const { screen } = require('electron');
      const area = state.bounds;
      const visible = screen.getAllDisplays().some(display => area.x < display.bounds.x + display.bounds.width && area.x + area.width > display.bounds.x && area.y < display.bounds.y + display.bounds.height && area.y + area.height > display.bounds.y);
      if (visible) window.setBounds(area); else window.center();
      if (state.maximized) window.maximize();
    }
  } finally { externalBusy = false; }
  notifyExternal();
  return externalSnapshot();
}
ipcMain.handle('external-state', () => externalSnapshot());
ipcMain.handle('external-enter', (_event, displayId) => enterExternal(displayId));
ipcMain.handle('external-exit', () => exitExternal());
ipcMain.handle('external-launch', () => {
  const exe = externalDisplay.findAlLado({ savedPath: readUiPreferences().externalDisplay?.alLadoPath });
  if (!exe) return { ok: false };
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
  return { ok: true };
});
ipcMain.handle('external-pick', async () => {
  const result = await dialog.showOpenDialog(window, { title: 'Elige Al lado.exe', properties: ['openFile'], filters: [{ name: 'Programa', extensions: ['exe'] }] });
  const file = result.canceled ? null : result.filePaths[0];
  if (!file || !/\.exe$/i.test(file) || !fs.existsSync(file)) return { ok: false };
  const preferences = readUiPreferences();
  preferences.externalDisplay = { alLadoPath: file };
  writeUiPreferences(preferences);
  return { ok: true };
});
app.whenReady().then(() => {
  const { screen } = require('electron');
  // Si desaparece la pantalla externa (por ejemplo se desconecta el iPad), el terminal vuelve solo para no quedar fuera de la vista.
  screen.on('display-removed', (_event, display) => { if (externalState && display.id === externalState.displayId) exitExternal().catch(() => {}); });
  screen.on('display-metrics-changed', () => { if (externalState) notifyExternal(); });
});
ipcMain.handle('user-profiles-list', () => userProfiles.list());
ipcMain.handle('user-profile-create', (_event, name) => userProfiles.create(name));
ipcMain.handle('user-profile-rename', (_event, {id, name}) => userProfiles.rename(id, name));
ipcMain.handle('user-profile-switch', (_event, id) => {
  if (id === userProfiles.current().id) return true;
  if (sessions.size || rdpSessions.size || sftpBrowser.size) throw new Error('Cierra las pestañas de terminal, SFTP y escritorio remoto antes de cambiar de perfil.');
  userProfiles.switch(id);
  applyOpeningSize(readUiPreferences().openingSize);
  terminalProfiles = new TerminalProfiles(profileDirectory());
  selectedProjects.clear(); skillCatalog.clear(); skillPlans.clear();
  usageTracker.dispose(); usageTracker = new UsageTracker(app.getPath('userData'));
  // Reload from Electron so navigation restrictions cannot leave the old UI
  // attached to the newly selected profile.
  setImmediate(() => { if (!window.isDestroyed()) window.webContents.reload(); });
  return true;
});
ipcMain.handle('project-remember', (_event, {profileId, folder}) => {
  if (profileId !== userProfiles.current().id) return false;
  allowedProject(folder);
  const updated = readUiPreferences(); updated.lastFolder = folder;
  writeUiPreferences(updated); return true;
});
ipcMain.handle('projects', () => recent());
ipcMain.handle('project-forget', (_event, folder) => {
  // Keep an open project's permissions when removing its history entry.
  if (recent().includes(folder)) selectedProjects.add(folder);
  return new RecentProjects(recentFile()).remove(folder);
});
ipcMain.handle('pick-folder', async () => {
  const owner = userProfiles.current().id;
  const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Selecciona tu proyecto' });
  if (result.canceled) return null;
  if (owner !== userProfiles.current().id) throw new Error('El perfil cambió. Vuelve a abrir el proyecto.');
  const folder = result.filePaths[0];
  selectedProjects.add(folder);
  new RecentProjects(recentFile()).add(folder);
  return folder;
});
ipcMain.handle('create-terminal', (_event, options) => {
  if (installingUpdate) throw new Error('Hay una actualización pendiente de instalación.');
  if (options?.profileId !== userProfiles.current().id) throw new Error('El perfil cambió. Vuelve a abrir la conexión o el terminal.');
  const { kind, remoteId } = options || {};
  const connection = remoteId ? remoteConnections().get(remoteId) : null;
  if (connection?.protocol === 'rdp') throw new Error('Usa la opción de escritorio remoto.');
  const remoteLaunch = connection ? connectionLaunch(connection, options.folder) : null;
  const folder = remoteLaunch ? remoteLaunch.folder : options?.folder;
  if (typeof folder !== 'string' || !fs.statSync(folder).isDirectory()) throw new Error('Selecciona una carpeta válida.');
  const profile = connection ? {id:connection.id,kind:connection.protocol,name:connection.name,icon:connection.protocol} : terminalProfiles.resolve(kind);
  if (!connection) selectedProjects.add(folder);
  const id = String(++sequence);
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  // GUI processes sometimes inherit an older PATH than the user's terminal.
  env.Path = [process.env.Path || process.env.PATH || '', path.join(os.homedir(), 'AppData', 'Roaming', 'npm'), path.join(os.homedir(), '.local', 'bin')].join(path.delimiter);
  delete env.PATH;
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const args = ['-NoLogo', '-NoExit'];
  if (!connection && profile.kind === 'powershell') args.push('-Command', "$global:AiTerminalOriginalPrompt = $function:prompt; function global:prompt { $ok = $?; $code = if ($ok) { 0 } else { 1 }; [Console]::Write(([char]27).ToString() + ']133;D;' + $code + [char]7); & $global:AiTerminalOriginalPrompt }");
  let executable = shell, launchArgs = args;
  const customExecutable = profile.kind === 'custom' ? findExecutable(profile.command, folder, env) : null;
  const usageConfig = usageTracker.prepare(id, profile.kind);
  if (usageConfig) Object.assign(env, usageConfig.env);
  const quotePS = value => "'" + value.replaceAll("'", "''") + "'";
  if (remoteLaunch) {
    executable = remoteLaunch.file; launchArgs = remoteLaunch.args;
  } else if (profile.kind === 'custom') {
    if (/\.(cmd|bat|ps1)$/i.test(customExecutable)) args.push('-Command', scriptCommand({...profile, command:customExecutable}));
    else { executable = customExecutable; launchArgs = profile.args; }
  } else if (profile.kind !== 'powershell') args.push('-Command', profile.kind === 'codex' ? 'codex.cmd' : '& claude.exe --session-id ' + quotePS(usageConfig.sessionId) + ' --settings ' + quotePS(usageConfig.settingsPath));
  let term;
  if (!connection && profile.kind === 'powershell') {
    env.AI_TERMINAL_PSREADLINE = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'vendor', 'PSReadLine', '2.3.6', 'PSReadLine.psd1');
    env.PSModulePath = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'vendor') + ';' + (process.env.PSModulePath || '');
    env.AI_TERMINAL_HISTORY = path.join(profileDirectory(), 'powershell-history.txt');
    args[3] = fs.readFileSync(path.join(__dirname, 'shell-history.ps1'), 'utf8') + '\n' + args[3];
    args[2] = '-EncodedCommand';
    args[3] = Buffer.from(args[3], 'utf16le').toString('base64');
    args.unshift('-ExecutionPolicy', 'RemoteSigned');
  }
  try { term = pty.spawn(executable, launchArgs, { name: 'xterm-256color', cols: 100, rows: 30, cwd: folder, env }); }
  catch (error) { usageTracker.end(id); throw error; }
  sessions.set(id, term);
  // Renderer subscribes globally before requesting creation; IDs correlate events.
  let output = [], outputLength = 0, outputTimer = null;
  const pressure = {pending:0, paused:false}; outputPressure.set(id, pressure);
  const flushOutput = () => {
    if (outputTimer) clearTimeout(outputTimer);
    outputTimer = null;
    if (outputLength && !window.isDestroyed()) {
      pressure.pending += outputLength;
      window.webContents.send('terminal-data', { id, data: output.join('') });
      if (pressure.pending >= 262144 && !pressure.paused && typeof term.pause === 'function') { pressure.paused = true; term.pause(); }
    }
    output = []; outputLength = 0;
  };
  term.onData(data => {
    output.push(data); outputLength += data.length;
    if (outputLength >= 65536) flushOutput();
    else if (!outputTimer) outputTimer = setTimeout(flushOutput, 8);
  });
  term.onExit(({ exitCode }) => { flushOutput(); outputPressure.delete(id); sessions.delete(id); usageTracker.end(id); if (!window.isDestroyed()) window.webContents.send('terminal-exit', { id, exitCode }); });
  return { id, kind: profile.kind, name: profile.name, icon: profile.icon, profileId: profile.id, folder, remote:remoteLaunch?.remote || null };
});
ipcMain.handle('remote-connections-list', () => remoteConnections().list());
const taskNoticeTimes = new Map();
ipcMain.handle('task-notify', (event, {id, name, message} = {}) => {
  if (event.sender !== window?.webContents || typeof id !== 'string' || typeof name !== 'string' || typeof message !== 'string' || name.length > 100 || message.length > 200) return false;
  if (Date.now() - (taskNoticeTimes.get(id) || 0) < 3000 || !Notification.isSupported()) return false;
  taskNoticeTimes.set(id, Date.now());
  if (taskNoticeTimes.size > 200) taskNoticeTimes.delete(taskNoticeTimes.keys().next().value);
  const notice = new Notification({ title: 'MyTerminal · ' + name, body: message, silent: true });
  notice.on('click', () => { if (!window.isDestroyed()) { window.show(); window.focus(); window.webContents.send('task-notice-open', id); } }); notice.show(); return true;
});
ipcMain.handle('sftp-open', (_event, {profileId, id, credentials, folder}) => {
  if (installingUpdate || profileId !== userProfiles.current().id) throw new Error('El perfil cambió o hay una instalación pendiente.');
  const entry = remoteConnections().get(id);
  if (entry.protocol !== 'sftp') throw new Error('Selecciona una conexión SFTP.');
  if (folder) allowedProject(folder);
  return sftpBrowser.open(entry, credentials, folder);
});
ipcMain.handle('sftp-list', (_event, {id, side, target}) => sftpBrowser.list(id, side, target));
ipcMain.handle('sftp-transfer', (_event, {id, direction, name}) => sftpBrowser.transfer(id, direction, name));
ipcMain.handle('sftp-cancel', (_event, id) => sftpBrowser.cancel(id));
ipcMain.handle('sftp-close', async (_event, id) => {
  if (sftpBrowser.sessions.get(id)?.busy && !await confirmClose(1)) return false;
  sftpBrowser.close(id); return true;
});
ipcMain.handle('remote-connection-save', (_event, {profileId, connection}) => {
  if (profileId !== userProfiles.current().id) throw new Error('El perfil cambió. Vuelve a abrir Conexiones.');
  return remoteConnections().save(connection);
});
ipcMain.handle('remote-connection-remove', async (_event, {profileId, id}) => {
  if (profileId !== userProfiles.current().id) throw new Error('El perfil cambió.');
  const store = remoteConnections(), entry = store.get(id);
  const answer = await dialog.showMessageBox(window,{type:'question',title:'Quitar conexión',message:'¿Quitar '+entry.name+' de tus conexiones?',detail:'Se elimina el acceso guardado. Las sesiones abiertas y los archivos se conservan.',buttons:['Cancelar','Quitar'],defaultId:0,cancelId:0,noLink:true});
  if (answer.response!==1) return false;
  if (profileId !== userProfiles.current().id) throw new Error('El perfil cambió.');
  store.remove(id); return true;
});
ipcMain.handle('remote-clients', () => Object.fromEntries(['ssh','sftp','rdp'].map(protocol => {try {remoteClient(protocol);return [protocol,true];} catch {return [protocol,false];}})));
ipcMain.handle('remote-pick-path', async (_event, {profileId, kind}) => {
  if (profileId !== userProfiles.current().id) throw new Error('El perfil cambió.');
  if (!['key','folder'].includes(kind)) throw new Error('Selector no válido.');
  const result = await dialog.showOpenDialog(window,{title:kind==='key'?'Selecciona tu clave privada SSH':'Carpeta local para la conexión',properties:[kind==='key'?'openFile':'openDirectory']});
  if (profileId !== userProfiles.current().id) throw new Error('El perfil cambió.');
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('remote-desktop-open', async (_event, {profileId,id}) => {
  if (installingUpdate) throw new Error('Hay una actualización pendiente de instalación.');
  if (profileId !== userProfiles.current().id) throw new Error('El perfil cambió.');
  const entry = remoteConnections().get(id);
  if (entry.protocol !== 'rdp') throw new Error('Selecciona una conexión de escritorio remoto.');
  return rdpSessions.start('rdp-'+String(++sequence),entry);
});
ipcMain.on('remote-desktop-layout',(_event,{id,bounds}={})=>rdpSessions.layout(id,bounds));
ipcMain.on('remote-desktop-disconnect',(_event,id)=>rdpSessions.disconnect(id));
ipcMain.on('terminal-write', (_event, { id, data }) => { if (typeof data === 'string') sessions.get(id)?.write(data); });
ipcMain.on('terminal-resize', (_event, { id, cols, rows }) => { if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0 && cols < 1000 && rows < 1000) { try { sessions.get(id)?.resize(cols, rows); } catch {} } });
ipcMain.handle('terminal-close', async (_event, id) => {
  if (rdpSessions.has(id)) {
    rdpSessions.hideAll();
    const answer=await dialog.showMessageBox(window,{type:'question',title:'Cerrar escritorio remoto',message:'¿Desconectar y cerrar esta pestaña?',detail:'Se desconectará la sesión RDP de MyTerminal.',buttons:['Seguir conectado','Desconectar'],defaultId:0,cancelId:0,noLink:true});
    window.webContents.send('rdp-layout-request');
    if(answer.response!==1)return false;rdpSessions.stop(id);return true;
  }
  if (sessions.has(id) && !await confirmClose(1)) return false;
  try { sessions.get(id)?.kill(); } catch {} sessions.delete(id); usageTracker.end(id); return true;
});
ipcMain.handle('skills-list', async (_event, folder) => {
  const result = await tools.listSkills(allowedProject(folder));
  for (const skill of result.skills) skillCatalog.set(skill.file, skill);
  return result;
});
ipcMain.handle('skill-read', async (_event, file) => {
  if (!skillCatalog.has(file)) throw new Error('Actualiza la lista de skills.');
  return tools.textFile(file);
});
ipcMain.handle('skill-preview-import', async (_event, { folder, target }) => {
  allowedProject(folder);
  const root = tools.targetRoot(folder, target);
  const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Selecciona la carpeta que contiene SKILL.md' });
  if (result.canceled) return null;
  const source = result.filePaths[0];
  const preview = await tools.inspectSkill(source, root);
  const duplicates = (await tools.listSkills(folder)).skills.filter(s => s.name === preview.name);
  const token = randomUUID(); skillPlans.clear(); skillPlans.set(token, { source, root, fingerprint: preview.fingerprint });
  return { ...preview, token, duplicates };
});
ipcMain.handle('skill-preview-create', async (_event, { folder, target, name, description, instructions }) => {
  allowedProject(folder);
  const root = tools.targetRoot(folder, target), preview = await tools.previewCreatedSkill(root, { name, description, instructions });
  const duplicates = (await tools.listSkills(folder)).skills.filter(s => s.name === name);
  const token = randomUUID(); skillPlans.clear(); skillPlans.set(token, { root, fields: { name, description, instructions } });
  return { ...preview, token, duplicates };
});
ipcMain.handle('skill-commit', async (_event, token) => {
  const plan = skillPlans.get(token); if (!plan) throw new Error('La previsualización ha caducado. Vuelve a prepararla.');
  const result = plan.source ? await tools.importSkill(plan.source, plan.root, plan.fingerprint) : await tools.createSkill(plan.root, plan.fields);
  skillPlans.delete(token); return result;
});
ipcMain.handle('project-files', (_event, { folder, relative }) => tools.files(allowedProject(folder), relative));
ipcMain.handle('project-read', async (_event, { folder, relative }) => tools.textFile(await tools.projectPath(allowedProject(folder), relative)));
ipcMain.handle('project-changes', (_event, folder) => tools.changes(allowedProject(folder)));
ipcMain.handle('project-file-change', (_event, { folder, relative }) => tools.fileChange(allowedProject(folder), relative));

ipcMain.handle('project-open', async (_event, folder) => {
  allowedProject(folder);
  if (!folder || !fs.statSync(folder).isDirectory()) throw new Error('Selecciona un proyecto.');
  const error = await shell.openPath(folder); if(error) throw new Error(error);
});
ipcMain.handle('skill-delete', async (_event, {folder,file}) => {
  allowedProject(folder);
  const skills=(await tools.listSkills(folder)).skills;
  const skill=skills.find(s=>s.file===file);
  if(!skill || skills.filter(s=>s.agent===skill.agent && s.name===skill.name).length<2) throw new Error('Actualiza la lista: esta skill ya no está duplicada.');
  if(!tools.canDeleteSkill(skill)) throw new Error('Las skills del sistema y las cachés de plugins se gestionan desde su instalación.');
  const target=path.dirname(file), real=fs.realpathSync(target);
  if(path.resolve(real).toLowerCase()!==path.resolve(target).toLowerCase() || fs.lstatSync(target).isSymbolicLink()) throw new Error('No se puede borrar una skill enlazada.');
  const result=await dialog.showMessageBox(window,{type:'warning',title:'Eliminar copia de skill',message:'¿Mover esta copia a la papelera?',detail:skill.name+'\n'+skill.agent+' · '+skill.scope+'\n'+target+'\nSe moverá toda la carpeta, incluidos scripts y referencias. Las otras copias se conservan.',buttons:['Cancelar','Mover a la papelera'],defaultId:0,cancelId:0,noLink:true});
  if(result.response!==1) return false;
  const fresh=(await tools.listSkills(folder)).skills;
  if(!fresh.some(s=>s.file===file) || fresh.filter(s=>s.agent===skill.agent && s.name===skill.name).length<2 || fs.realpathSync(target)!==real) throw new Error('La lista cambió. Actualiza antes de eliminar.');
  await shell.trashItem(real); skillCatalog.delete(file); return true;
});
ipcMain.handle('git-info',(_event,folder)=>tools.gitInfo(allowedProject(folder)));
ipcMain.handle('git-action',async(_event,{folder,action,relative,message})=>{
  allowedProject(folder);
  if(['pull','push'].includes(action)) {
    const answer=await dialog.showMessageBox(window,{type:'question',title:action==='push'?'Publicar commits':'Actualizar repositorio',message:action==='push'?'¿Enviar los commits al remoto configurado?':'¿Descargar y avanzar la rama con fast-forward?',detail:folder,buttons:['Cancelar','Continuar'],defaultId:0,cancelId:0});
    if(answer.response!==1) return {canceled:true};
  }
  return tools.gitAction(folder,action,relative,message);
});

ipcMain.handle('ai-usage', (_event, {id,force}) => usageTracker.read(id, force === true));

ipcMain.handle('app-info', () => ({ version: require('./package.json').version, creator: 'samaapp', website: 'https://samaapp.es', releases: require('./releases.json') }));
ipcMain.handle('app-update-state', async () => { await updatesReady; return appUpdates.snapshot(); });
ipcMain.handle('app-update-check', async () => { await updatesReady; return appUpdates.check(); });
ipcMain.handle('app-update-settings', async (_event, options) => { await updatesReady; return appUpdates.configure(options); });
ipcMain.handle('app-update-download', async () => { await updatesReady; return appUpdates.download(); });
ipcMain.handle('app-update-cancel', () => appUpdates.cancel());
ipcMain.handle('app-update-releases', () => shell.openExternal(UPDATE_RELEASES));
ipcMain.handle('app-update-install', async () => {
  if (installingUpdate) return false;
  installingUpdate = true;
  try {
    await updatesReady;
    const file = await appUpdates.verifiedInstaller();
    const count = sessions.size + rdpSessions.size + sftpBrowser.size;
    if (count) {
      rdpSessions.hideAll();
      const approved = await confirmClose(count);
      if (!window.isDestroyed()) window.webContents.send('rdp-layout-request');
      if (!approved) return false;
    }
    await appUpdates.verifiedInstaller();
    // Use the existing NSIS installer, which remembers this app's installation path.
    await new Promise((resolve,reject) => {
      const child = spawn(file, [], {detached:true, stdio:'ignore', windowsHide:false});
      child.once('error', () => reject(new Error('No se pudo abrir el instalador. Vuelve a intentarlo.')));
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    closeApproved = true; app.quit(); return true;
  } finally { installingUpdate = false; }
});
ipcMain.handle('open-creator-website', () => shell.openExternal('https://samaapp.es'));

function readUiPreferences() {
  try { const file=path.join(profileDirectory(),'ui-preferences.json'); if(fs.statSync(file).size>65536)return {};const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; } catch { return {}; }
}
function applyOpeningSize(value) {
  if (!['large', 'small'].includes(value)) { window.maximize(); return; }
  window.unmaximize();
  const area = require('electron').screen.getDisplayMatching(window.getBounds()).workArea;
  window.setSize(Math.min(value === 'small' ? 1000 : 1600, area.width), Math.min(value === 'small' ? 650 : 1000, area.height));
  window.center();
}
function writeUiPreferences(value) {
  const file = path.join(profileDirectory(), 'ui-preferences.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file);
}
ipcMain.on('preferences-read', event => {
  const preferences = readUiPreferences();
  if (typeof preferences.lastFolder === 'string') {
    try { if (fs.statSync(preferences.lastFolder).isDirectory()) selectedProjects.add(preferences.lastFolder); else delete preferences.lastFolder; } catch { delete preferences.lastFolder; }
  }
  event.returnValue = { ...preferences, profileId: userProfiles.current().id, userProfile: userProfiles.current() };
});
ipcMain.handle('preferences-save', (_event, {profileId, patch} = {}) => {
  if (profileId !== userProfiles.current().id) return false;
  if(!patch || typeof patch!=='object' || Array.isArray(patch) || JSON.stringify(patch).length>60000)throw new Error('Preferencias no válidas.');
  const updated=readUiPreferences();
  if(typeof patch.theme==='string' && ['samapp','light','nord','dracula','amber','mac-glass','midnight','forest','ocean','plum','rose','volcano','arctic','sand','lavender','paper','contrast','pro','pro-light','carbon'].includes(patch.theme))updated.theme=patch.theme;
  if(typeof patch.proLook==='boolean')updated.proLook=patch.proLook;
  if(typeof patch.keepRunning==='boolean'){updated.keepRunning=patch.keepRunning;keepRunning=patch.keepRunning;}
  for(const key of ['terminal','sidebar','usage','designs','shortcuts','workspace'])if(patch[key]&&typeof patch[key]==='object'&&!Array.isArray(patch[key]))updated[key]=patch[key];
  if (['maximized', 'large', 'small'].includes(patch.openingSize)) updated.openingSize = patch.openingSize;
  writeUiPreferences(updated);
  if (Object.hasOwn(patch, 'openingSize')) applyOpeningSize(updated.openingSize);
  return true;
});

ipcMain.handle('terminal-profiles-list', () => terminalProfiles.list());
ipcMain.handle('detected-shells', async () => { await detectedShellsReady; return getDetectedShells(); });
ipcMain.handle('terminal-profile-save', (_event, profile) => terminalProfiles.save(profile));
ipcMain.handle('terminal-profile-remove', async (_event, id) => {
  const owner = userProfiles.current().id;
  const profile=terminalProfiles.list().find(entry=>entry.id===id);
  if(!profile)throw new Error('El terminal ya no existe.');
  const answer=await dialog.showMessageBox(window,{type:'question',title:'Eliminar acceso de terminal',message:'¿Eliminar '+profile.name+' de tus terminales?',detail:'Se elimina únicamente el acceso guardado. Las pestañas abiertas y el programa instalado se conservan.',buttons:['Cancelar','Eliminar acceso'],defaultId:0,cancelId:0,noLink:true});
  if(answer.response!==1)return false;
  if (owner !== userProfiles.current().id) throw new Error('El perfil cambió. Vuelve a seleccionar el terminal.');
  terminalProfiles.remove(id);return true;
});

// Para las comprobaciones automáticas.
module.exports = { __test: { secondScreen: () => secondScreen, externalState: () => externalState, isHidden: () => Boolean(window && !window.isDestroyed() && !window.isVisible()), hasTray: () => Boolean(tray) } };
