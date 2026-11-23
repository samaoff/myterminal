const {app,BrowserWindow}=require('electron');
require('./main');
app.whenReady().then(async()=>{
  const win=BrowserWindow.getAllWindows()[0];if(!win)return;
  if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  await win.webContents.executeJavaScript("openRemoteEditor();remoteFields.protocol.value='rdp';remoteFields.protocol.dispatchEvent(new Event('change'));status('Escritorio remoto integrado · introduce tu equipo para abrirlo en una pestaña')");win.show();win.focus();
});
