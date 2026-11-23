// An isolated preview lets the user compare fluency without closing a live RDP.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {UserProfiles}=require('./user-profiles.cjs');
const sourceRoot=path.join(app.getPath('appData'),'ai-terminal');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-pointer-preview-'));
const previewProfiles=new UserProfiles(fixture);previewProfiles.rename('default','Prueba de fluidez');
try{
  const registry=JSON.parse(fs.readFileSync(path.join(sourceRoot,'user-profiles.json'),'utf8'));
  if(registry.active==='default'||/^user-[a-f0-9-]{36}$/.test(registry.active)){
    const directory=path.join(sourceRoot,'users',registry.active);
    for(const file of ['ui-preferences.json','remote-connections.json','projects.json','custom-terminals.json']){
      const source=path.join(directory,file);
      if(fs.existsSync(source))fs.copyFileSync(source,path.join(previewProfiles.directory(),file));
    }
  }
}catch{}
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?fixture:value);
require('./main');app.setPath=setPath;
app.whenReady().then(async()=>{
  const win=BrowserWindow.getAllWindows()[0];if(!win)return;
  if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  win.setTitle('MyTerminal · Prueba de fluidez del ratón');
  await win.webContents.executeJavaScript("sidebarState.compact=false;sidebarState.sections.connections=true;renderSidebar();status('Prueba de fluidez · ratón a 16 ms · tu sesión anterior sigue abierta. Abre tu conexión RDP para comparar.')");
  win.show();win.focus();
});
