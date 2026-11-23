// Comprueba el modo pantalla externa (usa la pantalla actual, porque puede no haber otra conectada).
// Uso: electron smoke-external.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
const { app, BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const hooks = require('./main').__test;
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const wait = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
    const key = async (keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await wait(350); };
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };
    const fits = "const s = sessions.get(active); const p = s.pane.getBoundingClientRect(), t = s.term.element.getBoundingClientRect(); const h = s.pane.querySelector('.pane-head'); const hb = h && !h.hidden ? h.getBoundingClientRect().bottom : p.top; return t.top >= hb - 1 && t.bottom <= p.bottom + 1 && t.right <= p.right + 1;";
    const shot = async name => { if (!shots) return; try { fs.mkdirSync(shots, { recursive: true }); win.show(); await wait(500); fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura'); } };
    win.show(); win.focus(); await wait(1000);
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); await launch('powershell'); return 1;");
    await wait(1800);
    const baseFont = await run("return terminalPreferences.fontSize;");
    const originalBounds = win.getBounds(), wasMaximized = win.isMaximized();

    // Lista de pantallas y diálogo
    const info = await run("return await window.desktop.externalState();");
    if (info.__error) throw Error(info.__error);
    if (!info.displays.length || info.displays.filter(d => d.current).length !== 1) throw Error('Lista de pantallas incorrecta: ' + JSON.stringify(info.displays));
    const currentId = info.displays.find(d => d.current).id;
    await run("await externalDisplay.open(); return 1;");
    await check('El diálogo se abre', "return document.getElementById('external-dialog').open");
    await check('Una fila por pantalla', "return document.querySelectorAll('#external-dialog .external-row').length", info.displays.length);
    await check('Sin otra pantalla lo explica', "return !!document.querySelector('#external-dialog .external-empty')", info.displays.length === 1);
    await check('El botón de Al lado refleja si está instalado', "return document.getElementById('external-launch').disabled", !info.alLado);
    await shot('externa-dialogo');

    // Entrar (pantalla completa en la pantalla actual)
    await run("document.querySelector('#external-dialog .external-row .external-go').click(); return 1;");
    await wait(2000);
    if (!win.isFullScreen()) throw Error('La ventana debía estar en pantalla completa');
    if (!hooks.externalState() || hooks.externalState().displayId !== currentId) throw Error('El estado interno no coincide');
    await check('Aplica la disposición', "return document.body.classList.contains('external-mode') && document.body.classList.contains('external-hide-sidebar')");
    await check('Oculta la barra lateral', "return getComputedStyle(document.getElementById('sidebar')).display", 'none');
    await check('Letra más grande', "return terminalPreferences.fontSize", baseFont + 3);
    await check('No guarda la letra grande en las preferencias', "return JSON.parse(localStorage.getItem(uiStorage.key('samaapp.terminal')) || '{}').fontSize !== " + (baseFont + 3));
    await check('Aparece el botón de salida', "const b = document.getElementById('external-exit'); return !b.hidden && getComputedStyle(b).display !== 'none'");
    await check('El terminal cabe', fits);
    await shot('externa-activa');

    // Opciones en vivo
    await run("const i = document.getElementById('external-big'); i.checked = false; i.dispatchEvent(new Event('change')); return 1;");
    await check('Sin letra grande vuelve el tamaño', "return terminalPreferences.fontSize", baseFont);
    await run("const i = document.getElementById('external-sidebar'); i.checked = false; i.dispatchEvent(new Event('change')); return 1;");
    await check('Con la barra lateral visible', "return getComputedStyle(document.getElementById('sidebar')).display !== 'none'");
    await run("for (const [id, v] of [['external-big', true], ['external-sidebar', true]]) { const i = document.getElementById(id); i.checked = v; i.dispatchEvent(new Event('change')); } return 1;");
    await wait(500);

    // Salir con el botón
    await run("document.getElementById('external-exit').click(); return 1;");
    await wait(2000);
    if (win.isFullScreen()) throw Error('Debía salir de la pantalla completa');
    const back = win.getBounds();
    if (win.isMaximized() !== wasMaximized) throw Error('No se restauró el estado maximizado');
    if (!wasMaximized && (Math.abs(back.x - originalBounds.x) > 2 || Math.abs(back.width - originalBounds.width) > 2)) throw Error('No se restauró el tamaño: ' + JSON.stringify([originalBounds, back]));
    if (hooks.externalState()) throw Error('El estado interno debía borrarse');
    await check('Se quita la disposición', "return !document.body.classList.contains('external-mode') && getComputedStyle(document.getElementById('sidebar')).display !== 'none'");
    await check('Vuelve la letra original', "return terminalPreferences.fontSize", baseFont);
    await check('Sigue cabiendo', fits);

    // Atajo: sin otra pantalla abre el diálogo
    await run("document.getElementById('external-dialog').open && document.getElementById('external-dialog').close(); document.body.focus(); return 1;");
    if (info.displays.length === 1) {
      await key('X', ['control', 'shift']);
      await check('Ctrl+Mayús+X abre el diálogo si no hay otra pantalla', "return document.getElementById('external-dialog').open");
      await run("document.getElementById('external-dialog').close(); return 1;");
    }
    // Desaparece la pantalla: vuelve sola
    await run("await window.desktop.externalEnter(" + currentId + "); return 1;");
    await wait(1800);
    if (!win.isFullScreen()) throw Error('No entró de nuevo');
    screen.emit('display-removed', {}, { id: currentId });
    await wait(2200);
    if (win.isFullScreen() || hooks.externalState()) throw Error('Al desaparecer la pantalla debía volver sola');
    await check('El renderer se entera', "return !document.body.classList.contains('external-mode')");
    // Salir a mano de la pantalla completa termina el modo
    await run("await window.desktop.externalEnter(" + currentId + "); return 1;");
    await wait(1800);
    win.setFullScreen(false);
    await wait(1800);
    if (hooks.externalState()) throw Error('Salir de la pantalla completa a mano debía terminar el modo');
    await check('El renderer termina el modo', "return !document.body.classList.contains('external-mode')");
    // Identificadores inválidos
    await check('Rechaza una pantalla inexistente', "try { await window.desktop.externalEnter(999999); return 'aceptada'; } catch (e) { return 'rechazada'; }", 'rechazada');
    await check('Rechaza texto como identificador', "try { await window.desktop.externalEnter('1'); return 'aceptada'; } catch (e) { return 'rechazada'; }", 'rechazada');
    // Paleta
    await key('P', ['control', 'shift']);
    await run("const i = document.getElementById('palette-input'); i.value = 'pantalla externa'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1;");
    await check('La paleta ofrece la pantalla externa', "return document.querySelector('#palette-list [role=option] .palette-title')?.textContent", 'Pantalla externa…');
    await key('Escape');
    fs.writeFileSync('smoke-external-result.json', JSON.stringify({ ok: true, pantallas: info.displays.length, alLado: info.alLado }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-external-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
