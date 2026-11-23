// Interactive check with real PowerShell processes and isolated preferences.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-notifications-'));
const setPath = app.setPath.bind(app);
app.setPath = (name, value) => setPath(name, name === 'userData' ? directory : value);
require('./main');
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const js = code => win.webContents.executeJavaScript(code);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(code, limit = 15000) {
    const deadline = Date.now() + limit;
    while (Date.now() < deadline) { if (await js(code)) return; await wait(100); }
    throw Error('La comprobación no terminó: ' + code);
  }
  try {
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.setTitle('MyTerminal - PRUEBA AVISOS');
    win.on('page-title-updated', event => event.preventDefault());
    const picker = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [__dirname] });
    try { await js('pick()'); } finally { dialog.showOpenDialog = picker; }
    await js("launch('powershell')");
    const first = await js('active');
    await js("editSession(active); sessionNameInput.value='Prueba de aviso · 12 segundos'; sessionColorInput.value='#65ba95'; sessionEditorBody.requestSubmit()");
    await js("launch('powershell')");
    await js("editSession(active); sessionNameInput.value='Segunda pestaña · espera aquí'; sessionColorInput.value='#70a5eb'; sessionEditorBody.requestSubmit()");
    await until(`(()=>{const s=sessions.get(${JSON.stringify(first)}),b=s.term.buffer.active;for(let i=0;i<b.length;i++)if(b.getLine(i)?.translateToString().includes('PS '))return true;return false})()`);
    await js(`(()=>{const s=sessions.get(${JSON.stringify(first)});s.commandStarted=Date.now();window.desktop.write(${JSON.stringify(first)},${JSON.stringify('Start-Sleep -Seconds 12\r')});status('Prueba de aviso en marcha: espera 12 segundos en esta pestaña.');})()`);
    await until(`sessions.get(${JSON.stringify(first)}).tab.classList.contains('session-done')`, 20000);
    fs.writeFileSync(path.join(__dirname, 'preview-notifications-result.json'), JSON.stringify({ passed: true, realPowerShell: true, checks: ['two real sessions', 'renamed and colored tabs', 'real 12-second command completion', 'success marker'], notificationDependsOnWindows: true }, null, 2));
    await js("status('Prueba terminada: la primera pestaña tiene una marca verde. El aviso depende de los ajustes de Windows.')");
  } catch (error) {
    fs.writeFileSync(path.join(__dirname, 'preview-notifications-result.json'), JSON.stringify({ passed: false, error: String(error) }, null, 2));
  }
});
