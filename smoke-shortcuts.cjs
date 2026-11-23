// Comprueba los atajos configurables con teclas reales. Uso: electron smoke-shortcuts.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
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
    const key = async (keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await wait(300); };
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };
    const CS = ['control', 'shift'];
    win.show(); win.focus(); await wait(800);
    await run("document.body.focus(); return 1;");

    // Valores por defecto y ejecución con teclas reales
    await check('Hay atajos', "return shortcuts.list().length >= 10");
    await check('Paleta por defecto', "return shortcuts.comboFor('palette.open')", 'Ctrl+Shift+P');
    await key('P', CS);
    await check('Ctrl+Mayús+P abre la paleta', "return document.getElementById('command-palette').open");
    await key('Escape');
    const compact = await run("return sidebarState.compact;");
    await key('B', CS);
    await check('Ctrl+Mayús+B alterna la barra lateral', "return sidebarState.compact", !compact);
    await key('B', CS);
    await check('Ctrl+Mayús+B la devuelve', "return sidebarState.compact", compact);
    await key('T', CS);
    await check('Sin proyecto avisa', "return document.getElementById('status').textContent.includes('Abre un proyecto')");
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); return 1;");
    await wait(800);
    await key('T', CS); await wait(1500);
    await key('T', CS); await wait(1500);
    await check('Ctrl+Mayús+T abre terminales', "return sessions.size", 2);
    const first = await run("return active;");
    await key('Tab', ['control']);
    const second = await run("return active;");
    if (first === second) throw Error('Ctrl+Tab no cambia de pestaña');
    await key('Tab', CS);
    await check('Ctrl+Mayús+Tab vuelve', "return active", first);

    // Reasignar desde el diálogo
    await run("openShortcuts(); return 1;");
    await check('El diálogo se abre con todas las acciones', "return document.getElementById('shortcuts-dialog').open && document.querySelectorAll('.shortcut-row').length === shortcuts.list().length");
    const change = id => run("document.querySelector('.shortcut-row[data-action=\"" + id + "\"] .shortcut-change').click(); return 1;");
    const message = "return document.querySelector('.shortcuts-message').textContent";
    await change('sidebar.toggle');
    await check('Muestra que escucha', "return document.querySelector('.shortcut-row[data-action=\"sidebar.toggle\"] .shortcut-keys').classList.contains('listening')");
    await key('J', CS);
    await check('Se reasigna', "return shortcuts.comboFor('sidebar.toggle')", 'Ctrl+Shift+J');
    await run("document.getElementById('shortcuts-dialog').close(); return 1;");
    await key('B', CS);
    await check('El atajo antiguo ya no hace nada', "return sidebarState.compact", compact);
    await key('J', CS);
    await check('El nuevo funciona', "return sidebarState.compact", !compact);
    await key('J', CS);

    // Validaciones
    await run("openShortcuts(); return 1;");
    await change('design.gallery'); await key('J', CS);
    await check('Detecta conflictos', "return document.querySelector('.shortcuts-message').textContent.includes('ya está asignado')");
    await check('El conflicto no cambia nada', "return shortcuts.comboFor('design.gallery')", 'Ctrl+Shift+G');
    await key('C', ['control']);
    await check('Rechaza Ctrl+C', message.replace('textContent', 'textContent.includes("shell")'));
    await key('V', CS);
    await check('Rechaza Ctrl+Mayús+V (reservado)', message.replace('textContent', 'textContent.includes("pegar")'));
    await key('K', ['control']);
    await check('Rechaza Ctrl+letra', message.replace('textContent', 'textContent.includes("shell")'));
    await key('A');
    await check('Exige modificador', message.replace('textContent', 'textContent.includes("Incluye Ctrl")'));
    await key('Escape');
    await check('Escape cancela sin cerrar el diálogo', "return document.getElementById('shortcuts-dialog').open && !document.querySelector('.shortcut-keys.listening')");
    await change('console.settings'); await key('F9');
    await check('Admite teclas de función', "return shortcuts.comboFor('console.settings')", 'F9');
    // Quitar y restablecer
    await run("document.querySelector('.shortcut-row[data-action=\"console.settings\"] .shortcut-clear').click(); return 1;");
    await check('Quitar deja sin atajo', "return shortcuts.comboFor('console.settings')", '');
    await run("document.querySelector('.shortcut-row[data-action=\"sidebar.toggle\"] .shortcut-default').click(); return 1;");
    await check('Por defecto', "return shortcuts.comboFor('sidebar.toggle')", 'Ctrl+Shift+B');
    // Persistencia
    await check('Se guardan', "return JSON.parse(localStorage.getItem(uiStorage.key('samaapp.shortcuts'))).map['console.settings']", '');
    if (shots) { try { fs.mkdirSync(shots, { recursive: true }); win.show(); await wait(400); fs.writeFileSync(path.join(shots, 'atajos.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura: ' + e.message); } }
    await run("document.getElementById('shortcuts-reset').click(); return 1;");
    await check('Restablecer todos', "return shortcuts.list().every(s => s.combo === (s.id === 'terminal.claude' || s.id === 'terminal.codex' || s.id === 'console.settings' || s.id === 'quota.settings' ? '' : s.combo))");
    await check('Paleta recuperada', "return shortcuts.comboFor('palette.open')", 'Ctrl+Shift+P');
    await run("document.getElementById('shortcuts-dialog').close(); return 1;");
    // La paleta muestra el atajo vigente
    await key('P', CS);
    await run("const i = document.getElementById('palette-input'); i.value = 'barra lateral'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1;");
    await check('La paleta muestra el atajo', "return document.querySelector('#palette-list [role=option] small')?.textContent", 'Ctrl+Shift+B');
    await key('Escape');
    fs.writeFileSync('smoke-shortcuts-result.json', JSON.stringify({ ok: true }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-shortcuts-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
