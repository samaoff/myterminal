const {app,BrowserWindow}=require('electron');
const fs=require('fs');
require('./main');
app.whenReady().then(async()=>{
 try {
  const win=BrowserWindow.getAllWindows()[0];
  if(win.webContents.isLoading()) await new Promise(r=>win.webContents.once('did-finish-load',r));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const original=selectedTheme;
   chooseFolder(${JSON.stringify('D:/Claude/Dani/Proyectos/ai-terminal')});
   await launch('powershell');
   if(sessions.size!==1) throw Error('Terminal did not start');
   const checked=[];
   for(const id of Object.keys(appThemes)) {
    applyTheme(id);
    if(sessions.get(active).term.options.theme.background!==terminalTheme().background) throw Error('Terminal palette '+id);
    if(getComputedStyle(document.body).backgroundColor!==getComputedStyle(document.querySelector('.terminal-pane')).backgroundColor && !document.documentElement.style.getPropertyValue('--bg')) throw Error('UI palette '+id);
    if(uiStorage.getItem('samapp.theme')!==id) throw Error('Persistence '+id);
    checked.push(id);
   }
   applyTheme('invalid'); if(selectedTheme!=='samapp') throw Error('Fallback');
   applyTheme(original);
   if(!document.querySelector('.aside-bottom').textContent.includes('samaapp')) throw Error('Brand');
   return checked;
  })()`);
  fs.writeFileSync('smoke-themes-result.json',JSON.stringify({passed:true,themes:result},null,2));
  app.exit(0);
 }catch(error){fs.writeFileSync('smoke-themes-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
