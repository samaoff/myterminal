const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-history-'));
const setPath = app.setPath.bind(app);
app.setPath = (name, value) => setPath(name, name === 'userData' ? fixture : value);
dialog.showMessageBox = async () => ({ response: 1 });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
require('./main');
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0], js = code => win.webContents.executeJavaScript(code);
  const state = path.join(fixture, 'state.json'), history = path.join(fixture, 'users', 'default', 'powershell-history.txt');
  const until = async predicate => { for (let n = 0; n < 150; n++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error('Timeout'); };
  try {
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await js('pick()'); await js("launch('powershell')");
    await until(() => js("(()=>{const b=sessions.get(active).term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString()).join('\\n').includes('Historial:');})()"));
    const command = `$o=Get-PSReadLineOption; @{prediction=$o.PredictionSource.ToString();history=$o.HistorySavePath;keys=@((Get-PSReadLineKeyHandler -Chord Tab,Ctrl+r,UpArrow).Function)} | ConvertTo-Json | Set-Content -LiteralPath '${state.replaceAll("'", "''")}'`;
    await js(`sessions.get(active).term.paste(${JSON.stringify(command)}); window.desktop.write(active, '\\r')`);
    await until(() => fs.existsSync(state));
    const value = JSON.parse(fs.readFileSync(state, 'utf8').replace(/^\uFEFF/, ''));
    if (value.prediction !== 'History' || value.history !== history || !['MenuComplete', 'ReverseSearchHistory', 'HistorySearchBackward'].every(key => value.keys.includes(key))) throw Error(JSON.stringify(value));
    await until(() => fs.existsSync(history) && fs.readFileSync(history, 'utf8').includes('Get-PSReadLineOption'));
    await js("window.desktop.write(active, 'exit\\r')");
    await until(() => js('sessions.get(active).ended'));
    fs.writeFileSync('smoke-shell-history-result.json', JSON.stringify({ passed: true, checks: ['native PTY startup', 'real terminal input', 'history predictions', 'completion and search bindings', 'profile history persistence'] }, null, 2));
    await js('close(active)'); app.exit(0);
  } catch (error) {
    const output = await js("(()=>{const b=sessions.get(active)?.term.buffer.active;return b?Array.from({length:Math.min(b.length,30)},(_,i)=>b.getLine(i).translateToString()).join('\\n'):'';})()").catch(() => '');
    fs.writeFileSync('smoke-shell-history-result.json', JSON.stringify({ passed: false, error: String(error), output }, null, 2));
    app.exit(1);
  }
});
