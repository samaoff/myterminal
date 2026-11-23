// Puente mínimo entre la ventana oculta de captura y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostApp', {
  send: message => ipcRenderer.send('ss-host-event', message),
  onCommand: callback => ipcRenderer.on('ss-host-command', (_event, message) => callback(message))
});
