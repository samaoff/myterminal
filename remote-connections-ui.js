let savedRemoteConnections = [], editingConnectionId = null;
const remoteDialog = node('dialog'); remoteDialog.id = 'remote-editor'; remoteDialog.setAttribute('aria-labelledby','remote-editor-title');
const remoteHeading = node('div',undefined,'panel-heading'), remoteTitle = node('strong','Nueva conexión'); remoteTitle.id='remote-editor-title';
const remoteClose = node('button','Cerrar ×'); remoteClose.setAttribute('aria-label','Cerrar conexión'); remoteHeading.append(remoteTitle,remoteClose);
const remoteForm = node('form'); remoteForm.id='remote-form';
const remoteBody = node('div',undefined,'form-body'), remoteGrid=node('div',undefined,'remote-form-grid');
const remoteFields={};
function remoteField(key,title,type='text',options=null) {
  const label=node('label',title),input=node(options?'select':'input'); input.id='remote-'+key;
  if(options)for(const [value,text] of options){const option=node('option',text);option.value=value;input.append(option);} else input.type=type;
  label.append(input); remoteGrid.append(label);remoteFields[key]=input;return label;
}
remoteField('protocol','Tipo de conexión','text',[['ssh','SSH · Terminal remoto'],['sftp','SFTP · Transferir archivos'],['rdp','Escritorio remoto · RDP']]);
remoteField('name','Nombre'); remoteFields.name.required=true;remoteFields.name.maxLength=48;remoteFields.name.placeholder='Mi servidor';
remoteField('host','Servidor o dirección IP');remoteFields.host.required=true;remoteFields.host.maxLength=253;remoteFields.host.placeholder='servidor.ejemplo.com';
remoteField('port','Puerto','number');remoteFields.port.min=1;remoteFields.port.max=65535;remoteFields.port.value=22;remoteFields.port.required=true;
const remoteUserLabel=remoteField('username','Usuario SSH (opcional)');remoteFields.username.maxLength=128;remoteFields.username.placeholder='Usar configuración de OpenSSH';
const remoteKeyLabel=remoteField('keyFile','Clave privada SSH (opcional)');remoteFields.keyFile.placeholder='Usar las claves o el agente de OpenSSH';
const remoteFolderLabel=remoteField('localFolder','Carpeta local (opcional)');remoteFields.localFolder.placeholder='Proyecto actual o carpeta personal';remoteFolderLabel.classList.add('remote-wide');
for(const [key,kind] of [['keyFile','key'],['localFolder','folder']]){
  const input=remoteFields[key],picker=node('button','Elegir…','secondary'),row=node('div',undefined,'remote-path');picker.type='button';picker.setAttribute('aria-label',kind==='key'?'Seleccionar clave SSH':'Seleccionar carpeta local');
  picker.onclick=async()=>{try{const value=await window.desktop.pickRemotePath(kind);if(value)input.value=value;}catch(error){remoteError.textContent=error.message;}};
  input.after(row);row.append(input,picker);
}
const remoteFitLabel=node('label',undefined,'settings-check remote-wide'),remoteFitToTab=node('input');remoteFitToTab.type='checkbox';remoteFitToTab.id='remote-fit';remoteFitLabel.append(remoteFitToTab,document.createTextNode('Ajustar el escritorio al tamaño de la pestaña'));remoteGrid.append(remoteFitLabel);
const remoteInfo=node('p',undefined,'remote-help');remoteInfo.id='remote-help';
const remoteAvailability=node('p',undefined,'remote-client-status');remoteAvailability.id='remote-client-status';
const remoteError=node('p');remoteError.id='remote-editor-error';remoteError.setAttribute('role','status');
const remoteActions=node('div',undefined,'remote-form-actions'),remoteSave=node('button','Guardar conexión','secondary'),remoteConnect=node('button','Guardar y conectar','primary');
remoteSave.type='submit';remoteSave.id='remote-save';remoteConnect.type='submit';remoteConnect.id='remote-save-connect';remoteConnect.dataset.connect='true';remoteActions.append(remoteSave,remoteConnect);
remoteBody.append(remoteGrid,remoteInfo,remoteAvailability,remoteError,remoteActions);remoteForm.append(remoteBody);remoteDialog.append(remoteHeading,remoteForm);document.body.append(remoteDialog);
let remoteEditorFocus,remoteClientVersion=0;
function syncRemoteProtocol() {
  const rdp=remoteFields.protocol.value==='rdp';
  for(const label of [remoteKeyLabel,remoteFolderLabel])label.hidden=rdp;
  remoteUserLabel.firstChild.textContent=rdp?'Usuario RDP (opcional)':'Usuario SSH (opcional)';
  remoteFields.username.placeholder=rdp?'DOMINIO\\usuario o usuario@dominio':'Usar configuración de OpenSSH';
  remoteFitLabel.hidden=!rdp;
  remoteInfo.textContent=rdp?'Verás y controlarás el escritorio dentro de una pestaña de MyTerminal. La contraseña se introduce en ese panel y no se guarda.':remoteFields.protocol.value==='sftp'?'Se abre un explorador de archivos local y remoto con progreso y cancelación. La contraseña o frase de la clave se introduce al conectar y no se guarda. El botón >_ permite usar la consola de OpenSSH.':'Se abre en una pestaña de MyTerminal. La contraseña o frase de la clave se introduce en esa sesión; no se guarda en la conexión. Puedes usar un servidor o un alias de tu configuración OpenSSH.';
  const version=++remoteClientVersion,protocol=remoteFields.protocol.value;
  remoteAvailability.textContent='Comprobando cliente…';
  window.desktop.remoteClients().then(clients=>{
    if(version!==remoteClientVersion)return;
    remoteAvailability.textContent=clients[protocol]?'Cliente disponible en este equipo.':'Cliente no disponible. '+(rdp?'No se encuentra Escritorio remoto de Windows.':'Activa Cliente OpenSSH en las características opcionales de Windows.');
    remoteConnect.disabled=!clients[protocol];
  }).catch(()=>{if(version===remoteClientVersion)remoteAvailability.textContent='No se pudo comprobar el cliente.';});
}
remoteFields.protocol.onchange=()=>{
  if(['22','3389',''].includes(remoteFields.port.value))remoteFields.port.value=remoteFields.protocol.value==='rdp'?'3389':'22';
  syncRemoteProtocol();
};
function openRemoteEditor(entry=null) {
  remoteEditorFocus=document.activeElement;editingConnectionId=entry?.id||null;remoteForm.reset();
  remoteTitle.textContent=entry?'Editar conexión':'Nueva conexión';remoteError.textContent='';
  for(const key of ['protocol','name','host','port','username','keyFile','localFolder'])remoteFields[key].value=entry?.[key]??(key==='protocol'?'ssh':key==='port'?22:'');
  remoteFitToTab.checked=entry?.fitToTab!==false;remoteSave.disabled=false;syncRemoteProtocol();
  if(!remoteDialog.open)remoteDialog.showModal();remoteFields.name.focus();
}
remoteClose.onclick=()=>remoteDialog.close();remoteDialog.addEventListener('close',()=>{if(remoteEditorFocus?.isConnected)remoteEditorFocus.focus();});
async function connectRemote(entry) {
  if(entry.protocol==='sftp') { openSftpLogin(entry); }
  else if(entry.protocol==='rdp'){
    try{await launchRemoteDesktop(entry);}catch(error){status(error.message);}
  } else await launch(null,entry.id);
}
async function refreshRemoteConnections() {
  savedRemoteConnections=await window.desktop.remoteConnections();const list=$('#remote-connections');list.replaceChildren();
  for(const entry of savedRemoteConnections){
    const row=node('div',undefined,'remote-connection-row'),start=node('button',undefined,'launch');
    start.dataset.remote=entry.id;start.title=entry.protocol.toUpperCase()+' · '+entry.host+':'+entry.port;start.setAttribute('aria-label','Conectar '+entry.name+' por '+entry.protocol.toUpperCase());
    start.append(terminalIcon(entry.protocol),node('span',entry.name,'terminal-label'),node('span',entry.protocol.toUpperCase(),'remote-protocol'));
    start.onclick=async()=>{start.disabled=true;try{await connectRemote(entry);}finally{start.disabled=false;}};
    const edit=node('button','✎','profile-action');edit.title='Editar '+entry.name;edit.setAttribute('aria-label',edit.title);edit.onclick=()=>openRemoteEditor(entry);
    const remove=node('button','×','profile-action');remove.title='Quitar '+entry.name;remove.setAttribute('aria-label',remove.title);
    remove.onclick=async()=>{remove.disabled=true;try{if(await window.desktop.removeConnection(entry.id)){await refreshRemoteConnections();status('Conexión quitada. Las sesiones abiertas se conservan.');}}catch(error){status(error.message);}finally{remove.disabled=false;}};
    row.append(start,edit,remove);
    if(entry.protocol==='sftp') { const consoleButton=node('button','>_','profile-action'); consoleButton.title='Abrir SFTP por consola'; consoleButton.setAttribute('aria-label',consoleButton.title); consoleButton.onclick=()=>launch(null,entry.id); row.append(consoleButton); }
    list.append(row);
  }
  if(!savedRemoteConnections.length)list.append(node('p','SSH · SFTP · Escritorio remoto','remote-empty'));
}
remoteForm.onsubmit=async event=>{
  event.preventDefault();remoteSave.disabled=true;remoteConnect.disabled=true;remoteError.textContent='';
  try{
    const connection={id:editingConnectionId,fitToTab:remoteFitToTab.checked};
    for(const key of Object.keys(remoteFields))connection[key]=remoteFields[key].value;
    const saved=await window.desktop.saveConnection(connection);await refreshRemoteConnections();remoteDialog.close();status('Conexión guardada en tu perfil.');
    if(event.submitter?.dataset.connect)await connectRemote(saved);
  }catch(error){remoteError.textContent=error.message;}
  finally{remoteSave.disabled=false;syncRemoteProtocol();}
};
$('#connections-icon').replaceChildren(terminalIcon('network'));
$('#add-connection').onclick=()=>openRemoteEditor();
refreshRemoteConnections().catch(error=>status(error.message));
