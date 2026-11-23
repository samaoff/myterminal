const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// Las versiones se publican en GitHub Releases (repositorio público). El token es opcional y solo
// sirve para evitar el límite de consultas anónimas: se envía únicamente a la API de GitHub.
const REPOSITORY = 'samaoff/myterminal';
const ORIGIN = 'https://github.com';
const API_ORIGIN = 'https://api.github.com';
const API = `${API_ORIGIN}/repos/${REPOSITORY}`;
const RELEASES = `${ORIGIN}/${REPOSITORY}/releases`;
// GitHub redirige las descargas de los adjuntos a su almacenamiento; no se acepta ningún otro destino.
const DOWNLOAD_HOSTS = new Set([API_ORIGIN, ORIGIN, 'https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com']);
const MAX_INSTALLER = 1024 * 1024 * 1024;
function versionParts(value) {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  if (!a || !b) throw new Error('Versión no válida.');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
async function digestFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
class AppUpdates extends EventEmitter {
  constructor({directory, version, packaged, safeStorage, fetchImpl = fetch}) {
    super();
    this.directory = directory; this.version = version; this.packaged = packaged;
    this.safeStorage = safeStorage; this.fetch = fetchImpl;
    this.settingsFile = path.join(directory, 'update-settings.json');
    this.settings = {autoCheck:true}; this.token = ''; this.busy = false;
    this.candidate = null; this.downloaded = null;
    this.state = {status:'idle', message:'Busca nuevas versiones en GitHub.', progress:0};
  }
  snapshot() {
    return {...this.state, currentVersion:this.version, availableVersion:this.candidate?.version || null,
      releaseName:this.candidate?.name || '', notes:this.candidate?.notes || '',
      hasToken:Boolean(this.settings.encryptedToken), autoCheck:this.settings.autoCheck,
      canInstall:this.packaged, repository:RELEASES};
  }
  update(patch) { Object.assign(this.state, patch); this.emit('change', this.snapshot()); return this.snapshot(); }
  async initialize() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        if (fs.statSync(this.settingsFile).size > 32768) throw Error('settings');
        const saved = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
        this.settings.autoCheck = saved.autoCheck !== false;
        if (typeof saved.encryptedToken === 'string') {
          this.settings.encryptedToken = saved.encryptedToken;
          const decrypted = await this.safeStorage.decryptStringAsync(Buffer.from(saved.encryptedToken, 'base64'));
          this.token = decrypted.result;
        }
      }
    } catch {
      this.update({status:'error', message:'No se pudo leer el acceso guardado. Vuelve a guardar o quita el token de GitHub.'});
    }
    return this.snapshot();
  }
  async configure({token, forgetToken, autoCheck} = {}) {
    if (this.busy) throw Error('Espera a que termine la operación de actualización.');
    const next = {...this.settings}; let nextToken = this.token;
    if (typeof autoCheck === 'boolean') next.autoCheck = autoCheck;
    if (forgetToken === true) { delete next.encryptedToken; nextToken = ''; }
    else if (token !== undefined) {
      if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[\r\n\x00]/.test(token)) throw Error('Introduce un token de GitHub válido.');
      if (!await this.safeStorage.isAsyncEncryptionAvailable()) throw Error('Windows no permite proteger el token en este equipo.');
      nextToken = token.trim();
      next.encryptedToken = (await this.safeStorage.encryptStringAsync(nextToken)).toString('base64');
    }
    fs.mkdirSync(this.directory, {recursive:true});
    const temporary = this.settingsFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(next), {mode:0o600}); fs.renameSync(temporary, this.settingsFile);
    this.settings = next; this.token = nextToken;
    return this.update({status:this.downloaded ? 'downloaded' : this.candidate ? 'available' : 'idle', message:'Preferencias de actualización guardadas.'});
  }
  async request(url, {signal} = {}) {
    // Solo se habla con GitHub y su almacenamiento de descargas; el token nunca sale de la API, ni siquiera por redirecciones.
    for (let redirects = 0; redirects < 5; redirects++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(target.origin) || target.username || target.password) throw Error('La descarga no pertenece al repositorio de GitHub configurado.');
      const headers = target.origin === API_ORIGIN ? {Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', ...(this.token ? {Authorization:'Bearer ' + this.token} : {})} : {};
      const response = await this.fetch(target.href, {headers, redirect:'manual', signal:signal || AbortSignal.timeout(30000)});
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location) throw Error('GitHub devolvió una redirección incompleta.');
        url = new URL(location, target).href; continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401) throw Error('GitHub ha rechazado el token guardado. Revísalo o quítalo: el repositorio es público y no lo necesita.');
        if (response.status === 403 || response.status === 429) throw Error('GitHub ha limitado las consultas. Vuelve a intentarlo más tarde o guarda un token de GitHub para evitar el límite.');
        if (response.status === 404) throw Error('GitHub no encuentra las versiones de MyTerminal. Vuelve a intentarlo más tarde.');
        throw Error(`GitHub no pudo completar la petición (HTTP ${response.status}).`);
      }
      return response;
    }
    throw Error('GitHub ha redirigido demasiadas veces.');
  }
  async text(url, limit = 2 * 1024 * 1024, signal) {
    const response = await this.request(url, {signal});
    const chunks = []; let size = 0;
    for await (const chunk of Readable.fromWeb(response.body)) {
      size += chunk.length;
      if (size > limit) throw Error('La respuesta de GitHub supera el tamaño permitido.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  failure(error) {
    const message = error.name === 'AbortError' ? 'Descarga cancelada.' : error.name === 'TimeoutError' ? 'GitHub ha tardado demasiado. Vuelve a intentarlo.' : error.message;
    // Only our own errors are user-facing; fetch/OS errors may contain sensitive URLs.
    const safe = /^(GitHub|El repositorio|La descarga|La respuesta|No |Descarga|Windows|El instalador|La suma|Versión)/.test(message || '') ? message : 'No se pudo completar la actualización. Comprueba la conexión a internet.';
    return this.update({status:'error', message:safe});
  }
  async check() {
    if (this.busy || this.downloaded) return this.snapshot();
    this.busy = true; this.candidate = null;
    this.update({status:'checking', message:'Buscando actualizaciones en GitHub…', progress:0});
    try {
      const releases = JSON.parse(await this.text(`${API}/releases?per_page=100`));
      if (!Array.isArray(releases)) throw Error('GitHub no devolvió una lista de versiones válida.');
      const candidates = releases.filter(r => /^v\d+\.\d+\.\d+$/.test(r.tag_name) && versionParts(r.tag_name) && !r.draft && !r.prerelease && (!r.published_at || Date.parse(r.published_at) <= Date.now()))
        .sort((a,b) => compareVersions(b.tag_name, a.tag_name));
      const latest = candidates[0];
      if (!latest || compareVersions(latest.tag_name, this.version) <= 0) return this.update({status:'current', message:'Tienes la versión más reciente.'});
      const version = latest.tag_name.slice(1), filename = `MyTerminal-Setup-${version}.exe`;
      const assets = Array.isArray(latest.assets) ? latest.assets.map(asset => asset?.name) : [];
      if (!assets.includes(filename) || !assets.includes(filename + '.sha256')) throw Error('El instalador de la nueva versión todavía no está publicado. Vuelve a buscar más tarde.');
      // La dirección se construye aquí con el formato fijo de GitHub; no se usan las URL que devuelva la respuesta.
      this.candidate = {version, filename, name:String(latest.name || '').slice(0,300), notes:String(latest.body || '').slice(0,20000),
        url:`${RELEASES}/download/v${version}/${filename}`};
      return this.update({status:'available', message:`Disponible MyTerminal ${version}.`});
    } catch (error) { return this.failure(error); }
    finally { this.busy = false; }
  }
  cancel() { this.controller?.abort(); }
  async download() {
    if (this.busy || this.downloaded) return this.snapshot();
    if (!this.candidate) throw Error('Busca primero una versión nueva.');
    this.busy = true; this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15 * 60 * 1000)]);
    const candidate = this.candidate;
    const cache = path.join(this.directory, 'updates');
    const file = path.join(cache, randomUUID() + '-' + candidate.filename), partial = file + '.partial';
    this.update({status:'downloading', message:'Descargando instalador…', progress:0});
    try {
      fs.mkdirSync(cache, {recursive:true});
      const checksum = (await this.text(candidate.url + '.sha256', 1024, signal)).trim();
      const match = /^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)$/.exec(checksum);
      if (!match || match[2] !== candidate.filename) throw Error('La suma SHA-256 publicada no corresponde al instalador.');
      const response = await this.request(candidate.url, {signal});
      const total = Number(response.headers.get('content-length')) || 0;
      if (total > MAX_INSTALLER) { await response.body?.cancel(); throw Error('El instalador supera el tamaño permitido.'); }
      const hash = createHash('sha256'); let bytes = 0, first = Buffer.alloc(0), lastProgress = 0;
      const meter = new Transform({transform:(chunk, _encoding, done) => {
        bytes += chunk.length;
        if (bytes > MAX_INSTALLER) return done(Error('El instalador supera el tamaño permitido.'));
        if (first.length < 2) first = Buffer.concat([first,chunk]).subarray(0,2);
        hash.update(chunk);
        if (Date.now() - lastProgress > 200) {
          lastProgress = Date.now(); this.update({progress:total ? Math.min(99,Math.round(bytes / total * 100)) : null, bytes, total});
        }
        done(null,chunk);
      }});
      await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(partial,{flags:'wx'}), {signal});
      if (first[0] !== 0x4d || first[1] !== 0x5a || (total && bytes !== total)) throw Error('El instalador descargado no es un ejecutable completo.');
      const digest = hash.digest('hex');
      if (digest !== match[1].toLowerCase()) throw Error('La descarga no coincide con su SHA-256. No se instalará.');
      fs.renameSync(partial, file);
      this.downloaded = {file, sha256:digest, version:candidate.version};
      return this.update({status:'downloaded', progress:100, bytes, total:bytes, message:'Instalador descargado y verificado. Puedes instalar cuando termines de trabajar.'});
    } catch (error) {
      fs.rmSync(partial,{force:true}); return this.failure(error);
    } finally { this.busy = false; this.controller = null; }
  }
  async verifiedInstaller() {
    if (!this.packaged) throw Error('La instalación de actualizaciones está disponible en la versión instalada, no en desarrollo.');
    if (this.busy || !this.downloaded) throw Error('Descarga la actualización antes de instalarla.');
    if (await digestFile(this.downloaded.file) !== this.downloaded.sha256) {
      this.downloaded = null; this.update({status:'error',message:'El instalador ha cambiado. Descarga de nuevo la actualización.'});
      throw Error('El instalador ha cambiado. Descarga de nuevo la actualización.');
    }
    return this.downloaded.file;
  }
}
module.exports = {AppUpdates, compareVersions, versionParts, ORIGIN, API, RELEASES, REPOSITORY};
