const {app,BrowserWindow,dialog}=require('electron');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const rootArgument=process.argv.slice(2).find(value=>!value.startsWith('--'));const root=rootArgument?path.resolve(rootArgument):__dirname;
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-custom-ui-'));const userData=path.join(fixture,'preferences');fs.mkdirSync(userData);
const originalSetPath=app.setPath.bind(app);app.setPath=(name,value)=>originalSetPath(name,name==='userData'?userData:value);
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});let answer=0;dialog.showMessageBox=async()=>({response:answer});
const pty=require(require.resolve('node-pty',{paths:[root]})),realSpawn=pty.spawn;
pty.spawn=(file,args,options)=>realSpawn(file,args.some(value=>value==='codex.cmd'||value.includes('& claude.exe'))?['-NoLogo','-NoExit']:args,options);
require(path.join(root,'ai-usage')).CodexQuotaClient.prototype.read=async()=>({meters:[],note:'Datos de prueba'});
require(path.join(root,'main'));
app.whenReady().then(async()=>{
 try{
  const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);
  if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  const js=code=>win.webContents.executeJavaScript(code);const check=(ok,message)=>{if(!ok)throw Error(message);};
  await js('refreshCustomTerminals()');
  check(await js("document.querySelector('[data-section=sessions] .section-title').textContent==='TERMINALES'&&document.querySelectorAll('#section-sessions>[data-kind]>.terminal-icon').length===3"),'Builtin names/icons');
  await js("document.querySelector('#add-terminal').click();document.querySelector('#terminal-preset-ollama').click();document.querySelector('#terminal-form').onsubmit({preventDefault(){}})");
  check(await js("document.querySelector('#terminal-editor-error').textContent.includes('modelo')&&document.querySelector('#terminal-editor').open"),'Ollama model validation');
  await js("document.querySelector('#terminal-name').value='Chat local de prueba';document.querySelector('#terminal-command').value='powershell.exe';document.querySelector('#terminal-args').value='-NoLogo\\n-NoProfile\\n-NoExit\\n-Command\\nWrite-Output CUSTOM_NATIVE_OK';document.querySelector('#terminal-form').onsubmit({preventDefault(){}})");
  const id=await js('customTerminalProfiles[0].id');
  check(await js("!document.querySelector('#terminal-editor').open&&document.querySelector('[data-profile]').disabled&&document.querySelector('[data-profile] [data-icon=ollama]')!==null"),'Save/custom icon before project');
  await js('pick()');
  await js("document.querySelector('[data-profile]').onclick()");
  let output=false;for(let attempt=0;attempt<20&&!output;attempt++){await new Promise(resolve=>setTimeout(resolve,100));output=await js("(()=>{const b=sessions.get(active).term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString()).some(line=>line.trim()==='CUSTOM_NATIVE_OK')})()");}
  check(output,'Custom CLI native output');
  check(await js("sessions.get(active).kind==='custom'&&document.querySelector('.tab.active [data-icon=ollama]')!==null&&document.querySelector('#ai-usage').hidden"),'Custom tab metadata');
  for(const kind of ['codex','claude','powershell']){await js(`launch('${kind}')`);check(await js(`document.querySelector('.tab.active [data-icon=${kind}]')!==null`),'Tab icon '+kind);}
  await js("document.querySelector('.profile-action').click();document.querySelector('#terminal-name').value='Chat editado';document.querySelector('#terminal-form').onsubmit({preventDefault(){}})");
  check(await js("customTerminalProfiles[0].name==='Chat editado'"),'Edit profile');
  for(const terminalId of await js('[...sessions.keys()]')){answer=1;await js(`close(${JSON.stringify(terminalId)})`);}answer=0;
  win.webContents.reload();await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));await js('refreshCustomTerminals()');
  check(await js("customTerminalProfiles[0].name==='Chat editado'&&customTerminalProfiles[0].icon==='ollama'"),'Profile after reload');
  await js('pick()');await js(`launch(${JSON.stringify(id)})`);
  const count=await js('sessions.size');
  await js(`window.desktop.removeTerminal(${JSON.stringify(id)})`);check(await js('(window.desktop.terminalProfiles()).then(list=>list.length===1)'),'Cancel deletion');
  answer=1;await js(`window.desktop.removeTerminal(${JSON.stringify(id)})`);await js('refreshCustomTerminals()');
  check(await js(`sessions.size===${count}&&customTerminalProfiles.length===0`),'Deleting launcher stopped session');
  await js("(async()=>{for(let i=0;i<22;i++)await window.desktop.saveTerminal({name:'Mi terminal '+i,command:'powershell.exe',args:[],icon:i%2?'ollama':'code'});await refreshCustomTerminals();applyTheme('mac-glass');sidebarState.compact=false;renderSidebar()})()");
  for(const size of [[1000,580],[1380,860]]){
   win.setSize(...size);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const before=await js("(()=>{const a=document.querySelector('#appearance-icon').getBoundingClientRect(),v=document.querySelector('#version-history-trigger').getBoundingClientRect(),f=document.querySelector('.sidebar-fixed').getBoundingClientRect();return{top:f.top,visible:a.top>=0&&v.bottom<=innerHeight&&a.bottom<v.top,overflow:document.documentElement.scrollWidth>innerWidth}})()");
   await js("document.querySelector('.sidebar-scroll').scrollTop=100000");
   const after=await js("document.querySelector('.sidebar-fixed').getBoundingClientRect().top");
   check(before.visible&&!before.overflow&&before.top===after,'Footer not fixed '+size);
  }
  await js("document.querySelector('.sidebar-scroll').scrollTop=0;status('Vista de prueba · terminales propios')");await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync('preview-custom-terminals.png',(await win.webContents.capturePage()).toPNG());
  await js('sidebarState.compact=true;renderSidebar()');
  check(await js("(()=>{const a=document.querySelector('#appearance-icon').getBoundingClientRect(),b=document.querySelector('#about-compact').getBoundingClientRect();return a.width>=24&&a.width<=40&&a.bottom<=b.top+1&&b.bottom<=innerHeight&&!!document.querySelector('#fixed-tools #appearance-icon')})()"),'Compact footer');
  await js("document.querySelector('#appearance-icon').click()");check(await js("document.querySelector('#console-settings').open"),'Appearance access');
  fs.writeFileSync('smoke-custom-terminals-result.json',JSON.stringify({passed:true,root,checks:['built-in sidebar icons','Ollama form validation','custom native CLI I/O','tab icons for all kinds','profile editing','profile persistence','cancel launcher deletion','deletion preserves running sessions','appearance/version fixed at two window sizes','compact appearance access']},null,2));
  app.exit(0);
 }catch(error){fs.writeFileSync('smoke-custom-terminals-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
app.on('will-quit',()=>{if(path.dirname(fixture)===os.tmpdir())fs.rmSync(fixture,{recursive:true,force:true});});
