// Comprueba la barra de título integrada, las pestañas con estado y la barra de estado.
// Uso: electron smoke-shell.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
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
    win.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 2) console.log('RENDERER', message, source + ':' + line); });
    const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
    const shot = async name => {
      if (!shots) return;
      try { win.show(); win.focus(); await wait(600); fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
      catch (e) { console.log('Sin captura ' + name + ': ' + e.message); }
    };
    const out = {};
    let r = await run("chooseFolder(" + JSON.stringify(__dirname.replace(/\\/g, '/')) + "); await launch('powershell'); await launch('powershell'); return {sessions: sessions.size, header: document.querySelector('main > header').offsetHeight, tabsInHeader: !!document.querySelector('main > header #tabs')};");
    if (r.__error) throw Error(r.__error);
    Object.assign(out, r);
    if (out.sessions !== 2 || out.header !== 44 || !out.tabsInHeader) throw Error('Estructura incorrecta: ' + JSON.stringify(out));
    await wait(2000);
    r = await run("return [...document.querySelectorAll('#tabs .tab .tab-dot')].map(d => d.dataset.state);");
    out.dotsDuring = r;
    if (r.length !== 2) throw Error('Faltan puntos de estado: ' + JSON.stringify(r) + ' ' + JSON.stringify(await run("return {tabs: document.querySelectorAll('#tabs .tab').length, sessions: sessions.size, html: document.querySelector('#tabs').innerHTML.slice(0,300)};")));
    await wait(3500);
    r = await run("return {dots: [...document.querySelectorAll('#tabs .tab .tab-dot')].map(d => d.dataset.state), branch: document.querySelector('#sb-branch').textContent, branchHidden: document.querySelector('#sb-branch').hidden, project: document.querySelector('#sb-project').textContent, font: document.querySelector('#sb-font').textContent};");
    Object.assign(out, r);
    if (r.branchHidden || !r.branch) throw Error('La rama no aparece en la barra de estado: ' + JSON.stringify(r));
    if (r.project !== 'ai-terminal-pro') throw Error('Proyecto incorrecto: ' + r.project);
    await run("const id = active; sessions.get(id).term.input('Get-Date -Format yyyy' + String.fromCharCode(13), true); return 1;");
    await wait(2500);
    await run("sessions.get(active).term.input('Get-Item no-existe-nada' + String.fromCharCode(13), true); return 1;");
    await wait(2500);
    out.blocks = await run("return document.querySelectorAll('.xterm-decoration').length;");
    await run("sessions.get(active).ended = true; return 1;");
    await wait(900);
    out.dotsEnded = await run("return [...document.querySelectorAll('#tabs .tab .tab-dot')].map(d => d.dataset.state);");
    await run("for (const name of ['tienda-web', 'api-clientes']) { const row = document.createElement('div'); row.className = 'recent-row'; const b = document.createElement('button'); b.className = 'recent'; b.textContent = String.fromCharCode(9656) + ' ' + name; row.append(b); document.getElementById('recent').append(row); } savedRemoteConnections.push({id: 'a', name: 'prod-01', protocol: 'ssh', host: 'prod-01'}, {id: 'b', name: 'Archivos web', protocol: 'sftp', host: 'web'}, {id: 'c', name: 'Oficina', protocol: 'rdp', host: 'pc'}); window.paintRemoteGroup(); await document.fonts.load('500 14px \"IBM Plex Sans\"'); return document.fonts.check('500 14px \"IBM Plex Sans\"');");
    out.plex = await run("return document.fonts.check('500 14px \"IBM Plex Sans\"') && getComputedStyle(document.body).fontFamily.includes('IBM Plex Sans');");
    if (!out.plex) throw Error('IBM Plex Sans no se cargó');
    await run("const now = Date.now(); paintUsage({ model: 'Opus 5.5', updatedAt: now, meters: [{ label: '5 h', remainingPercent: 62, resetAt: now + 3.2 * 3600000, scope: 'account' }, { label: '7 dias', remainingPercent: 21, resetAt: now + 3 * 86400000, scope: 'account' }] }, { kind: 'claude', name: 'Claude', folder: 'x', ended: false }); window.rememberQuota('codex', { meters: [{ label: '5 h', remainingPercent: 94, resetAt: now + 4 * 3600000, scope: 'account' }, { label: '7 dias', remainingPercent: 8, resetAt: now + 5 * 86400000, scope: 'account' }], model: 'GPT-5', updatedAt: now - 540000 }); window.renderQuotaCard(); return 1;");
    await wait(300);
    await run("view('main.js', 'ai-terminal-pro · modificado', ''); renderDiff(['diff --git a/main.js b/main.js','--- a/main.js','+++ b/main.js','@@ -212,5 +212,5 @@','  ipcMain.handle(\"git-info\", (_e, folder) =>','-   tools.gitInfo(folder));','+   tools.gitInfo(allowedProject(folder)));','  ipcMain.handle(\"ai-usage\", () => 1);','-   const tools = null;','+   // validado por esquema'].join(String.fromCharCode(10))); return 1;");
    await wait(500);
    out.remoto = await run("const b = document.querySelector('#fixed-tools .tool-buttons [data-panel=connections]'); const r = b.getBoundingClientRect(); const svg = b.querySelector('svg').getBoundingClientRect(); return { display: getComputedStyle(b).display, width: Math.round(r.width), svgInside: svg.left >= r.left && svg.right <= r.right };");
    if (out.remoto.display !== 'flex' || out.remoto.width > 40 || !out.remoto.svgInside) throw Error('Conexiones no está en la fila de iconos: ' + JSON.stringify(out.remoto));
    out.docked = await run("const v = document.getElementById('viewer'); return {open: v.open, parent: v.parentElement.id, modal: v.matches(':modal')};");
    if (!out.docked.open || out.docked.parent !== 'work-area' || out.docked.modal) throw Error('El visor no se acopló: ' + JSON.stringify(out.docked));
    await shot('shell-oscuro');
    await run("applyTheme('arctic'); return 1;");
    await wait(400);
    await shot('shell-artico');
    fs.writeFileSync('smoke-shell-result.json', JSON.stringify({ ok: true, out }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-shell-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
