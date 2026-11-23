const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {validateConnection}=require('./remote-connections.cjs');
class RdpSessions {
  constructor(window,{helperPath,onEvent=()=>{},launch=spawn}={}) {
    this.window=window;this.helperPath=helperPath||require('./build-rdp-host.cjs').buildRdpHost();
    this.onEvent=onEvent;this.launch=launch;this.sessions=new Map();
  }
  get size(){return this.sessions.size;}
  has(id){return this.sessions.has(id);}
  async start(id,value){
    const connection=validateConnection(value);
    if(connection.protocol!=='rdp')throw new Error('Selecciona una conexión RDP.');
    if(!fs.existsSync(this.helperPath))throw new Error('Falta el componente RDP integrado. Ejecuta npm run build:rdp o reinstala MyTerminal.');
    const parent=this.window.getNativeWindowHandle().readBigUInt64LE().toString();
    const child=this.launch(this.helperPath,[parent],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const entry={child,ready:false,closing:false,buffer:'',state:'starting'};this.sessions.set(id,entry);
    const ready=new Promise((resolve,reject)=>{
      entry.resolve=resolve;entry.reject=reject;
      entry.timer=setTimeout(()=>{reject(new Error('El escritorio integrado no ha respondido.'));this.stop(id);},15000);
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      entry.buffer+=chunk;
      if(entry.buffer.length>65536){entry.reject(new Error('Respuesta RDP no válida.'));this.stop(id);return;}
      let end;
      while((end=entry.buffer.indexOf('\n'))>=0){
        const line=entry.buffer.slice(0,end).trim().replace(/^\uFEFF/,'');entry.buffer=entry.buffer.slice(end+1);
        let message;try{message=JSON.parse(line);}catch{continue;}
        if(message.type==='ready'){
          if(message.parent!==parent){entry.reject(new Error('No se pudo integrar el escritorio en la pestaña.'));this.stop(id);return;}
          this.send(id,{type:'init',host:connection.host,port:connection.port,username:connection.username,fitToTab:connection.fitToTab});
        }else if(message.type==='configured'){
          entry.ready=true;clearTimeout(entry.timer);entry.state='ready';
          entry.resolve();
        }else if(message.type==='error'){
          if(!entry.ready){entry.reject(new Error(message.message));this.stop(id);}
          entry.state='error';
        }else if(['connecting','connected','disconnected'].includes(message.type))entry.state=message.type;
        if(message.type==='probe'){entry.probe?.(message);entry.probe=null;continue;}
        this.onEvent({id,state:entry.state,message:message.type==='error'?message.message:undefined,reason:message.reason});
      }
    });
    child.stderr.on('data',()=>{});
    child.stdin.on('error',()=>{});
    const finished=()=>{
      clearTimeout(entry.timer);this.sessions.delete(id);
      if(!entry.ready)entry.reject(new Error('No se pudo iniciar el control RDP de Windows.'));
      if(!entry.closing)this.onEvent({id,state:'closed',message:'El escritorio remoto se ha cerrado.'});
    };
    child.once('error',finished);child.once('exit',finished);
    await ready;
    return {id,kind:'rdp',name:connection.name,icon:'rdp',remote:{protocol:'rdp',host:connection.host,port:connection.port,username:connection.username}};
  }
  send(id,message){const entry=this.sessions.get(id);if(entry&&!entry.closing&&entry.child.stdin.writable)entry.child.stdin.write(JSON.stringify(message)+'\n');}
  layout(id,bounds){
    if(!this.has(id)||!bounds||typeof bounds!=='object')return;
    if(bounds.visible!==true){this.send(id,{type:'layout',visible:false});return;}
    const size=this.window.getContentSize(),zoom=this.window.webContents.getZoomFactor();
    const values=['x','y','width','height'].map(key=>bounds[key]);
    if(values.some(value=>typeof value!=='number'||!Number.isFinite(value)))return;
    const x=Math.max(0,Math.min(size[0],bounds.x*zoom)),y=Math.max(0,Math.min(size[1],bounds.y*zoom));
    this.send(id,{type:'layout',visible:true,x,y,width:Math.max(1,Math.min(size[0]-x,bounds.width*zoom)),height:Math.max(1,Math.min(size[1]-y,bounds.height*zoom)),focus:bounds.focus===true});
  }
  hideAll(){for(const id of this.sessions.keys())this.layout(id,{visible:false});}
  disconnect(id){this.send(id,{type:'disconnect'});}
  probe(id){return new Promise((resolve,reject)=>{const entry=this.sessions.get(id);if(!entry){reject(new Error('Sesión no encontrada.'));return;}const timer=setTimeout(()=>reject(new Error('Sin respuesta del control nativo.')),3000);entry.probe=value=>{clearTimeout(timer);resolve(value);};this.send(id,{type:'probe'});});}
  stop(id){
    const entry=this.sessions.get(id);if(!entry)return;
    this.send(id,{type:'close'});entry.closing=true;clearTimeout(entry.timer);entry.child.stdin.end();this.sessions.delete(id);
    const timer=setTimeout(()=>{try{entry.child.kill();}catch{}},1500);timer.unref();entry.child.once('exit',()=>clearTimeout(timer));
  }
  dispose(){for(const id of [...this.sessions.keys()])this.stop(id);}
}
module.exports={RdpSessions};
