// Prueba de extremo a extremo de la segunda pantalla: servidor, captura de la ventana, WebRTC y la página del iPad
// (un navegador Chromium oculto hace de iPad). No cambia la resolución de ninguna pantalla.
// Uso: electron smoke-second-screen.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const hooks = require('./main').__test;
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(check, ms, message) {
  const started = Date.now();
  while (Date.now() - started < ms) { const value = await check(); if (value) return value; await wait(250); }
  throw Error('Tiempo agotado: ' + message);
}
app.whenReady().then(async () => {
  let viewer = null;
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };
    const viewerValue = code => viewer.webContents.executeJavaScript('(()=>{try{' + code + '}catch(e){return null}})()');
    win.show(); win.focus(); await wait(1200);
    const service = hooks.secondScreen();

    // Fuentes: la ventana y las pantallas; las virtuales traen sus resoluciones
    const sources = await run("return await window.desktop.secondScreen.sources();");
    if (sources.__error) throw Error(sources.__error);
    const own = sources.find(source => source.kind === 'window');
    if (!own) throw Error('Falta la fuente «Esta ventana»: ' + JSON.stringify(sources.map(s => s.name)));
    if (sources[0].kind !== 'window') throw Error('La ventana debe aparecer la primera');
    if (!sources.some(source => source.kind === 'screen')) throw Error('No hay ninguna pantalla en la lista');
    const virtual = sources.filter(source => source.virtual);
    for (const source of virtual) if (!source.modes.length || !source.device) throw Error('Una pantalla virtual sin resoluciones: ' + source.name);
    await check('El estado de la pantalla virtual es conocido', "return ['missing', 'ready', 'disabled'].includes(await window.desktop.secondScreen.driverStatus())");

    // Arrancar enviando solo el terminal
    await check('Arranca', "const s = await window.desktop.secondScreen.start(" + JSON.stringify(own.id) + "); return s.running && /^\\d{6}$/.test(s.pin) && s.urls.length > 0 && s.sourceKind === 'window';");
    const first = await run("return await window.desktop.secondScreen.state();");
    await until(async () => (await run("return (await window.desktop.secondScreen.state()).width > 0;")) === true, 10000, 'la captura debía arrancar');
    const server = service.server;
    if (!server) throw Error('No hay servidor');
    const port = server.server.address().port;

    // Un «iPad»: Chromium oculto que abre el enlace del QR
    viewer = new BrowserWindow({ show: false, width: 1180, height: 820, webPreferences: { sandbox: true, backgroundThrottling: false } });
    await viewer.loadURL('http://127.0.0.1:' + port + '/#' + server.token);
    await until(async () => (await run("return (await window.desktop.secondScreen.state()).viewer;")) === true, 10000, 'el iPad debía conectarse');
    await until(async () => (await viewerValue("return document.body.classList.contains('playing') && document.getElementById('video').videoWidth > 0;")) === true, 20000, 'el iPad debía mostrar vídeo');
    const videoSize = await viewerValue("const v = document.getElementById('video'); return [v.videoWidth, v.videoHeight];");
    if (!(videoSize[0] > 100 && videoSize[1] > 100)) throw Error('Vídeo demasiado pequeño: ' + JSON.stringify(videoSize));
    await until(async () => (await run("return (await window.desktop.secondScreen.state()).connection;")) === 'connected', 10000, 'la conexión debía quedar establecida');
    await check('El PC conoce el tamaño del iPad', "const d = (await window.desktop.secondScreen.state()).device; return !!d && d.width > 200 && d.height > 200;");

    // Privacidad: pausar oculta la imagen en el iPad
    await run("await window.desktop.secondScreen.pause(true); return 1;");
    await until(async () => (await viewerValue("return !document.getElementById('paused').hidden;")) === true, 5000, 'el iPad debía mostrar la pausa');
    await check('El indicador marca la pausa', "return (await window.desktop.secondScreen.state()).paused");
    await run("await window.desktop.secondScreen.pause(false); return 1;");
    await until(async () => (await viewerValue("return document.getElementById('paused').hidden;")) === true, 5000, 'el iPad debía reanudar');
    // Ajuste de la imagen
    await run("await window.desktop.secondScreen.fit('cover'); return 1;");
    await until(async () => (await viewerValue("return document.body.classList.contains('fill');")) === true, 5000, 'el iPad debía rellenar');
    await run("await window.desktop.secondScreen.fit('contain'); return 1;");
    await until(async () => (await viewerValue("return !document.body.classList.contains('fill');")) === true, 5000, 'el iPad debía mostrar todo');
    // Interfaz del PC
    await run("await window.secondScreen.open(); return 1;");
    await check('El diálogo muestra el QR, el enlace y el código', "const d = document.getElementById('second-screen-dialog'); return d.open && !!d.querySelector('.ss-connection img') && /^\\d{6}$/.test(d.querySelector('.ss-pin').textContent) && d.querySelector('.ss-url').textContent.startsWith('http://');");
    await check('El indicador de la cabecera es visible', "return !document.getElementById('ss-indicator').hidden && document.getElementById('ss-indicator').textContent.includes('Pantalla')");
    if (shots) { try { fs.mkdirSync(shots, { recursive: true }); await wait(600); fs.writeFileSync(path.join(shots, 'segunda-pantalla.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura'); } }
    await run("document.getElementById('second-screen-dialog').close(); return 1;");

    // Seguridad: sin token no hay API y un segundo iPad no puede entrar
    const noToken = await fetch('http://127.0.0.1:' + port + '/api/signals');
    if (noToken.status !== 401) throw Error('La API debía exigir el token: ' + noToken.status);
    const second = await fetch('http://127.0.0.1:' + port + '/api/signals', { headers: { Authorization: 'Bearer ' + server.token, 'X-Client-Id': 'otro-ipad-123456' } });
    if (second.status !== 409) throw Error('Un segundo iPad no debía poder entrar: ' + second.status);

    // Parar: el iPad se entera
    await run("await window.desktop.secondScreen.stop(); return 1;");
    await check('Se detiene', "const s = await window.desktop.secondScreen.state(); return !s.running && s.urls.length === 0 && s.pin === '';");
    await until(async () => (await viewerValue("return !document.body.classList.contains('playing');")) === true, 8000, 'el iPad debía dejar de mostrar vídeo');
    if (service.server) throw Error('El servidor debía cerrarse');
    const closed = await fetch('http://127.0.0.1:' + port + '/').then(() => 'abierto', () => 'cerrado');
    if (closed !== 'cerrado') throw Error('El puerto debía cerrarse');

    // Cada arranque estrena código y enlace
    await check('Un nuevo arranque cambia el código', "const s = await window.desktop.secondScreen.start(" + JSON.stringify(own.id) + "); return s.pin !== " + JSON.stringify(first.pin) + ";");
    await run("await window.desktop.secondScreen.stop(); return 1;");
    viewer.destroy(); viewer = null;
    fs.writeFileSync('smoke-second-screen-result.json', JSON.stringify({ ok: true, fuentes: sources.length, virtuales: virtual.length, video: videoSize }, null, 2));
    app.exit(0);
  } catch (error) {
    try { viewer?.destroy(); } catch { /* sin acción */ }
    fs.writeFileSync('smoke-second-screen-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
