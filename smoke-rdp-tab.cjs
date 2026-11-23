const {app,BrowserWindow,dialog,desktopCapturer}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-rdp-tab-'));
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?fixture:value);
let answer=0,nativeChild,buffer='',probeResolve;
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});dialog.showMessageBox=async()=>({response:answer});
require('node-pty').spawn=()=>{let exit;return{onData(){},onExit(fn){exit=fn;},write(){},resize(){},kill(){exit?.({exitCode:0});}};};
const cp=require('node:child_process'),spawn=cp.spawn;
cp.spawn=(file,args,options)=>{
  const child=spawn(file,args,options);
  if(/^rdp-host(?:-[a-f0-9]+)?\.exe$/.test(path.basename(file))){
    nativeChild=child;child.stdout.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const message=JSON.parse(line.trim().replace(/^\uFEFF/,''));if(message.type==='probe'&&probeResolve){probeResolve(message);probeResolve=null;}}catch{}}});
  }
  return child;
};
require('./main');app.setPath=setPath;
app.whenReady().then(async()=>{
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
  const check=(value,message)=>{if(!value)throw new Error(message);};
  async function until(code){for(let index=0;index<250;index++){if(await js(code))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Timeout '+code);}
  async function frame(){await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');}
  function probe(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No responde el control nativo')),3000);probeResolve=value=>{clearTimeout(timer);resolve(value);};nativeChild.stdin.write(JSON.stringify({type:'probe'})+'\n');});}
  try{
    if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    const errors=[];win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
    await js("document.getElementById('add-connection').click();remoteFields.protocol.value='rdp';remoteFields.protocol.dispatchEvent(new Event('change'));remoteFields.name.value='Escritorio de prueba';remoteFields.host.value='127.0.0.1';remoteFields.username.value='';");
    await until('!remoteConnect.disabled');await js('remoteForm.requestSubmit(remoteConnect)');
    await until("sessions.get(active)?.kind==='rdp'");await frame();
    const id=await js('active'),nativeParent=win.getNativeWindowHandle().readBigUInt64LE().toString();
    let native=await probe();check(native.parent===nativeParent&&native.visible&&native.loginVisible,'Real native desktop lives inside Electron');
    check(native.mouseInputIntervalMs===16,'Native mouse input batching is 16 ms');
    check(native.connected===0,'No server connection initiated by test');
    check(await js("document.querySelector('.tab.active').textContent.includes('RDP')&&document.querySelector('.header-actions .badge').textContent.includes('Escritorio remoto')"),'RDP tab and header');
    await js('openConsoleSettings()');await frame();native=await probe();check(!native.visible,'Native desktop hides behind HTML dialogs');
    await js('closeConsoleSettings()');await frame();check((await probe()).visible,'Native desktop returns after dialog closes');
    await js("applyTheme('ocean');changeTerminalPreference('fontSize',18)");
    await js("(async()=>{await pick();await launch('powershell');})()");await frame();check(!(await probe()).visible,'Desktop hides behind another tab');
    await js(`sessions.get(${JSON.stringify(id)}).tab.click()`);await frame();check((await probe()).visible,'Desktop returns using tab click');
    const width=(await probe()).width;
    await js("refreshPanel=async()=>{};showPanel('files')");await frame();check((await probe()).width<width,'Desktop resizes with inspector');
    await js("document.getElementById('panel-close').click()");await frame();
    await js('sidebarState.compact=true;renderSidebar()');await frame();check((await probe()).width>width,'Desktop resizes with sidebar');
    win.setSize(950,580);await frame();native=await probe();check(native.width>0&&native.height>0&&native.width<950,'Minimum window size');
    win.setSize(1380,860);await frame();
    await js(`sessions.get(${JSON.stringify(id)}).pane.requestFullscreen()`);await frame();check(await js('Boolean(document.fullscreenElement)'),'RDP tab expands');
    await js('document.exitFullscreen()');await frame();
    win.setAlwaysOnTop(true);win.show();win.focus();await new Promise(resolve=>setTimeout(resolve,250));
    const captureBounds=win.getBounds(),captureFile=path.join(__dirname,'preview-rdp-native-screen.png').replace(/'/g,"''");
    const contentBounds=win.getContentBounds(),viewport=await js(`(()=>{const r=sessions.get(${JSON.stringify(id)}).viewport.getBoundingClientRect();return {x:r.x,y:r.y};})()`);
    const pixelX=Math.round(contentBounds.x-captureBounds.x+viewport.x+8),pixelY=Math.round(contentBounds.y-captureBounds.y+viewport.y+8);
    const drawnColor=cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Drawing; $rdpShot = New-Object System.Drawing.Bitmap(${captureBounds.width},${captureBounds.height}); $rdpGraphics = [System.Drawing.Graphics]::FromImage($rdpShot); $rdpGraphics.CopyFromScreen(${captureBounds.x},${captureBounds.y},0,0,$rdpShot.Size); $rdpShot.Save('${captureFile}'); $rdpPixel=$rdpShot.GetPixel(${pixelX},${pixelY}); Write-Output ('{0:X2}{1:X2}{2:X2}' -f $rdpPixel.R,$rdpPixel.G,$rdpPixel.B); $rdpGraphics.Dispose(); $rdpShot.Dispose()`],{windowsHide:true,encoding:'utf8'}).trim();
    check(drawnColor==='10131A','Native panel is visibly painted over Chromium: '+drawnColor);
    win.setAlwaysOnTop(false);
    try{
      const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1380,height:860}});
      const source=sources.find(value=>value.id===win.getMediaSourceId());
      if(source)fs.writeFileSync(path.join(__dirname,'preview-rdp-tab.png'),source.thumbnail.toPNG());
    }catch{}
    await js(`close(${JSON.stringify(id)})`);await frame();check(await js(`sessions.has(${JSON.stringify(id)})`),'Cancel close preserves RDP tab');check((await probe()).visible,'Cancel close restores native view');
    answer=1;await js(`close(${JSON.stringify(id)})`);
    check(!(await js(`sessions.has(${JSON.stringify(id)})`)),'Close removes RDP tab');
    if(nativeChild.exitCode===null)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Native host remains alive')),3000);nativeChild.once('exit',()=>{clearTimeout(timer);resolve();});});
    check(errors.length===0,errors.join('\n'));
    fs.writeFileSync(path.join(__dirname,'smoke-rdp-tab-result.json'),JSON.stringify({passed:true,realNativeControl:true,networkConnected:false,checks:['save and connect from UI','real RDP child HWND inside Electron','credential panel in tab','no connection without user login','tab and header','hide for dialogs','return after dialogs','switch tabs','resize for inspector','resize for sidebar','minimum window size','fullscreen expansion','physical pixels prove native panel is drawn','cancel close restores view','close removes tab','native process exits']},null,2));app.exit(0);
  }catch(error){try{nativeChild?.kill();}catch{}fs.writeFileSync(path.join(__dirname,'smoke-rdp-tab-result.json'),JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
