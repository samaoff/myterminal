// Comprobación de la galería de diseños y de los iconos. Uso: electron smoke-design-gallery.cjs --user-data-dir=<carpeta temporal> [--shots=<carpeta>]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
require('./main');
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    const run = code => win.webContents.executeJavaScript("(async()=>{try{" + code + "}catch(e){return {__error:String(e.message)}}})()");
    const shot = async name => { if (!shots) return; try { win.show(); win.focus(); await new Promise(r => setTimeout(r, 600)); fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, name + ".png"), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log("Sin captura " + name + ": " + e.message); } };
    const result = await run(`
      const out = {};
      const pending = [...document.querySelectorAll('[data-ui-icon]')].filter(e => !e.querySelector('svg'));
      if (pending.length) throw Error('Iconos sin dibujar: ' + pending.length);
      out.icons = document.querySelectorAll('.ui-ic svg, [data-ui-icon] svg').length;
      if (!getComputedStyle(document.documentElement).getPropertyValue('--space-4')) throw Error('Faltan tokens de diseño');
      document.querySelector('#gallery-open').click();
      const dialog = document.querySelector('#design-gallery');
      if (!dialog.open) throw Error('La galería no se abre');
      out.cards = dialog.querySelectorAll('.gallery-card').length;
      if (out.cards !== 11) throw Error('Se esperaban 11 diseños y hay ' + out.cards);
      const before = JSON.stringify({ t: selectedTheme, f: terminalPreferences.fontFamily, s: sidebarState.compact });
      const apply = id => dialog.querySelector('[data-design="' + id + '"]').click();
      apply('contraste');
      if (selectedTheme !== 'contrast' || terminalPreferences.fontWeight !== '600' || terminalPreferences.fontSize !== 16) throw Error('Alto contraste no aplicado');
      if (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() !== '#ffd400') throw Error('La paleta no cambió');
      apply('volcan');
      if (selectedTheme !== 'volcano' || !sidebarState.compact || usagePreferences.size !== 'compact') throw Error('Volcán no aplicado');
      dialog.querySelector('.gallery-undo').click();
      if (selectedTheme !== 'contrast') throw Error('Deshacer no restauró el diseño anterior');
      document.querySelector('#gallery-open').click();
      dialog.querySelector('#gallery-name').value = 'Prueba';
      dialog.querySelector('#gallery-save').click();
      out.custom = dialog.querySelectorAll('.gallery-card').length;
      if (out.custom !== 1) throw Error('No se guardó el diseño propio');
      if (!JSON.parse(localStorage.getItem(uiStorage.key('samaapp.designs'))).items.length) throw Error('No se persistió');
      [...dialog.querySelectorAll('.gallery-card button')].find(b => b.textContent === 'Eliminar').click();
      if (dialog.querySelectorAll('.gallery-card').length) throw Error('No se eliminó');

      navigator.clipboard.writeText = async text => { window.__copied = text; };
      dialog.querySelector('#gallery-name').value = 'Viaje';
      dialog.querySelector('#gallery-save').click();
      [...dialog.querySelectorAll('.gallery-card button')].find(b => b.textContent === 'Copiar').click();
      await new Promise(r => setTimeout(r, 200));
      const exported = JSON.parse(window.__copied);
      if (exported.format !== 'ai-terminal-design' || exported.name !== 'Viaje') throw Error('Exportación incorrecta');
      [...dialog.querySelectorAll('.gallery-card button')].find(b => b.textContent === 'Eliminar').click();
      const importBox = dialog.querySelector('#gallery-import'), go = dialog.querySelector('#gallery-import-go'), note = dialog.querySelector('.gallery-message');
      importBox.value = 'esto no es json'; go.click();
      if (!note.textContent.includes('JSON')) throw Error('No rechazó texto inválido');
      importBox.value = JSON.stringify({ ...exported, theme: 'inventado' }); go.click();
      if (!note.textContent.includes('no existe')) throw Error('No rechazó un tema desconocido');
      importBox.value = window.__copied; go.click();
      if (dialog.querySelectorAll('.gallery-card').length !== 1) throw Error('No importó el diseño');
      [...dialog.querySelectorAll('.gallery-card button')].find(b => b.textContent === 'Eliminar').click();
      out.exportImport = 'ok';
      out.welcomeShells = document.querySelectorAll('.home-shells button').length;
      out.welcomeButton = document.querySelector('#welcome-open').textContent;
      out.font = getComputedStyle(document.documentElement).getPropertyValue('--console-font');
      out.before = before;
      return out;
    `);
    if (result && result.__error) throw Error(result.__error);
    await shot('galeria-contraste');
    await run(`document.querySelector("#gallery-open").click(); document.querySelector("#design-gallery").querySelectorAll("[role=tab]")[0].click(); document.querySelector("#design-gallery [data-design=papel]").click();`);
    await shot("galeria-papel");
    await run(`document.querySelector("#design-gallery").close();`);
    await new Promise(r => setTimeout(r, 400));
    await shot('app-papel');
    fs.writeFileSync('smoke-design-gallery-result.json', JSON.stringify({ ok: true, result }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-design-gallery-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
