const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-enhancements-'));
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?fixture:value);
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});
dialog.showMessageBox=async()=>({response:1});
const terminals=[];
require('node-pty').spawn=()=>{
  const t={writes:[],paused:0,resumed:0,onData(fn){this.data=fn;},onExit(fn){this.exit=fn;},write(text){this.writes.push(text);},resize(){},pause(){this.paused++;},resume(){this.resumed++;},kill(){this.exit?.({exitCode:0});}};
  terminals.push(t);return t;
};
require('./main');
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
  const errors=[];win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
  check(await js("document.querySelector('#section-recent .sidebar-project')!==null"),'Projects grouped');
  await js("connectionTool.click()");
  check(await js("panel==='connections'&&!document.querySelector('#inspector').hidden&&!connectionsSection.hidden&&connectionsSection.closest('#inspector')!==null"),'Connections in inspector');
  await js("document.querySelector('#panel-close').click();pick()");
  await js("launch('powershell')");await js("launch('codex')");
  check(await js("[...sessions.values()].every(s=>s.tab.draggable)"),'Session tabs draggable');
  await js('splitToggle.click()');await wait(100);
  check(await js("[...sessions.values()].filter(s=>!s.pane.hidden).length===2"),'Two sessions visible');
  for(const width of [950,1380])for(const direction of ['columns','rows']){
   win.setSize(width,760);await js(`splitDirection='${direction}';renderWorkspaceLayout()`);await wait(100);
   check(await js("[...sessions.values()].filter(s=>!s.pane.hidden).every(s=>{const b=s.pane.getBoundingClientRect(),screen=s.pane.querySelector('.xterm-screen').getBoundingClientRect();return s.term.cols===s.fit.proposeDimensions().cols&&screen.right<=b.right+1&&b.bottom<=document.querySelector('#workspace').getBoundingClientRect().bottom+1})"),'Split fits '+width+' '+direction);
  }
  await js("splitMax.click()");check(await js("[...sessions.values()].filter(s=>!s.pane.hidden).length===1"),'Maximize');
  await js("splitMax.click();splitHandle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
  check(await js('splitRatio===45'),'Keyboard divider');
  await js("splitToggle.click();(()=>{const transfer=new DataTransfer();transfer.setData('application/x-ai-terminal-session',[...sessions.keys()].find(id=>id!==active));document.querySelector('#workspace').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}))})()");
  check(await js("splitPeer!==null&&[...sessions.values()].filter(s=>!s.pane.hidden).length===2"),'Drag tab into split');
  await js("new Promise(resolve=>sessions.get(active).term.write('Error de ejemplo',resolve))");
  await js("sessions.get(active).term.select(0,0,16);selectionAction.click()");
  check(await js('aiReview.open&&aiText.value.includes("Error de ejemplo")'),'Selection preview');
  const before=terminals.reduce((n,t)=>n+t.writes.length,0);
  check(before===0,'Preview sends nothing');
  await js("aiSend.click()");await wait(50);
  const sent=terminals.flatMap(t=>t.writes).join('');
  check(sent.includes('Error de ejemplo')&&!sent.endsWith('\r'),'Reviewed paste without Enter');
  // High output crosses the pressure threshold, then resumes after xterm consumes it.
  for(let i=0;i<4000;i++)terminals[1].data('salida '+i+' '+'.'.repeat(90)+'\r\n');
  await wait(1500);
  check(terminals[1].paused>0&&terminals[1].resumed>0,'Output pressure pause/resume');
  await js("new Promise(resolve=>sessions.get(active).term.write('',resolve))");
  check(await js("(()=>{const b=sessions.get(active).term.buffer.active;for(let i=0;i<b.length;i++)if(b.getLine(i).translateToString().includes('salida 3999'))return true;return false})()"),'Output tail retained');
  await js("showPanel('connections');showPanel('files')");
  check(await js("connectionsSection.hidden&&!document.querySelector('#panel-content').hidden"),'Panel switching restores content');
  check(errors.length===0,errors.join('\n'));
  await js('close(active)');check(await js("[...sessions.values()].filter(s=>!s.pane.hidden).length===1"),'Close split session');
  fs.writeFileSync('smoke-workspace-enhancements-result.json',JSON.stringify({passed:true,checks:['project grouping','connections inspector','two visible sessions','both orientations at minimum and full widths','maximize and restore','keyboard divider','selection preview','explicit paste without Enter','output pause and resume','output tail retained','panel switching','closing split session']},null,2));
  fs.writeFileSync('preview-workspace-enhancements.png',(await win.webContents.capturePage()).toPNG());app.exit(0);
 }catch(error){fs.writeFileSync('smoke-workspace-enhancements-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
