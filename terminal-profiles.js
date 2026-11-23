const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const builtinProfiles = Object.freeze({
  codex: { id: 'codex', kind: 'codex', name: 'Codex', icon: 'codex' },
  claude: { id: 'claude', kind: 'claude', name: 'Claude Code', icon: 'claude' },
  powershell: { id: 'powershell', kind: 'powershell', name: 'PowerShell', icon: 'powershell' }
});
// Shells detectados al arrancar (PowerShell 7, cmd, Git Bash, WSL). Se comparten entre perfiles de usuario.
let detectedShells = [];
function setDetectedShells(list) { detectedShells = Array.isArray(list) ? list.map(entry => ({ ...entry, kind: 'custom' })) : []; }
function getDetectedShells() { return detectedShells.map(entry => ({ ...entry })); }
const customIcons = ['terminal', 'ollama', 'code', 'spark', 'powershell', 'codex', 'claude'];
function validateProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('Terminal no válido.');
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const command = typeof value.command === 'string' ? value.command.trim() : '';
  if (!name || name.length > 48 || /[\r\n\0]/.test(name)) throw new Error('Indica un nombre de hasta 48 caracteres.');
  if (!command || command.length > 2048 || /[\r\n\0]/.test(command)) throw new Error('Indica el programa o su ruta en una sola línea.');
  if (!Array.isArray(value.args) || value.args.length > 64 || value.args.some(arg => typeof arg !== 'string' || arg.length > 4096 || /[\r\n\0]/.test(arg))) throw new Error('Usa hasta 64 argumentos, uno por línea.');
  return { name, command, args: [...value.args], icon: customIcons.includes(value.icon) ? value.icon : 'terminal' };
}
class TerminalProfiles {
  constructor(userData) { this.file = path.join(userData, 'custom-terminals.json'); }
  list() {
    let text;
    try { if (fs.statSync(this.file).size > 512 * 1024) throw new Error('Archivo de terminales demasiado grande.'); text = fs.readFileSync(this.file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    let entries; try { entries = JSON.parse(text); } catch { throw new Error('No se puede leer custom-terminals.json. El archivo se conserva para revisarlo.'); }
    if (!Array.isArray(entries) || entries.length > 100) throw new Error('El archivo de terminales no es válido.');
    const seen = new Set();
    return entries.map(entry => {
      if (typeof entry.id !== 'string' || !/^custom-[a-f0-9-]{36}$/.test(entry.id) || seen.has(entry.id)) throw new Error('Identificador de terminal no válido.');
      seen.add(entry.id); return { id: entry.id, kind: 'custom', ...validateProfile(entry) };
    });
  }
  write(entries) {
    const text = JSON.stringify(entries, null, 2);
    if (Buffer.byteLength(text) > 512 * 1024) throw new Error('Los terminales guardados superan el límite de tamaño.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', text); fs.renameSync(this.file + '.tmp', this.file);
  }
  save(value) {
    const profile = validateProfile(value), entries = this.list();
    if (value.id) {
      const index = entries.findIndex(entry => entry.id === value.id);
      if (index < 0) throw new Error('El terminal ya no existe. Actualiza la lista.');
      entries[index] = { id: value.id, kind: 'custom', ...profile }; this.write(entries); return entries[index];
    }
    if (entries.length >= 100) throw new Error('Puedes guardar hasta 100 terminales propios.');
    const entry = { id: 'custom-' + randomUUID(), kind: 'custom', ...profile }; entries.push(entry); this.write(entries); return entry;
  }
  remove(id) { const entries = this.list(); if (!entries.some(entry => entry.id === id)) throw new Error('El terminal ya no existe.'); this.write(entries.filter(entry => entry.id !== id)); }
  resolve(id) { const profile = Object.hasOwn(builtinProfiles, id) ? builtinProfiles[id] : (detectedShells.find(entry => entry.id === id) || this.list().find(entry => entry.id === id)); if (!profile) throw new Error('Elige un terminal guardado.'); return profile; }
}
function findExecutable(command, folder, env) {
  const extensions = path.extname(command) ? [''] : ['', ...(env.PATHEXT || '.EXE;.COM;.CMD;.BAT').split(';')];
  const directories = /[\\/]/.test(command) ? [''] : (env.Path || env.PATH || '').split(path.delimiter).map(dir => dir.replace(/^"|"$/g, ''));
  for (const dir of directories) for (const extension of extensions) {
    const file = path.resolve(folder, dir, command + extension);
    try { if (fs.statSync(file).isFile()) return file; } catch {}
  }
  throw new Error('No se encuentra ' + command + '. Comprueba que está instalado y que su ruta es correcta.');
}
const quotePS = value => "'" + value.replaceAll("'", "''") + "'";
function scriptCommand(profile) { return '& ' + quotePS(profile.command) + ' @(' + profile.args.map(quotePS).join(',') + ')'; }
module.exports = { TerminalProfiles, validateProfile, findExecutable, scriptCommand, setDetectedShells, getDetectedShells };
