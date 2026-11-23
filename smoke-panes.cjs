// Comprueba la cabecera de cada panel, también con la vista dividida, y que el terminal sigue ajustado.
// Uso: electron smoke-panes.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
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
    const shot = async name => { if (!shots) return; try { fs.mkdirSync(shots, { recursive: true }); win.show(); await wait(500); fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura'); } };
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };
    // El terminal debe quedar dentro de su panel y por debajo de la cabecera.
    const fits = id => `const s = sessions.get('${id}'); const p = s.pane.getBoundingClientRect(), t = s.term.element.getBoundingClientRect(); const h = s.pane.querySelector('.pane-head'); const hb = h && !h.hidden ? h.getBoundingClientRect().bottom : p.top; return t.top >= hb - 1 && t.bottom <= p.bottom + 1 && t.right <= p.right + 1;`;
    win.show(); win.focus(); await wait(800);
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); await launch('powershell'); await launch('claude'); return 1;");
    await wait(2500);
    const ids = await run("return [...sessions.keys()];");
    if (ids.length !== 2) throw Error('Se esperaban 2 sesiones: ' + JSON.stringify(ids));
    const [first, second] = ids;

    await check('Cada panel tiene su cabecera', "return document.querySelectorAll('.pane-head').length", 2);
    await check('La cabecera del panel activo es visible', "const h = sessions.get(active).pane.querySelector('.pane-head'); return h.offsetHeight >= 24");
    await check('Muestra el nombre', "return sessions.get(active).pane.querySelector('.pane-name').textContent.length > 0");
    await check('Muestra la carpeta', "return sessions.get(active).pane.querySelector('.pane-path').textContent.includes('ai-terminal-pro')");
    await check('El terminal queda bajo la cabecera', fits(second));

    // Cambiar el nombre actualiza la cabecera
    await run("editSession('" + second + "'); sessionNameInput.value = 'API clientes'; sessionColorInput.value = '#65ba95'; sessionSave.click(); return 1;");
    await wait(1200);
    await check('La cabecera sigue al nombre', "return sessions.get('" + second + "').pane.querySelector('.pane-name').textContent", 'API clientes');
    // Doble clic abre las opciones de la pestaña
    await run("sessions.get('" + second + "').pane.querySelector('.pane-head').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1;");
    await check('Doble clic abre las opciones', "return sessionEditor.open");
    await run("sessionEditor.close(); return 1;");

    // Vista dividida: dos cabeceras visibles y cada terminal en su panel
    await run("splitChoice.value = '" + first + "'; splitChoice.dispatchEvent(new Event('change')); return 1;");
    await wait(1500);
    await check('Dividida: dos cabeceras visibles', "return [...document.querySelectorAll('.pane-head')].filter(h => !h.closest('[hidden]') && h.offsetHeight > 0).length", 2);
    await check('Dividida: el primero cabe', fits(first));
    await check('Dividida: el segundo cabe', fits(second));
    await check('Dividida: se marca el panel activo', "return getComputedStyle(document.querySelector('#workspace.workspace-split > .split-primary .pane-head')).boxShadow !== 'none'");
    await shot('paneles-divididos');

    // Ocultar y mostrar la cabecera
    const rowsWith = await run("return sessions.get('" + second + "').term.rows;");
    await run("paneHeaders.toggle(); return 1;");
    await wait(1200);
    await check('Oculta las cabeceras', "return [...document.querySelectorAll('.pane-head')].every(h => h.hidden)");
    await check('Persiste el ajuste', "return localStorage.getItem(uiStorage.key('samaapp.paneheader'))", '0');
    await check('Sin cabecera el terminal sigue cabiendo', fits(second));
    const rowsWithout = await run("return sessions.get('" + second + "').term.rows;");
    if (!(rowsWithout >= rowsWith)) throw Error('Sin cabecera deberían caber al menos las mismas filas: ' + rowsWith + ' y ' + rowsWithout);
    await run("paneHeaders.toggle(); return 1;");
    await wait(1200);
    await check('Vuelve a mostrarlas', "return [...document.querySelectorAll('.pane-head')].every(h => !h.hidden)");
    await check('Con cabecera vuelve a caber', fits(second));
    // Un solo panel
    await run("splitChoice.value = ''; splitChoice.dispatchEvent(new Event('change')); return 1;");
    await wait(1000);
    await check('Sin dividir cabe', "const s = sessions.get(active); const p = s.pane.getBoundingClientRect(), t = s.term.element.getBoundingClientRect(); return t.bottom <= p.bottom + 1 && t.top >= p.top + 24");
    await shot('panel-unico');
    fs.writeFileSync('smoke-panes-result.json', JSON.stringify({ ok: true }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-panes-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
