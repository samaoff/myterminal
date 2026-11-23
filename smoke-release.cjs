// Exercise the real packaged executable with isolated data and a loopback CDP port.
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {createHash}=require('node:crypto');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const directory=path.resolve(process.argv[2]||path.join(__dirname,'dist-0.10','win-unpacked'));
  const expectedVersion=require('./package.json').version;
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'ai-terminal-release-'));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const child=spawn(path.join(directory,'MyTerminal.exe'),['--user-data-dir='+fixture,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port],{windowsHide:true,stdio:'ignore'});
  const pending=new Map();let socket,sequence=0;const checks=[];
  function check(value,message){if(!value)throw new Error(message);checks.push(message);}
  try{
    let target;
    for(let attempt=0;attempt<100;attempt++){await pause(150);try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(entry=>entry.type==='page');if(target)break;}catch{}}
    if(!target)throw new Error('No se abre el ejecutable empaquetado.');
    socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    socket.onmessage=event=>{const message=JSON.parse(event.data);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}};
    async function js(expression){
      const id=++sequence;let timer;
      const result=await Promise.race([new Promise(resolve=>{pending.set(id,resolve);socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true,userGesture:true}}));}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tiempo agotado en la prueba de la aplicación: '+expression.slice(0,180))),15000);})]).finally(()=>clearTimeout(timer));
      if(result.error||result.result.exceptionDetails)throw new Error(JSON.stringify(result.error||result.result.exceptionDetails));return result.result.result.value;
    }
    async function until(code){for(let index=0;index<100;index++){try{if(await js(code))return;}catch{}await pause(100);}throw new Error('No se cumple: '+code);}
    await until("typeof window.desktop!=='undefined'&&typeof launchRemoteDesktop==='function'");
    const info=await js('window.desktop.appInfo()');check(info.version===expectedVersion&&info.releases[0].version===expectedVersion,'packaged version and release history');
    await until("typeof latestUpdateState!=='undefined'&&Boolean(latestUpdateState)");
    check(await js("latestUpdateState.canInstall&&latestUpdateState.currentVersion==="+JSON.stringify(expectedVersion)), 'packaged updater recognizes installed version');
    await js('openVersionHistory()');
    check(await js("Boolean(document.getElementById('update-check'))"),'packaged update controls present');
    await js("document.getElementById('about-close').click()");
    check((await js('window.desktop.projects()')).length===0,'test data isolated from real projects');
    const connectionsReady="document.querySelector('#connections-panel')?.closest('#inspector')!==null&&Boolean(document.querySelector('#fixed-tools [data-panel=connections]'))";
    await until(connectionsReady).catch(()=>{});check(await js(connectionsReady),'connections tool opens in inspector in packaged app');
    await js('openConsoleSettings()');check(await js("document.querySelectorAll('#settings-theme option').length===Object.keys(appThemes).length&&Object.keys(appThemes).length>=16"),'all themes packaged');await js('closeConsoleSettings()');
    await js("profileButton.click();profileNameInput.value='Usuario de prueba';profileForm.requestSubmit()");
    await until("profileList.querySelectorAll('.user-profile-row').length===2");
    await js("[...profileList.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Entrar en el perfil Usuario de prueba').click()");
    await until("typeof launchRemoteDesktop==='function'&&window.desktop.initialPreferences.userProfile.name==='Usuario de prueba'");
    check(await js("selectedTheme==='pro'&&folder===null"),'packaged user profile switch through UI');
    await js("profileButton.click()");await until("profileList.querySelectorAll('.user-profile-row').length===2");
    await js("[...profileList.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Entrar en el perfil Principal').click()");
    await until("typeof launchRemoteDesktop==='function'&&window.desktop.initialPreferences.userProfile.name==='Principal'");
    await js(`(async()=>{folder=${JSON.stringify(fixture)};await launch('powershell');})()`);await until('sessions.size===1');
    // Espera al prompt (como haría una persona): antes, la ventana aún se agranda y xterm y el PTY no coinciden en columnas.
    await until("(()=>{const b=sessions.get(active).term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString().trimEnd()).some(line=>/^PS .*>$/.test(line));})()");
    // Use a literal carriage return through JSON, never shell interpolation.
    await js(`window.desktop.write(active,${JSON.stringify("Write-Output ('RELEASE_' + 'PTY_OK')"+String.fromCharCode(13))})`);
    await until("(()=>{const b=sessions.get(active).term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString()).some(line=>line.trim()==='RELEASE_PTY_OK');})()");
    checks.push('packaged native terminal input and output');
    check(await js("(()=>{const p=sessions.get(active).pane.getBoundingClientRect(),w=document.querySelector('#workspace').getBoundingClientRect();return Math.abs(p.width-w.width)<2&&Math.abs(p.height-w.height)<2;})()"),'packaged terminal fills workspace');
    await js(`window.desktop.write(active,${JSON.stringify("Write-Output ('PREDICTION_' + (Get-PSReadLineOption).PredictionSource)"+String.fromCharCode(13))})`);
    await until("(()=>{const b=sessions.get(active).term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString()).some(line=>line.trim()==='PREDICTION_History');})()");
    checks.push('packaged PSReadLine history predictions');
    await js("sessions.get(active).search.open();(()=>{const i=sessions.get(active).pane.querySelector('.terminal-search input');i.value='RELEASE_PTY_OK';i.oninput();})()");
    check(await js("sessions.get(active).term.getSelection()==='RELEASE_PTY_OK'"),'packaged terminal search finds output');
    await js("sessions.get(active).pane.querySelector('.terminal-search button:last-child').click()");
    await js("editSession(active);sessionNameInput.value='Terminal de prueba';sessionColorInput.value='#70a5eb';sessionEditorBody.requestSubmit()");
    check(await js("sessions.get(active).displayName==='Terminal de prueba'&&sessions.get(active).color==='#70a5eb'"),'packaged tab rename and color');
    await js(`window.desktop.write(active,${JSON.stringify('exit'+String.fromCharCode(13))})`);await until('sessions.get(active).ended');
    check(await js("sessions.get(active).tab.classList.contains('session-done')"),'packaged process completion marker');
    await js('close(active)');
    await js("(async()=>{const entry=await window.desktop.saveConnection({name:'SFTP empaquetado',protocol:'sftp',host:'example.invalid',port:22,username:'tester'});await connectRemote(entry)})()");
    check(await js("sftpLogin.open&&sftpUser.value==='tester'&&typeof createSftpTab==='function'"),'packaged SFTP visual login');
    await js('sftpDismiss.click()');
    await js("(async()=>{const entry=await window.desktop.saveConnection({name:'Prueba RDP integrada',protocol:'rdp',host:'127.0.0.1',port:3389,fitToTab:true});await launchRemoteDesktop(entry);})()");
    check(await js("sessions.get(active)?.kind==='rdp'&&document.querySelector('.rdp-status').textContent.includes('credenciales')"),'packaged native RDP control starts inside a tab');
    const actual=await fs.readFile(path.join(directory,'resources','rdp-host.exe'));
    const expected=await fs.readFile(require('./build-rdp-host.cjs').buildRdpHost());
    check(createHash('sha256').update(actual).digest('hex')===createHash('sha256').update(expected).digest('hex'),'installer includes the RDP component with 16 ms pointer input');
    await fs.writeFile(path.join(__dirname,'smoke-release-result.json'),JSON.stringify({passed:true,version:info.version,executable:path.join(directory,'MyTerminal.exe'),networkConnected:false,checks},null,2));
    console.log('PASS: MyTerminal '+expectedVersion+' packaged executable, updates, profiles, ConPTY and embedded RDP');
  }catch(error){await fs.writeFile(path.join(__dirname,'smoke-release-result.json'),JSON.stringify({passed:false,error:String(error),checks},null,2));console.error(String(error));process.exitCode=1;}
  finally{socket?.close();child.kill();}
})();
