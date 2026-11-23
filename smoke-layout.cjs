const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-layout-'));
const originalSetPath=app.setPath.bind(app);app.setPath=(name,value)=>originalSetPath(name,name==='userData'?fixture:value);
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});
require('./main');
app.whenReady().then(async()=>{
 try{
  const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
  const js=code=>win.webContents.executeJavaScript(code);
  await js("pick();");await js("launch('powershell')");
  await js("new Promise(resolve=>sessions.get(active).term.write('\\r\\n'+('Mensaje largo de terminal '.repeat(25))+'\\r\\n',resolve))");
  const results=[];
  win.unmaximize();await new Promise(r=>setTimeout(r,300));
  for(const width of [950,1100,1380]){
   win.setSize(width,760);await new Promise(r=>setTimeout(r,300));
   for(const panel of ['skills',null,'files','changes','skills']){
    if(panel)await js(`showPanel(${JSON.stringify(panel)})`);else await js("document.querySelector('#panel-close').click()");
    await new Promise(r=>setTimeout(r,180));
    if(panel==='skills')await js("document.querySelector('#panel-message').textContent='Mensaje '+('ruta-muy-larga-sin-espacios/'.repeat(30));document.querySelector('#panel-content').prepend(node('strong','skill-muy-larga-'.repeat(35)))");
    const measure=await js(`(()=>{
      const w=document.querySelector('#workspace').getBoundingClientRect(),s=sessions.get(active),screen=s.pane.querySelector('.xterm-screen').getBoundingClientRect(),expected=terminalTargetSize(s);
      const inspector=document.querySelector('#inspector'),bounds=inspector.getBoundingClientRect();
      return {cols:s.term.cols,expected:expected.cols,screenRight:screen.right,workspaceRight:w.right,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,panelOverflow:!inspector.hidden && inspector.scrollWidth>bounds.width+1};
    })()`);
    results.push({width,panel,...measure});
    if(measure.cols!==measure.expected||measure.screenRight>measure.workspaceRight+1||measure.scrollWidth>measure.viewport||measure.panelOverflow)throw Error('Layout overflow: '+JSON.stringify(results.at(-1)));
   }
  }
  fs.writeFileSync('smoke-layout-result.json',JSON.stringify({passed:true,results},null,2));
  fs.writeFileSync('preview-layout.png',(await win.webContents.capturePage()).toPNG());app.exit(0);
 }catch(error){fs.writeFileSync('smoke-layout-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
app.on('will-quit',()=>fs.rmSync(fixture,{recursive:true,force:true}));
