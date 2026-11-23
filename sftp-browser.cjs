const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { Client } = require('ssh2');
const run = promisify(execFile);
const call = (object, method, ...args) => new Promise((resolve, reject) => object[method](...args, (error, value) => error ? reject(error) : resolve(value)));
function safeName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name) || path.win32.basename(name) !== name || /[<>:"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Nombre de archivo no compatible con Windows.');
  return name;
}
class SftpBrowser {
  constructor({ verifyHost, progress, closed }) { this.sessions = new Map(); this.verifyHost = verifyHost; this.progress = progress; this.closed = closed; }
  get size() { return this.sessions.size; }
  get(id) { const session = this.sessions.get(id); if (!session?.sftp) throw new Error('La conexión SFTP está cerrada.'); return session; }
  async open(entry, credentials = {}, fallback) {
    for (const key of ['username', 'password', 'passphrase']) if (credentials[key] != null && (typeof credentials[key] !== 'string' || credentials[key].length > 4096)) throw new Error('Credenciales no válidas.');
    const id = 'sftp-' + randomUUID(), client = new Client();
    const session = { client, local: entry.localFolder || fallback || os.homedir(), remote: '.', busy: false };
    this.sessions.set(id, session);
    client.on('error', () => {});
    client.once('close', () => { this.sessions.delete(id); this.closed?.(id); });
    try {
      // Resolve aliases with Windows OpenSSH; unsupported proxy directives remain explicit.
      const { stdout } = await run('ssh.exe', ['-G', '-p', String(entry.port), ...(entry.username ? ['-l', entry.username] : []), '--', entry.host], { windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024 });
      const config = {};
      for (const line of stdout.split(/\r?\n/)) { const index = line.indexOf(' '); if (index > 0) { const key = line.slice(0, index), value = line.slice(index + 1); (config[key] ||= []).push(value); } }
      if (['proxycommand', 'proxyjump'].some(key => config[key]?.some(value => value !== 'none'))) throw new Error('Esta conexión usa un proxy SSH. Utiliza SFTP por consola para ese acceso.');
      const expand = value => value.replace(/^~(?=[\\/])/, os.homedir());
      const keyFile = entry.keyFile || config.identityfile?.map(expand).find(file => fs.existsSync(file));
      const options = { host: config.hostname?.[0] || entry.host, port: entry.port, username: credentials.username || entry.username || config.user?.[0] || os.userInfo().username, readyTimeout: 30000, keepaliveInterval: 15000,
        hostVerifier: (key, callback) => { const fingerprint = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, ''); Promise.resolve(this.verifyHost(entry, fingerprint)).then(value => callback(Boolean(value)), () => callback(false)); }
      };
      if (keyFile) { options.privateKey = await fs.promises.readFile(keyFile); if (credentials.passphrase) options.passphrase = credentials.passphrase; }
      else options.agent = process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : process.env.SSH_AUTH_SOCK;
      if (credentials.password) options.password = credentials.password;
      if (!this.sessions.has(id)) throw new Error('Conexión cancelada.');
      await new Promise((resolve, reject) => { client.once('ready', resolve); client.once('error', reject); client.once('close', () => reject(new Error('Conexión SFTP cerrada.'))); client.connect(options); });
      if (!this.sessions.has(id)) throw new Error('Conexión cancelada.');
      session.sftp = await call(client, 'sftp');
      session.remote = await call(session.sftp, 'realpath', '.');
      session.local = await fs.promises.realpath(session.local);
      return { id, local: session.local, remote: session.remote };
    } catch (error) { this.close(id); throw error; }
  }
  async list(id, side, target) {
    const s = this.get(id);
    if (s.busy) throw new Error('Espera a que termine la transferencia.');
    if (typeof target !== 'string' || target.length > 8192 || /[\x00-\x1f]/.test(target)) throw new Error('Ruta no válida.');
    if (!['local', 'remote'].includes(side)) throw new Error('Panel no válido.');
    s.listing ||= new Set();
    if (s.listing.has(side)) throw new Error('Espera a que termine de cargar esta carpeta.');
    s.listing.add(side);
    s.navigating = (s.navigating || 0) + 1;
    try {
    let entries, location;
    if (side === 'local') {
      location = await fs.promises.realpath(path.resolve(s.local, target));
      entries = await Promise.all((await fs.promises.readdir(location, { withFileTypes: true })).map(async entry => {
        const stat = await fs.promises.lstat(path.join(location, entry.name));
        return { name: entry.name, directory: stat.isDirectory(), file: stat.isFile(), size: stat.size };
      }));
    } else if (side === 'remote') {
      location = await call(s.sftp, 'realpath', path.posix.resolve(s.remote, target));
      entries = (await call(s.sftp, 'readdir', location)).filter(e => e.filename !== '.' && e.filename !== '..').map(e => ({ name: e.filename, directory: e.attrs.isDirectory(), file: e.attrs.isFile(), size: e.attrs.size }));
    } else throw new Error('Panel no válido.');
    s[side] = location;
    entries.sort((a,b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    return { path: location, entries };
    } finally { s.navigating--; s.listing.delete(side); }
  }
  async transfer(id, direction, name) {
    const s = this.get(id); safeName(name);
    if (s.busy || s.navigating) throw new Error('Espera a que termine la operación en curso.');
    if (!['upload','download'].includes(direction)) throw new Error('Transferencia no válida.');
    s.busy = true;
    const controller = new AbortController(); s.abort = controller;
    const upload = direction === 'upload', local = path.join(s.local, name), remote = path.posix.join(s.remote, name);
    const destination = upload ? remote : local, temporary = destination + '.ai-terminal-' + randomUUID() + '.part';
    let source, sink;
    try {
      const stat = upload ? await fs.promises.lstat(local) : await call(s.sftp, 'lstat', remote);
      if (!stat.isFile()) throw new Error('Selecciona un archivo normal; las carpetas y enlaces no se transfieren.');
      // Never overwrite an existing destination. The final operation also refuses collisions.
      try { if (upload) await call(s.sftp, 'lstat', destination); else await fs.promises.lstat(destination); throw new Error('El destino ya existe. Cambia el nombre antes de transferir.'); }
      catch (error) { if (error.code !== 'ENOENT' && error.code !== 2) throw error; }
      controller.signal.throwIfAborted();
      source = upload ? fs.createReadStream(local) : s.sftp.createReadStream(remote);
      sink = upload ? s.sftp.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }) : fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
      let bytes = 0, last = 0;
      const meter = new Transform({ transform: (chunk, _encoding, done) => { bytes += chunk.length; if (Date.now() - last > 100) { last = Date.now(); this.progress?.({ id, name, bytes, total: stat.size }); } done(null, chunk); } });
      await pipeline(source, meter, sink, { signal: controller.signal });
      controller.signal.throwIfAborted();
      if (upload) await call(s.sftp, 'rename', temporary, destination);
      else { await fs.promises.link(temporary, destination); await fs.promises.unlink(temporary); }
      this.progress?.({ id, name, bytes, total: stat.size, done: true });
      return true;
    } catch (error) {
      source?.destroy(); sink?.destroy();
      try { if (upload) await call(s.sftp, 'unlink', temporary); else await fs.promises.unlink(temporary); } catch {}
      throw error;
    } finally { s.busy = false; s.abort = null; }
  }
  cancel(id) { this.get(id).abort?.abort(); }
  close(id) { const s = this.sessions.get(id); if (s) { s.abort?.abort(); s.client.destroy(); this.sessions.delete(id); } }
  dispose() { for (const id of this.sessions.keys()) this.close(id); }
}
module.exports = { SftpBrowser, safeName };
