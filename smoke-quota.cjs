// Comprueba que la franja de cuota sigue a la IA de la pestaña activa y respeta todos los ajustes de cuota.
// Uso: electron smoke-quota.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
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
    const shot = async name => {
      if (!shots) return;
      try { win.show(); win.focus(); await wait(500); fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
      catch (e) { console.log('Sin captura ' + name + ': ' + e.message); }
    };
    const check = async (name, code, expected = true) => {
      const result = await run(code);
      if (result && result.__error) throw Error(name + ': ' + result.__error);
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(result));
    };

    // Sesiones simuladas: una de Claude, una de Codex y una de PowerShell.
    await run(`
      const now = Date.now();
      window.__fake = (id, kind, folder) => sessions.set(id, { kind, ended: false, folder, name: kind, tab: document.createElement('button'), pane: document.createElement('div') });
      __fake('c1', 'claude', 'D:/proyectos/api'); __fake('x1', 'codex', 'D:/proyectos/web'); __fake('p1', 'powershell', 'D:/proyectos/api');
      rememberQuota('claude', { model: 'Opus 5.5', updatedAt: now, meters: [
        { label: '5 h', remainingPercent: 62, resetAt: now + 3.2 * 3600000, scope: 'account' },
        { label: '7 días', remainingPercent: 8, resetAt: now + 3 * 86400000, scope: 'account' },
        { label: 'Contexto', remainingPercent: 41, resetAt: null, scope: 'context' }] });
      rememberQuota('codex', { model: 'GPT-5', updatedAt: now - 540000, meters: [
        { label: '5 h', remainingPercent: 94, resetAt: now + 4 * 3600000, scope: 'account' }] });
      active = 'c1'; renderQuotaCard(); return 1;`);

    // La IA mostrada depende de la pestaña activa.
    await check('Claude activo', "return document.querySelector('#quota-card .qc-line strong').textContent", 'Claude');
    await run("active = 'x1'; renderQuotaCard(); return 1;");
    await check('Codex activo', "return document.querySelector('#quota-card .qc-line strong').textContent", 'Codex');
    await check('Codex no mezcla datos de Claude', "return document.querySelectorAll('#quota-card .qc-row').length", 1);
    await run("active = 'p1'; renderQuotaCard(); return 1;");
    await check('Pestaña sin IA muestra la última', "return document.querySelector('#quota-card .qc-line strong').textContent + '|' + document.querySelector('#quota-card .qc-agent').classList.contains('idle')", 'Codex|true');
    await run("active = 'c1'; renderQuotaCard(); return 1;");

    // Cada ajuste se cambia desde su control real del diálogo y debe verse en la franja.
    const set = (id, value, event = 'change') => run(`const el = document.getElementById('${id}'); if (!el) return {__error: 'falta ${id}'}; if (el.type === 'checkbox') el.checked = ${JSON.stringify(value)}; else el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('${event}', { bubbles: true })); return 1;`);
    await check('Hay controles de cuota', "return ['usage-indicator','usage-layout','usage-font','usage-size'].every(id => document.getElementById(id))");
    await set('usage-indicator', 'segments');
    await check('Indicador: segmentos', "return !!document.querySelector('#quota-card .qc-seg') && !document.querySelector('#quota-card .qc-bar')");
    await set('usage-indicator', 'ring');
    await check('Indicador: anillo', "return !!document.querySelector('#quota-card .qc-ring')");
    await set('usage-indicator', 'number');
    await check('Indicador: número', "return !document.querySelector('#quota-card .qc-bar, #quota-card .qc-seg, #quota-card .qc-ring')");
    await set('usage-indicator', 'bar');
    await set('usage-layout', 'cards');
    await check('Disposición: tarjetas', "return document.getElementById('quota-card').dataset.layout", 'cards');
    await shot('cuota-tarjetas');
    await set('usage-layout', 'stack');
    await check('Disposición: apilada', "return document.getElementById('quota-card').dataset.layout", 'stack');
    await shot('cuota-apilada');
    await set('usage-layout', 'row');
    await set('usage-size', 'compact');
    await check('Tamaño compacto', "return document.getElementById('quota-card').dataset.size", 'compact');
    await set('usage-size', 'large');
    await check('Tamaño grande', "return parseFloat(getComputedStyle(document.getElementById('quota-card')).paddingTop) >= 10");
    await set('usage-size', 'normal');
    await set('usage-font', 'serif');
    await check('Fuente serif', "return getComputedStyle(document.getElementById('quota-card')).fontFamily.includes('Georgia')");
    await set('usage-font', 'system');
    await set('usage-textSize', '18', 'input');
    await check('Tamaño de texto', "return getComputedStyle(document.getElementById('quota-card')).fontSize", '18px');
    await set('usage-textSize', '12', 'input');
    await set('usage-barHeight', '14', 'input');
    await check('Grosor de barra', "return getComputedStyle(document.querySelector('#quota-card .qc-bar')).height", '14px');
    await set('usage-barHeight', '8', 'input');
    for (const [id, label] of [['usage-model', 'modelo'], ['usage-folder', 'carpeta'], ['usage-context', 'contexto'], ['usage-details', 'detalle de reinicio']]) {
      const control = await run(`return !!document.getElementById('${id}') || !!document.querySelector('[data-usage-field="${id.replace('usage-', '')}"]');`);
      if (!control) throw Error('Falta el control de ' + label);
    }
    const toggle = (key, value) => run(`const el = document.getElementById('usage-${key}') || document.querySelector('[data-usage-field="${key}"]') || visualControls['${key}']; if (!el) return {__error: 'falta el control ${key}'}; el.checked = ${value}; el.dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
    await toggle('model', false);
    await check('Ocultar modelo', "return !document.querySelector('#quota-card .qc-model')");
    await toggle('model', true);
    await toggle('folder', false);
    await check('Ocultar carpeta', "return !document.querySelector('#quota-card .qc-folder')");
    await toggle('folder', true);
    await check('Mostrar carpeta', "return document.querySelector('#quota-card .qc-folder').textContent", 'api');
    await toggle('details', false);
    await check('Ocultar reinicio', "return !document.querySelector('#quota-card .qc-row small')");
    await toggle('details', true);
    await toggle('context', false);
    await check('Ocultar contexto', "return [...document.querySelectorAll('#quota-card .qc-label')].every(l => l.textContent !== 'Contexto')");
    await toggle('context', true);
    await check('Mostrar contexto', "return [...document.querySelectorAll('#quota-card .qc-label')].some(l => l.textContent === 'Contexto')");
    await toggle('updated', true);
    await check('Mostrar actualización', "return !!document.querySelector('#quota-card .qc-updated')");
    await toggle('updated', false);
    await check('Avisos activos: 8 % en rojo', "return document.querySelectorAll('#quota-card .qc-row.low').length", 1);
    await toggle('alerts', false);
    await check('Avisos desactivados', "return document.querySelectorAll('#quota-card .qc-row.low, #quota-card .qc-row.warning').length", 0);
    await toggle('alerts', true);
    // Color propio
    await run("const c = document.getElementById('usage-color'); c.value = '#ff00aa'; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); return 1;");
    await toggle('customColor', true);
    await check('Color propio', "return getComputedStyle(document.querySelector('#quota-card .qc-row:not(.low):not(.warning) .qc-bar i')).backgroundColor", 'rgb(255, 0, 170)');
    // Persistencia de los ajustes
    await check('Persisten', "return JSON.parse(localStorage.getItem(uiStorage.key('samaapp.usage'))).indicator", 'bar');
    // El engranaje abre el diálogo de ajustes
    await run("document.querySelector('#quota-card .qc-gear').click(); return 1;");
    await check('El engranaje abre los ajustes', "return document.getElementById('usage-settings').open");
    await run("document.getElementById('usage-settings').close(); return 1;");
    // Presets del diálogo
    await run("[...document.querySelectorAll('#usage-settings .usage-presets button')].find(b => b.textContent === 'Restablecer').click(); return 1;");
    await check('Restablecer vuelve a la barra', "return !!document.querySelector('#quota-card .qc-bar') && document.getElementById('quota-card').dataset.layout === 'row'");
    await shot('cuota-restablecida');
    fs.writeFileSync('smoke-quota-result.json', JSON.stringify({ ok: true }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-quota-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
