const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main');
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  const js = code => win.webContents.executeJavaScript(code);
  try {
    const result = await js(`(async () => {
      const original = { ...usagePreferences };
      const sample = { model: 'Modelo de ejemplo', updatedAt: Date.now(), note: 'Vista de prueba · datos simulados', meters: [
        { label: '5 h', remainingPercent: 72, resetAt: Date.now() + 3600000, scope: 'account' },
        { label: '7 días', remainingPercent: 48, resetAt: Date.now() + 86400000, scope: 'account' },
        { label: 'Contexto de la sesión', remainingPercent: 65, resetAt: null, scope: 'context' }
      ] };
      const session = { name: 'Vista de prueba', folder: ${JSON.stringify(__dirname)}, ended: false };
      const check = (value, message) => { if (!value) throw new Error(message); };
      try {
        paintUsage(sample, session);
        document.getElementById('usage-customize').click();
        check(usageSettings.open, 'No se abre el modal');
        for (const size of ['compact', 'normal', 'large']) {
          usageSize.value = size; usageSize.dispatchEvent(new Event('change'));
          check(document.getElementById('ai-usage').dataset.size === size, 'Tamaño incorrecto');
        }
        for (const key of ['model', 'folder', 'updated', 'details', 'context']) {
          const input = document.querySelector('[data-usage-field=' + key + ']');
          input.checked = false; input.dispatchEvent(new Event('change'));
        }
        check(document.getElementById('usage-metadata').hidden, 'Metadatos visibles');
        check(document.querySelectorAll('#usage-meters .usage-meter').length === 2, 'Contexto visible');
        check(!document.querySelector('#usage-meters .usage-meter small'), 'Detalles visibles');
        for (const style of ['bar','segments','ring','number']) {
          const input = document.getElementById('usage-indicator'); input.value = style; input.dispatchEvent(new Event('change'));
          check(document.getElementById('ai-usage').dataset.indicator === style, 'Indicador incorrecto');
          check(document.getElementById('usage-live-preview').dataset.indicator === style, 'Vista previa incorrecta');
        }
        for (const layout of ['row','cards','stack']) {
          const input = document.getElementById('usage-layout'); input.value = layout; input.dispatchEvent(new Event('change'));
          check(document.getElementById('ai-usage').dataset.layout === layout, 'Distribución incorrecta');
        }
        const font = document.getElementById('usage-font'); font.value = 'consolas'; font.dispatchEvent(new Event('change'));
        const text = document.getElementById('usage-textSize'); text.value = '24'; text.dispatchEvent(new Event('input'));
        check(getComputedStyle(document.querySelector('#usage-meters .usage-meter')).fontSize === '24px', 'Tamaño de fuente incorrecto');
        check(getComputedStyle(document.querySelector('#usage-meters .usage-meter')).fontFamily.includes('Consolas'), 'Fuente incorrecta');
        usagePreferences = { ...original }; saveUsageDisplay();
        usagePreferences = { ...original, model: true, folder: true, updated: true, details: true, context: true };
        saveUsageDisplay();
        await new Promise(resolve => setTimeout(resolve, 200));
        const prefs = await window.desktop.savePreferences({ usage: usagePreferences });
        check(prefs === true, 'No se guardan preferencias');
        check(document.getElementById('usage-metadata').textContent.includes('Modelo de ejemplo'), 'Falta modelo');
        check(document.getElementById('usage-metadata').textContent.includes(session.folder), 'Falta carpeta');
        check(document.documentElement.scrollWidth <= innerWidth, 'Desbordamiento horizontal');
        return { passed: true, checks: ['modal', 'three sizes', 'field visibility', 'context filtering', 'details filtering', 'preference saving', 'model and folder', 'layout', 'four indicators', 'live preview', 'three layouts', '24px text', 'font family'] };
      } finally {
        usagePreferences = original; saveUsageDisplay(); usageSettings.close();
      }
    })()`);
    fs.writeFileSync(path.join(__dirname, 'smoke-usage-display-result.json'), JSON.stringify(result, null, 2));
    // Keep the real app open for manual testing, with clearly labelled sample data.
    await js("status('Pruebas correctas · panel con datos simulados para probar la visualización'); clearInterval(usageRefreshTimer);");
    win.show(); win.focus();
  } catch (error) {
    fs.writeFileSync(path.join(__dirname, 'smoke-usage-display-result.json'), JSON.stringify({ passed: false, error: String(error) }, null, 2));
    win.show();
  }
});
