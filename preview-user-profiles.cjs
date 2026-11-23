const { app, BrowserWindow } = require('electron');
require('./main');
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0]; if (!win) return;
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  await win.webContents.executeJavaScript("profileButton.click(); status('Perfiles de usuario listos · crea un perfil y pulsa Entrar para probarlo')");
  win.show(); win.focus();
});
