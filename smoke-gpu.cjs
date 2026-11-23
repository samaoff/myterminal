// Comprueba el render con GPU y su vuelta al render normal. Uso: electron smoke-gpu.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
require('./main');
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
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
    const rendererName = "const e = sessions.get(active).term.element; const webgl = [...e.querySelectorAll('.xterm-screen canvas')].some(c => !c.classList.contains('xterm-link-layer')); const rows = e.querySelectorAll('.xterm-rows > div').length; return webgl && rows === 0 ? 'WebglRenderer' : (rows > 0 ? 'DomRenderer' : 'desconocido');";
    const text = "const b = sessions.get(active).term.buffer.active; let t = ''; for (let i = 0; i < b.length; i++) t += (b.getLine(i)?.translateToString(true) || '') + String.fromCharCode(10); return t;";
    await wait(800);
    await check('El addon está disponible', "return window.gpuRender.available");
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); await launch('powershell'); await launch('shell-cmd'); return 1;");
    await wait(2000);
    const info = await run("return { sessions: sessions.size, gpu: gpuRender.count(), failed: [...sessions.values()].filter(s => s.gpuFailed).length };");
    if (info.__error) throw Error(info.__error);
    if (info.sessions !== 2) throw Error('Se esperaban 2 sesiones: ' + JSON.stringify(info));
    // En equipos sin WebGL cada pestaña queda en el render normal y la prueba lo da por bueno, pero lo deja anotado.
    let mode = 'gpu';
    if (info.gpu !== 2) { if (info.failed !== 2 - info.gpu) throw Error('Estado incoherente: ' + JSON.stringify(info)); mode = info.gpu ? 'mixto' : 'sin-webgl'; }
    if (mode === 'gpu') await check('Usa el render WebGL', rendererName, 'WebglRenderer');
    // Funciona de verdad: escribir y leer
    await run("sessions.get(active).term.input('echo gpu-ok-' + (20 + 22) + String.fromCharCode(13), true); return 1;");
    await wait(1500);
    await check('El terminal responde con GPU', text.replace('return t;', "return /gpu-ok-42/.test(t.replace(/echo gpu-ok-\\(20 \\+ 22\\)/g, ''));"));
    // Cambiar la fuente con GPU activa no rompe el render
    await run("terminalPreferences.fontSize = 16; applyTerminalPreferences(); return 1;");
    await wait(800);
    await check('Cambiar el tamaño de letra funciona', "return sessions.get(active).term.options.fontSize", 16);
    if (shots) { try { fs.mkdirSync(shots, { recursive: true }); win.show(); await wait(500); fs.writeFileSync(path.join(shots, 'gpu.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura'); } }
    // Desactivar: vuelve al render normal
    await run("gpuRender.toggle(); return 1;");
    await wait(800);
    await check('Desactivar libera la GPU', "return gpuRender.count()", 0);
    await check('Persiste el ajuste', "return localStorage.getItem(uiStorage.key('samaapp.gpu'))", '0');
    await check('Vuelve al render normal', rendererName, 'DomRenderer');
    await run("sessions.get(active).term.input('echo dom-ok-' + (30 + 12) + String.fromCharCode(13), true); return 1;");
    await wait(1200);
    await check('Sigue respondiendo sin GPU', text.replace('return t;', "return /dom-ok-42/.test(t.replace(/echo dom-ok-\\(30 \\+ 12\\)/g, ''));"));
    // Activar de nuevo
    await run("gpuRender.toggle(); return 1;");
    await wait(800);
    if (mode === 'gpu') await check('Reactivar vuelve a usar WebGL', "return gpuRender.count()", 2);
    fs.writeFileSync('smoke-gpu-result.json', JSON.stringify({ ok: true, mode }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-gpu-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
