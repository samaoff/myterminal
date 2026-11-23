const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');const {EventEmitter}=require('node:events');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-update-ui-'));
const originalSetPath=app.setPath.bind(app);app.setPath=(name,value)=>originalSetPath(name,name==='userData'?fixture:value);
let confirm=0,quitCalls=0;const installers=[];app.quit=()=>{quitCalls++;};
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});
dialog.showMessageBox=async()=>({response:confirm});
const childProcess=require('node:child_process'),originalSpawn=childProcess.spawn;
childProcess.spawn=(file,args,options)=>{
 if(file.endsWith('MyTerminal-Setup-99.0.0.exe')){installers.push({file,args,options});const child=new EventEmitter();child.unref=()=>{};setImmediate(()=>child.emit('spawn'));return child;}
 return originalSpawn(file,args,options);
};
require('node-pty').spawn=()=>{let exit;return {onData(){},onExit(fn){exit=fn;},write(){},resize(){},kill(){exit?.({exitCode:0});}};};
const binary=Buffer.from('MZ fixture installer, never executed'),sha=createHash('sha256').update(binary).digest('hex');
const filename='MyTerminal-Setup-99.0.0.exe';let requestCount=0,mode='normal';
const updates=require('./app-updates.cjs'),OriginalUpdates=updates.AppUpdates;
updates.AppUpdates=class extends OriginalUpdates{
 constructor(options){
  super({...options,packaged:true,version:'0.10.0',fetchImpl:async(url,options)=>{
   requestCount++;
   if(mode==='private')return new Response(null,{status:401});
   if(url.includes('/releases?'))return Response.json([{tag_name:'v99.0.0',name:'MyTerminal 99.0.0',body:'Release de prueba',draft:false,prerelease:false,assets:[{name:filename},{name:filename+'.sha256'}]}]);
   if(url.endsWith('.sha256'))return new Response(sha+'  '+filename+'\n');
   return new Response(binary,{headers:{'content-length':String(binary.length)}});
  }});
 }
};
require('./main');
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 async function until(code){for(let i=0;i<120;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout '+code);}
 try{
  if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
  await until('Boolean(latestUpdateState)');
  check(requestCount===0,'No network check in development');
  await js('openVersionHistory()');
  check(await js("document.querySelector('.update-section')!==null"),'Updater inside about');
  mode='private';await js('updateCheck.click()');await until("latestUpdateState.status==='error'");
  check(await js("updateMessage.textContent.includes('token')"),'Rejected token guidance');
  await js("updateSettings.open=true;updateToken.value='glpat-fake-ui-secret';updateAuto.checked=false;updateSave.click()");
  await until('latestUpdateState.hasToken');
  check(!fs.readFileSync(path.join(fixture,'update-settings.json'),'utf8').includes('glpat-fake-ui-secret'),'Real Electron secure storage encrypts token');
  check(await js("updateToken.value===''&&!latestUpdateState.autoCheck"),'Token input cleared and preference saved');
  const restored=new OriginalUpdates({directory:fixture,version:'0.10.0',packaged:true,safeStorage:require('electron').safeStorage});
  await restored.initialize();check(restored.token==='glpat-fake-ui-secret','Native encrypted token roundtrip');
  mode='normal';await js('updateCheck.click()');await until("latestUpdateState.status==='available'");
  check(await js("!updateBadge.hidden&&updateBadge.textContent.includes('99.0.0')"),'New release badge');
  await js('updateDownload.click()');await until("latestUpdateState.status==='downloaded'");
  check(await js('!updateInstall.hidden&&!updateInstall.disabled'),'Install enabled after verification');
  await js('updateSettings.open=false;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync('preview-app-updates.png',(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('#about-close').click();pick()");await js("launch('powershell')");
  // IPC resolves only after the native confirmation, which is stubbed above.
  await js('openVersionHistory();window.desktop.installUpdate()');
  check(installers.length===0&&quitCalls===0,'Cancel preserves open sessions');
  check(await js('sessions.size===1'),'Session retained after cancel');
  confirm=1;check(await js('window.desktop.installUpdate()'),'Confirmed install succeeds');
  check(installers.length===1&&quitCalls===1,'One installer launch and one app quit');
  check(installers[0].options.detached&&installers[0].args.length===0,'Installer starts without shell or silent flags');
  check(fs.existsSync(path.join(fixture,'update-settings.json')),'User data preserved');
  fs.writeFileSync('smoke-app-updates-result.json',JSON.stringify({passed:true,simulatedReleaseAndInstaller:true,checks:['no startup network in development','about UI','rejected token error','native encrypted token storage and reload','token cleared from form','automatic check preference','new version badge','verified download','cancel preserves sessions','confirmed install launches once and quits','user data retained']},null,2));app.exit(0);
 }catch(error){fs.writeFileSync('smoke-app-updates-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
