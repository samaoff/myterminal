const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
function validateConnection(value) {
  if (!value || typeof value !== 'object' || !['ssh','sftp','rdp'].includes(value.protocol)) throw new Error('Selecciona SSH, SFTP o escritorio remoto.');
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name || name.length > 48 || /[\x00-\x1f]/.test(name)) throw new Error('Indica un nombre de hasta 48 caracteres.');
  const host = typeof value.host === 'string' ? value.host.trim().replace(/^\[([^\]]+)\]$/, '$1') : '';
  if (!host || host.length > 253 || (!net.isIP(host) && !/^[a-z0-9_][a-z0-9_.-]*$/i.test(host))) throw new Error('Escribe un servidor, dirección IP o alias SSH sin usuario ni puerto.');
  const port = value.port === '' || value.port == null ? (value.protocol === 'rdp' ? 3389 : 22) : Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('El puerto debe estar entre 1 y 65535.');
  const username = typeof value.username === 'string' ? value.username.trim() : '';
  if (username.length > 128 || (username && !/^[a-z0-9_][a-z0-9_.@\\-]*$/i.test(username))) throw new Error('El usuario contiene caracteres no válidos.');
  const cleanPath = field => {
    const text = typeof value[field] === 'string' ? value[field].trim() : '';
    if (text.length > 2048 || /[\x00-\x1f]/.test(text) || (text && !path.isAbsolute(text))) throw new Error('Usa una ruta absoluta para la clave y la carpeta local.');
    return text;
  };
  return { name, protocol:value.protocol, host, port, username, keyFile:value.protocol === 'rdp' ? '' : cleanPath('keyFile'), localFolder:value.protocol === 'rdp' ? '' : cleanPath('localFolder'), fitToTab:value.fitToTab !== false };
}
class RemoteConnections {
  constructor(directory) { this.file = path.join(directory,'remote-connections.json'); }
  list() {
    let value;
    try { if (fs.statSync(this.file).size > 512 * 1024) throw new Error('Lista de conexiones demasiado grande.'); value = JSON.parse(fs.readFileSync(this.file,'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('No se puede leer la lista de conexiones. El archivo se conserva.'); }
    if (!Array.isArray(value) || value.length > 100) throw new Error('Lista de conexiones no válida.');
    const seen = new Set();
    return value.map(entry => {
      if (!/^remote-[a-f0-9-]{36}$/.test(entry.id) || seen.has(entry.id)) throw new Error('Identificador de conexión no válido.');
      seen.add(entry.id); return { id:entry.id, ...validateConnection(entry) };
    });
  }
  write(entries) {
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    fs.writeFileSync(this.file+'.tmp',JSON.stringify(entries,null,2)); fs.renameSync(this.file+'.tmp',this.file);
  }
  save(value) {
    const clean = validateConnection(value), entries = this.list();
    if (value.id) {
      const index = entries.findIndex(entry=>entry.id===value.id);
      if (index<0) throw new Error('La conexión ya no existe.');
      entries[index]={id:value.id,...clean}; this.write(entries); return entries[index];
    }
    if (entries.length>=100) throw new Error('Puedes guardar hasta 100 conexiones.');
    const entry={id:'remote-'+randomUUID(),...clean}; entries.push(entry); this.write(entries); return entry;
  }
  get(id) { const entry=this.list().find(value=>value.id===id); if(!entry)throw new Error('La conexión ya no existe.');return entry; }
  remove(id) { this.get(id); this.write(this.list().filter(entry=>entry.id!==id)); }
}
function remoteClient(protocol) {
  if (!['ssh','sftp','rdp'].includes(protocol)) throw new Error('Protocolo no válido.');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const file = protocol === 'rdp' ? path.join(systemRoot,'System32','mstscax.dll') : path.join(systemRoot,'System32','OpenSSH',protocol+'.exe');
  if (!fs.existsSync(file)) throw new Error(protocol === 'rdp' ? 'No se encuentra el cliente de escritorio remoto de Windows.' : 'Activa el cliente OpenSSH en las características opcionales de Windows.');
  return file;
}
function remoteArguments(value) {
  const entry=validateConnection(value);
  const host=net.isIP(entry.host)===6 ? '['+entry.host+']' : entry.host;
  if(entry.protocol==='rdp')throw new Error('RDP utiliza el escritorio integrado en la pestaña.');
  const args=[entry.protocol==='ssh'?'-p':'-P',String(entry.port),'-o','ConnectTimeout=15'];
  if(entry.username) args.push(...(entry.protocol==='ssh'?['-l',entry.username]:['-o','User='+entry.username]));
  if(entry.keyFile)args.push('-i',entry.keyFile);
  args.push('--',entry.protocol==='ssh'?entry.host:host); return args;
}
function connectionLaunch(value, fallbackFolder) {
  const entry=validateConnection(value);
  if(entry.keyFile && !fs.statSync(entry.keyFile).isFile())throw new Error('No se encuentra el archivo de clave SSH.');
  const folder=entry.localFolder || fallbackFolder || os.homedir();
  if(!fs.statSync(folder).isDirectory())throw new Error('La carpeta local ya no existe. Edita la conexión.');
  return { file:remoteClient(entry.protocol), args:remoteArguments(entry), folder, remote:{protocol:entry.protocol,host:entry.host,port:entry.port,username:entry.username} };
}
module.exports={RemoteConnections,validateConnection,remoteArguments,remoteClient,connectionLaunch};
