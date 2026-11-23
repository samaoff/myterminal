const pendingRdpStatus=new Map();
let rdpLayoutFrame=null,rdpFocusRequested=false;
function syncRemoteDesktopLayout(focus=false) {
  rdpFocusRequested=rdpFocusRequested||focus;
  if(rdpLayoutFrame!==null)return;
  rdpLayoutFrame=requestAnimationFrame(()=>{
    rdpLayoutFrame=null;
    const modalOpen=Boolean(document.querySelector('dialog[open]'));
    for(const [id,session] of sessions){
      if(session.kind!=='rdp')continue;
      const visible=id===active&&!session.pane.hidden&&!modalOpen&&!session.ended&&!document.hidden;
      const rect=session.viewport.getBoundingClientRect();
      const bounds={visible:visible&&rect.width>0&&rect.height>0,x:rect.x,y:rect.y,width:rect.width,height:rect.height,focus:visible&&rdpFocusRequested};
      const signature=JSON.stringify({...bounds,focus:false});
      if(signature!==session.rdpBounds||bounds.focus){session.rdpBounds=signature;window.desktop.layoutRemoteDesktop(id,bounds);}
    }
    rdpFocusRequested=false;
  });
}
function renderRdpStatus(message){
  const session=sessions.get(message.id);
  if(!session){pendingRdpStatus.set(message.id,message);return;}
  if(session.kind!=='rdp')return;
  const labels={starting:'Preparando escritorio…',ready:'Introduce tus credenciales en el panel',connecting:'Conectando…',connected:'Conectado · teclado y ratón activos',disconnected:'Desconectado · puedes volver a conectar',error:'No se pudo conectar',closed:'Escritorio cerrado'};
  session.rdpStatus.textContent=message.message||labels[message.state]||'';
  if(message.state==='closed'){session.ended=true;session.viewport.textContent='El escritorio se ha cerrado. Cierra esta pestaña y vuelve a abrir la conexión.';}
  syncRemoteDesktopLayout();
}
async function launchRemoteDesktop(connection){
  const created=await window.desktop.openRemoteDesktop(connection.id),id=created.id;
  const pane=node('div',undefined,'terminal-pane rdp-pane'),toolbar=node('div',undefined,'rdp-toolbar');pane.hidden=true;
  const state=node('span','Preparando escritorio…','rdp-status');state.setAttribute('role','status');
  const focus=node('button','Controlar','secondary');focus.title='Dar el control del teclado y ratón al escritorio';focus.onclick=()=>syncRemoteDesktopLayout(true);
  const fullscreen=node('button','Ampliar','secondary');fullscreen.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await pane.requestFullscreen();syncRemoteDesktopLayout(true);}catch(error){status(error.message);}};
  const disconnect=node('button','Desconectar','secondary');disconnect.onclick=()=>window.desktop.disconnectRemoteDesktop(id);
  toolbar.append(state,focus,fullscreen,disconnect);
  const viewport=node('div',undefined,'rdp-viewport');viewport.setAttribute('aria-label','Escritorio remoto de '+connection.name);
  pane.append(toolbar,viewport);$('#workspace').append(pane);
  const tab=node('button',undefined,'tab');tab.title=remoteSessionLocation(created.remote);
  const cross=node('span','×','close');cross.title='Desconectar y cerrar escritorio';cross.onclick=event=>{event.stopPropagation();close(id);};
  tab.append(terminalIcon('rdp'),node('span',created.name+' · RDP'),cross);tab.onclick=()=>activate(id);$('#tabs').append(tab);
  const session={pane,tab,kind:'rdp',name:created.name,remote:created.remote,folder:null,viewport,rdpStatus:state};
  sessions.set(id,session);
  if(pendingRdpStatus.has(id)){renderRdpStatus(pendingRdpStatus.get(id));pendingRdpStatus.delete(id);}
  $('#welcome').style.display='none';new ResizeObserver(()=>syncRemoteDesktopLayout()).observe(viewport);activate(id);
}
window.desktop.onRemoteDesktopStatus(renderRdpStatus);
window.desktop.onRemoteDesktopLayout(()=>{for(const session of sessions.values())if(session.kind==='rdp')session.rdpBounds=null;syncRemoteDesktopLayout();});
new MutationObserver(()=>syncRemoteDesktopLayout()).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
document.addEventListener('visibilitychange',()=>syncRemoteDesktopLayout());
document.addEventListener('fullscreenchange',()=>{for(const session of sessions.values())if(session.kind==='rdp'){session.pane.querySelector('.rdp-toolbar button:nth-of-type(2)').textContent=document.fullscreenElement===session.pane?'Salir de ampliación':'Ampliar';session.rdpBounds=null;}syncRemoteDesktopLayout();});
window.addEventListener('resize',()=>{for(const session of sessions.values())if(session.kind==='rdp')session.rdpBounds=null;syncRemoteDesktopLayout();});
