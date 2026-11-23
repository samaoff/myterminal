const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-remote-ui-'));
const originalSetPath=app.setPath.bind(app);app.setPath=(name,value)=>originalSetPath(name,name==='userData'?fixture:value);
dialog.showOpenDialog=async()=>{throw new Error('No debe pedir un proyecto local para conectar');};
dialog.showMessageBox=async()=>({response:1});
const launches=[];
require('node-pty').spawn=(file,args,options)=>{
  launches.push({file,args,folder:options.cwd});let exit,data;
  return {onData(fn){data=fn;setImmediate(()=>data('Sesión simulada de prueba\r\n'));},onExit(fn){exit=fn;},write(){},resize(){},kill(){exit?.({exitCode:0});}};
};
require('./main');app.setPath=originalSetPath;
app.whenReady().then(async()=>{
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  const check=(value,message)=>{if(!value)throw new Error(message);};
  async function until(code){for(let index=0;index<80;index++){if(await js(code))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Timeout: '+code);}
  async function switchTo(name){
    const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    await js(`(async()=>{profileButton.click();await renderUserProfiles();[...profileList.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')===${JSON.stringify('Entrar en el perfil '+name)}).click();})()`);await loaded;
  }
  try{
    if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    const errors=[];win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
    for(const protocol of ['ssh','sftp','rdp']){
      await js(`document.getElementById('add-connection').click();remoteFields.protocol.value='${protocol}';remoteFields.protocol.dispatchEvent(new Event('change'));remoteFields.name.value='Prueba ${protocol}';remoteFields.host.value='example.invalid';remoteFields.username.value='tester';remoteFields.localFolder.value=${JSON.stringify(fixture)};remoteFitToTab.checked=true;`);
      await until('!remoteConnect.disabled');
      check(await js("remoteDialog.open"),'Editor opens');
      check(await js(`remoteFields.port.value==='${protocol==='rdp'?'3389':'22'}'`),'Protocol port');
      await js('remoteForm.requestSubmit(remoteConnect)');
      await until('!remoteDialog.open');
      if(protocol==='sftp') {
        await until('sftpLogin.open');
        await js("sftpDismiss.click();launch(null,savedRemoteConnections.find(entry=>entry.protocol==='sftp').id)");
      }
      await until(`sessions.size===${protocol==='ssh'?1:protocol==='sftp'?2:3}`);
    }
    check(launches.length===2,'Only SSH and SFTP create terminal tabs');
    check(path.basename(launches[0].file)==='ssh.exe'&&launches[0].args.includes('-p'),'SSH native executable and port');
    check(path.basename(launches[1].file)==='sftp.exe'&&launches[1].args.includes('-P'),'SFTP native executable and port');
    check(launches[1].folder===fixture,'SFTP local transfer directory');
    check(await js("sessions.get(active).kind==='rdp'&&Boolean(sessions.get(active).viewport)"),'RDP embedded in tab');
    check(await js("folder===null&&(document.getElementById('recent').textContent.includes('aparezcan')||!savedRemoteConnections.some(entry=>entry.protocol==='local'))"),'Remote launch does not select a local project');
    await until("document.getElementById('path').textContent.includes('example.invalid')");
    check(await js("document.querySelector('.header-actions .badge').textContent.includes('Escritorio remoto')"),'Remote session header');
    check(await js("document.getElementById('ai-usage').hidden"),'No AI quota for remote sessions');
    await js("openRemoteEditor(savedRemoteConnections.find(entry=>entry.protocol==='ssh'));remoteFields.name.value='Servidor editado';remoteForm.requestSubmit(remoteSave)");
    await until('!remoteDialog.open');
    check(await js("savedRemoteConnections.length===3&&savedRemoteConnections.some(entry=>entry.name==='Servidor editado')"),'Edit saved connection');
    await js("document.querySelector('[aria-label=\"Quitar Servidor editado\"]').click()");
    await until('savedRemoteConnections.length===2');
    check(await js('sessions.size===3'),'Deleting access preserves active tabs');
    await js("(async()=>{for(const [id,session] of [...sessions])if(session.kind!=='rdp')await close(id);})()");
    const second=await js("window.desktop.createUserProfile('Otro usuario')");
    check(await js(`window.desktop.switchUserProfile(${JSON.stringify(second.id)}).then(()=>false,()=>true)`),'Desktop process blocks user switch');
    await js('close(active)');
    await switchTo('Otro usuario');
    check((await js('window.desktop.remoteConnections()')).length===0,'Connections isolated per user');
    await switchTo('Principal');
    check((await js('window.desktop.remoteConnections()')).length===2,'Connections persist after profile return');
    win.setSize(950,580);
    await js("sidebarState.compact=false;renderSidebar();document.getElementById('add-connection').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    check(await js("document.getElementById('remote-editor').getBoundingClientRect().bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth"),'Connection editor at minimum window size');
    win.setSize(1380,860);await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.join(__dirname,'preview-remote-connections.png'),(await win.webContents.capturePage()).toPNG());
    check(errors.length===0,errors.join('\n'));
    fs.writeFileSync(path.join(__dirname,'smoke-remote-connections-result.json'),JSON.stringify({passed:true,simulatedNetwork:true,checks:['create through UI','save and connect button','SSH native launch','SFTP native launch','RDP embedded tab','no local project required','local SFTP directory','remote header','edit connection','remove preserves sessions','RDP profile protection','per-user isolation','profile return restores connections','minimum-size layout']},null,2));
    app.exit(0);
  }catch(error){fs.writeFileSync(path.join(__dirname,'smoke-remote-connections-result.json'),JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
