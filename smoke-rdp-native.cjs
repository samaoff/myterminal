const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-native-rdp-')));
app.whenReady().then(async()=>{
  let child;
  try{
    const win=new BrowserWindow({width:900,height:650,show:true,webPreferences:{sandbox:true}});
    await win.loadURL('data:text/html;charset=utf-8,<body style="background:%2310131a;color:white;font:18px Segoe UI;padding:20px">MyTerminal · prueba de escritorio integrado</body>');
    const hwnd=win.getNativeWindowHandle().readBigUInt64LE().toString();
    child=spawn(require('./build-rdp-host.cjs').buildRdpHost(),[hwnd],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const pending=new Map();let buffer='';const messages=[];
    child.stdout.on('data',chunk=>{buffer+=chunk.toString('utf8');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let value;try{value=JSON.parse(line.trim());}catch{continue;}messages.push(value);if(value.type==='error')for(const entry of pending.values())entry.reject(new Error(value.message));const entry=pending.get(value.type);if(entry){pending.delete(value.type);entry.resolve(value);}}});
    const wait=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Timeout '+type+' '+JSON.stringify(messages))),10000);pending.set(type,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});});
    const ready=await wait('ready');if(ready.parent!==hwnd)throw new Error('El control no es hijo de Electron');
    const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
    const defaultsProbe=wait('probe');send({type:'probe'});const defaults=await defaultsProbe;
    send({type:'init',host:'127.0.0.1',port:3389,username:'',fitToTab:true});
    send({type:'layout',x:20,y:80,width:820,height:470,visible:true});
    let probe=wait('probe');send({type:'probe'});let state=await probe;
    if(!state.visible||state.parent!==hwnd||state.width<800)throw new Error('El control no aparece dentro de Electron: '+JSON.stringify(state));
    if(state.mouseInputIntervalMs!==16)throw new Error('El control no aplica el intervalo del ratón: '+state.mouseInputIntervalMs);
    send({type:'layout',visible:false});probe=wait('probe');send({type:'probe'});state=await probe;if(state.visible)throw new Error('El control no se oculta');
    send({type:'layout',x:40,y:120,width:600,height:350,visible:true});probe=wait('probe');send({type:'probe'});state=await probe;if(!state.visible||state.width>=800)throw new Error('No se redimensiona');
    send({type:'close'});child.stdin.end();
    fs.writeFileSync(path.join(__dirname,'smoke-rdp-native-result.json'),JSON.stringify({passed:true,networkConnected:false,mouseIntervalBeforeMs:defaults.mouseInputIntervalMs,mouseIntervalAfterMs:16,checks:['real Microsoft RDP ActiveX creation','child HWND parent matches Electron','embedded child visible','mouse input interval accepted by native control','hide on tab switch','resize embedded desktop']},null,2));app.exit(0);
  }catch(error){try{child?.kill();}catch{}fs.writeFileSync(path.join(__dirname,'smoke-rdp-native-result.json'),JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
