// Lanza cada shell detectado y comprueba que responde a un comando.
// Uso: electron smoke-shells.cjs --user-data-dir=<carpeta temporal>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
require('./main');
const wait = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
    await wait(1500);
    const detected = await run("return (window.detectedShellList || []).map(s => s.id);");
    if (detected.__error) throw Error(detected.__error);
    if (!detected.includes('shell-cmd')) throw Error('cmd no se detectó: ' + JSON.stringify(detected));
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); return 1;");
    const results = {};
    for (const id of detected) {
      const before = await run("return sessions.size;");
      const launched = await run("await launch(" + JSON.stringify(id) + "); return sessions.size;");
      if (launched.__error) throw Error(id + ': ' + launched.__error);
      if (launched !== before + 1) throw Error(id + ': no se abrió la sesión');
      await wait(id.startsWith('shell-wsl') ? 4000 : 2000);
      await run("sessions.get(active).term.input('echo hola-pro-' + (1 + 1) + String.fromCharCode(13), true); return 1;");
      await wait(1500);
      const text = await run("const b = sessions.get(active).term.buffer.active; let t = ''; for (let i = 0; i < b.length; i++) t += (b.getLine(i)?.translateToString(true) || '') + String.fromCharCode(10); return t;");
      if (!/hola-pro-2/.test(text.replace(/echo hola-pro-\(?1 \+ 1\)?/g, ''))) throw Error(id + ': no respondió al comando. Salida: ' + String(text).slice(-200));
      results[id] = 'ok';
    }
    fs.writeFileSync('smoke-shells-result.json', JSON.stringify({ ok: true, results }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync('smoke-shells-result.json', JSON.stringify({ ok: false, error: String(error) }, null, 2));
    app.exit(1);
  }
});
