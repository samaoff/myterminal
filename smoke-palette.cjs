// Comprueba la paleta de comandos con teclas reales. Uso: electron smoke-palette.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
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
    const key = async (keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await wait(250); };
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };
    const type = text => run("const i = document.getElementById('palette-input'); i.value = " + JSON.stringify(text) + "; i.dispatchEvent(new Event('input', { bubbles: true })); return 1;");
    const first = "return document.querySelector('#palette-list [aria-selected=true] .palette-title')?.textContent";
    win.show(); win.focus(); await wait(800);
    await run("document.body.focus(); return 1;");

    // Abrir con Ctrl+Mayús+P
    await key('P', ['control', 'shift']);
    await check('Se abre con Ctrl+Mayús+P', "return document.getElementById('command-palette').open");
    await check('Hay comandos', "return document.querySelectorAll('#palette-list [role=option]').length > 8");
    await check('El foco está en el buscador', "return document.activeElement.id", 'palette-input');
    // Búsqueda sin acentos y por palabras
    await type('galeria');
    await check('Búsqueda sin acentos', first, 'Abrir la galería de diseños');
    // Aplicar un diseño con Intro
    await type('aplicar alto contraste');
    await check('Filtra diseños', first, 'Aplicar diseño: Alto contraste');
    await key('Enter');
    await check('Intro aplica el diseño', "return document.getElementById('command-palette').open === false && selectedTheme", 'contrast');
    // Flechas y Escape
    await key('P', ['control', 'shift']);
    await type('aplicar diseno');
    await check('Hay varios diseños', "return document.querySelectorAll('#palette-list [role=option]').length > 3");
    const before = await run(first);
    await key('Down');
    const after = await run(first);
    if (before === after) throw Error('La flecha abajo no cambia la selección');
    await key('Up');
    await check('La flecha arriba vuelve', first, before);
    await key('Escape');
    await check('Escape cierra', "return document.getElementById('command-palette').open", false);
    // Sin proyecto no se abre terminal y avisa
    await key('P', ['control', 'shift']);
    await type('nuevo terminal powershell');
    await key('Enter');
    await check('Sin proyecto no abre terminal', "return sessions.size", 0);
    await check('Avisa de que falta el proyecto', "return document.getElementById('status').textContent.includes('Abre un proyecto')");
    // Con proyecto abre cmd (Símbolo del sistema)
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); return 1;");
    await wait(800);
    await key('P', ['control', 'shift']);
    await type('nuevo terminal simbolo');
    await check('Ofrece cmd', first, 'Nuevo terminal: Símbolo del sistema');
    await key('Enter');
    await wait(1500);
    await check('Abre el terminal elegido', "return sessions.size", 1);
    await check('Ofrece ir a la pestaña', "await openCommandPalette(); const i = document.getElementById('palette-input'); i.value = 'ir a'; i.dispatchEvent(new Event('input', { bubbles: true })); return [...document.querySelectorAll('#palette-list .palette-title')].some(t => t.textContent.startsWith('Ir a:'))");
    if (shots) { try { fs.mkdirSync(shots, { recursive: true }); await run("const i = document.getElementById('palette-input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1;"); await wait(300); fs.writeFileSync(path.join(shots, 'paleta.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura: ' + e.message); } }
    await key('Escape');
    // Botón de la cabecera
    await run("document.getElementById('palette-open').click(); return 1;");
    await wait(400);
    await check('El botón de la cabecera la abre', "return document.getElementById('command-palette').open");
    await key('Escape');
    fs.writeFileSync('smoke-palette-result.json', JSON.stringify({ ok: true }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-palette-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
