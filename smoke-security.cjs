// Comprueba el endurecimiento: sin ventanas nuevas ni navegación, permisos denegados, portapapeles operativo y canales IPC cerrados a páginas ajenas.
// Uso: electron smoke-security.cjs --user-data-dir=<carpeta temporal>
const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('./main');
const wait = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };
    await wait(800);
    const before = BrowserWindow.getAllWindows().length;

    await check('window.open no abre nada', "return window.open('https://example.com') === null");
    await wait(300);
    if (BrowserWindow.getAllWindows().length !== before) throw Error('Se abrió una ventana nueva');
    await run("location.href = 'https://example.com/'; return 1;");
    await wait(1000);
    await check('La navegación externa se bloquea', "return location.protocol === 'file:' && document.title.includes('MyTerminal')");

    // Permisos del navegador denegados
    await check('Geolocalización denegada', "return (await navigator.permissions.query({ name: 'geolocation' })).state", 'denied');
    await check('Cámara denegada', "return (await navigator.permissions.query({ name: 'camera' })).state", 'denied');
    // El portapapeles sigue funcionando (pegar y copiar)
    clipboard.writeText('texto-del-portapapeles-123');
    await check('Pegar funciona', "return await navigator.clipboard.readText()", 'texto-del-portapapeles-123');
    await run("await navigator.clipboard.writeText('copiado-desde-la-app'); return 1;");
    if (clipboard.readText() !== 'copiado-desde-la-app') throw Error('Copiar no llega al portapapeles');
    // La aplicación sigue usando sus canales con normalidad
    await check('Los canales de la aplicación funcionan', "return Array.isArray(await window.desktop.projects())");

    // Una página ajena con el mismo preload no puede usar los canales
    const fixture = path.join(os.tmpdir(), 'ai-terminal-pro-ajena-' + process.pid + '.html');
    fs.writeFileSync(fixture, '<!doctype html><title>ajena</title><p>ajena</p>');
    const other = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await other.loadFile(fixture);
    await wait(500);
    const leaked = await other.webContents.executeJavaScript("(async()=>{ try { const r = window.desktop ? await window.desktop.projects() : 'sin-api'; return Array.isArray(r) ? 'FILTRADO' : String(r); } catch (e) { return 'rechazado'; } })()");
    other.destroy(); fs.rmSync(fixture, { force: true });
    if (leaked === 'FILTRADO') throw Error('Una página ajena pudo leer los proyectos');

    fs.writeFileSync('smoke-security-result.json', JSON.stringify({ ok: true, ajena: leaked }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-security-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
