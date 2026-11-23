const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawnSync}=require('node:child_process');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-sidebar-'));
const applicationArgument=process.argv.slice(2).find(value=>!value.startsWith('--'));const applicationRoot=applicationArgument?path.resolve(applicationArgument):__dirname;
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});dialog.showMessageBox=async()=>({response:1});
const {CodexQuotaClient}=require(path.join(applicationRoot,'ai-usage'));
CodexQuotaClient.prototype.read=async()=>({provider:'codex',meters:[{label:'5 h',remainingPercent:80,resetAt:Date.now()+600000,scope:'account'},{label:'7 días',remainingPercent:45,resetAt:Date.now()+86400000,scope:'account'}],updatedAt:Date.now(),note:'Cuota de la cuenta · fixture'});
const pty=require(require.resolve('node-pty',{paths:[applicationRoot]}));const realSpawn=pty.spawn;const launches=[];
pty.spawn=(file,args,options)=>{launches.push({args,env:options.env});return realSpawn(file,['-NoLogo','-NoExit'],options);};
require(path.join(applicationRoot,'main'));
app.whenReady().then(async()=>{
 let saved;
 try{
  const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
  const js=code=>win.webContents.executeJavaScript(code);const assert=(value,message)=>{if(!value)throw Error(message);};
  saved=await js("localStorage.getItem('samaapp.sidebar')");
  await js("sidebarState.compact=false;for(const key of Object.keys(sidebarState.sections))sidebarState.sections[key]=true;renderSidebar();pick()");
  await js("launch('codex');");await js('refreshUsage()');
  assert(await js("document.querySelector('#usage-meters').textContent.includes('80% restante')"),'Codex quota missing');
  const codexId=await js('active');
  for(const key of ['sessions','recent']){
   await js(`document.querySelector('[data-section="${key}"] .section-toggle').click()`);
   assert(await js(`document.querySelector('#section-${key}').hidden`),'Section did not collapse '+key);
   await js(`document.querySelector('[data-section="${key}"] .section-toggle').click()`);
   assert(await js(`!document.querySelector('#section-${key}').hidden`),'Section did not reopen '+key);
  }
  await js("document.querySelector('#sidebar-toggle').click()");
  assert(await js("document.querySelector('#sidebar').getBoundingClientRect().width===68"),'Compact rail width');
  assert(await js("Array.from(document.querySelectorAll('.section-content')).every(el=>el.hidden)"),'Compact contents visible');
  await js("document.querySelector('#fixed-tools [data-panel=files]').click()");
  assert(await js("sidebarState.compact&&!document.querySelector('#inspector').hidden&&panel==='files'"),'Fixed tool access in compact mode');
  await js("(async()=>{await launch('claude');await refreshUsage();})()");
  assert(await js("document.querySelectorAll('#usage-meters progress').length===0"),'Unknown quota fabricated');
  const claudeId=await js('active'),launch=launches.at(-1);
  assert(launch.args.join(' ').includes('--settings')&&launch.args.join(' ').includes('--session-id'),'Claude bridge options');
  const payload={session_id:launch.env.AI_TERMINAL_CLAUDE_SESSION,model:{display_name:'Fixture Claude'},context_window:{remaining_percentage:65},rate_limits:{five_hour:{used_percentage:70,resets_at:Date.now()/1000+600}}};
  const script=path.join(path.dirname(launch.env.AI_TERMINAL_USAGE_FILE),'statusline.ps1');
  const bridge=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{env:launch.env,input:JSON.stringify(payload),encoding:'utf8',windowsHide:true});
  assert(bridge.status===0,'Claude bridge execution '+bridge.stderr);await js('refreshUsage()');
  assert(await js("document.querySelector('#usage-meters').textContent.includes('30% restante')&&document.querySelector('#usage-meters').textContent.includes('65% restante')"),'Claude quota/context missing');
  await js("(async()=>{await launch('powershell');await refreshUsage();})()");assert(await js("document.querySelector('#ai-usage').hidden"),'Usage visible in shell');
  await js(`activate(${JSON.stringify(codexId)});refreshUsage()`);assert(await js("document.querySelector('#usage-agent').textContent==='Codex'&&document.querySelector('#usage-meters').textContent.includes('80% restante')"),'Usage tab mismatch');
  await js(`activate(${JSON.stringify(claudeId)});refreshUsage()`);
  for(const compact of [true,false]){
   await js(`sidebarState.compact=${compact};renderSidebar();showPanel('skills')`);
   await new Promise(r=>setTimeout(r,200));
   assert(await js(`(()=>{const w=document.querySelector('#workspace').getBoundingClientRect(),s=sessions.get(active);return s.term.cols===s.fit.proposeDimensions().cols&&s.pane.querySelector('.xterm-screen').getBoundingClientRect().right<=w.right+1&&document.documentElement.scrollWidth<=innerWidth;})()`),'Terminal/sidebar/usage layout overflow');
  }
  await js("status('Vista de prueba · datos de cuota simulados')");
  fs.writeFileSync('preview-sidebar.png',(await win.webContents.capturePage()).toPNG());
  await js("sidebarState.compact=true;renderSidebar()");
  fs.writeFileSync('preview-sidebar-compact.png',(await win.webContents.capturePage()).toPNG());
  await js("sidebarState.compact=true;sidebarState.sections.recent=false;renderSidebar()");
  for(const id of await js('[...sessions.keys()]'))await js(`close(${JSON.stringify(id)})`);
  win.webContents.reload();await new Promise(r=>win.webContents.once('did-finish-load',r));
  assert(await js("sidebarState.compact===true&&sidebarState.sections.recent===false"),'Sidebar persistence');
  if(saved===null)await js("localStorage.removeItem('samaapp.sidebar')");else await js(`localStorage.setItem('samaapp.sidebar',${JSON.stringify(saved)})`);
  fs.writeFileSync('smoke-sidebar-result.json',JSON.stringify({passed:true,applicationRoot,checks:['three collapsible groups','68px icon rail','category expansion','sidebar persistence','Codex account meters','Claude statusline integration','quota/context separation','unknown values omitted','active tab isolation','PowerShell hides meters','terminal fit with inspector and usage']},null,2));
  app.exit(0);
 }catch(error){fs.writeFileSync('smoke-sidebar-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
app.on('will-quit',()=>{if(path.dirname(fixture)===os.tmpdir())fs.rmSync(fixture,{recursive:true,force:true});});
