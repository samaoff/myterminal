// Comprueba guardar, restaurar y descartar la sesión anterior, con tres arranques reales de la aplicación.
// Uso: electron smoke-restore.cjs --user-data-dir=<carpeta temporal> [--phase=save|restore|discard]
const { app, BrowserWindow } = require('electron');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const phase = (process.argv.find(a => a.startsWith('--phase=')) || '').slice(8);
const dataArgument = process.argv.find(a => a.startsWith('--user-data-dir='));
const wait = ms => new Promise(r => setTimeout(r, ms));

if (!phase) {
  // Orquestador: lanza cada fase como un proceso nuevo con la misma carpeta de datos.
  app.whenReady().then(() => {
    const report = {};
    let ok = true;
    for (const name of ['save', 'restore', 'discard']) {
      const result = path.join(__dirname, 'smoke-restore-' + name + '-result.json');
      fs.rmSync(result, { force: true });
      spawnSync(process.execPath, [__filename, '--phase=' + name, dataArgument, ...process.argv.filter(a => a.startsWith('--shots='))], { cwd: __dirname, stdio: 'ignore', timeout: 120000 });
      try { report[name] = JSON.parse(fs.readFileSync(result, 'utf8')); } catch { report[name] = { ok: false, error: 'sin resultado' }; }
      fs.rmSync(result, { force: true });
      if (!report[name].ok) { ok = false; break; }
    }
    fs.writeFileSync(path.join(__dirname, 'smoke-restore-result.json'), JSON.stringify({ ok, report }, null, 2));
    app.exit(ok ? 0 : 1);
  });
} else {
  require('./main');
  app.whenReady().then(async () => {
    const out = path.join(__dirname, 'smoke-restore-' + phase + '-result.json');
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
      const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
      const check = async (name, code, expected = true) => {
        const result = await run(code);
        if (result && result.__error) throw Error(name + ': ' + result.__error);
        if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
      };
      const stored = "return JSON.parse(localStorage.getItem(uiStorage.key('samaapp.workspace')) || '{\"tabs\":[]}').tabs.length";
      await wait(1200);

      if (phase === 'save') {
        await check('Arranca sin sesión anterior', "return sessionRestore.available()", 0);
        await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); return 1;");
        await run("await launch('powershell'); await launch('powershell'); return 1;");
        await wait(1500);
        // Renombrar desde el diálogo real de opciones de pestaña (comprueba también que el nombre va a la etiqueta y no al punto de estado)
        const first = await run("return [...sessions.keys()][0];");
        await run("editSession('" + first + "'); sessionNameInput.value = 'Servidor'; sessionColorInput.value = '#70a5eb'; sessionSave.click(); return 1;");
        await check('El nombre va a la etiqueta', "const t = sessions.values().next().value.tab; return t.querySelector('span:not(.close):not(.tab-dot)').textContent", 'Servidor');
        await check('El punto de estado no recibe texto', "return sessions.values().next().value.tab.querySelector('.tab-dot').textContent", '');
        await wait(4500);
        await check('Se guarda el estado', stored, 2);
        await check('Guarda el nombre y el color', "const t = JSON.parse(localStorage.getItem(uiStorage.key('samaapp.workspace'))).tabs[0]; return t.name + '|' + t.color", 'Servidor|#70a5eb');
      }

      if (phase === 'restore') {
        await check('Hay sesión anterior', "return sessionRestore.available()", 2);
        await check('La tarjeta es visible', "return !document.getElementById('restore-card').hidden && document.getElementById('restore-go').textContent", 'Restaurar 2 pestañas');
        await check('No se inicia nada solo', "return sessions.size", 0);
        const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
        if (shots) { try { fs.mkdirSync(shots, { recursive: true }); win.show(); await wait(500); fs.writeFileSync(path.join(shots, 'restaurar.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('Sin captura'); } }
        await wait(2500);
        await check('No se pierde lo guardado antes de decidir', stored, 2);
        await run("document.getElementById('restore-go').click(); return 1;");
        await wait(5000);
        await check('Se restauran las pestañas', "return sessions.size", 2);
        await check('Se restaura el nombre', "return [...sessions.values()][0].tab.querySelector('span:not(.close):not(.tab-dot)').textContent", 'Servidor');
        await check('Se restaura el color', "return [...sessions.values()][0].color", '#70a5eb');
        await check('Queda activa la misma pestaña', "return active === [...sessions.keys()][1]");
        await check('La tarjeta se oculta', "return document.getElementById('restore-card').hidden");
        await wait(3000);
        await check('El estado sigue guardado', stored, 2);
      }

      if (phase === 'discard') {
        await check('Hay sesión anterior', "return sessionRestore.available()", 2);
        await run("await openCommandPalette(); const i = document.getElementById('palette-input'); i.value = 'restaurar sesion'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1;");
        await check('La paleta ofrece restaurar', "return document.querySelector('#palette-list [role=option] .palette-title')?.textContent.startsWith('Restaurar la sesión anterior')");
        await run("document.getElementById('command-palette').close(); return 1;");
        await run("document.getElementById('restore-discard').click(); return 1;");
        await check('Descartar borra lo guardado', stored, 0);
        await check('Descartar oculta la tarjeta', "return document.getElementById('restore-card').hidden && sessionRestore.available() === 0");
      }
      fs.writeFileSync(out, JSON.stringify({ ok: true }));
      app.exit(0);
    } catch (error) {
      fs.writeFileSync(out, JSON.stringify({ ok: false, error: String(error) }));
      app.exit(1);
    }
  });
}
