// Detecta los shells instalados en Windows y los ofrece como terminales sin que el usuario tenga que configurarlos.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// «wsl.exe -l -q» escribe en UTF-16 con caracteres nulos; también se acepta UTF-8 por si cambia.
function parseWslList(buffer) {
  const text = Buffer.isBuffer(buffer) ? (buffer.includes(0) ? buffer.toString('utf16le') : buffer.toString('utf8')) : String(buffer || '');
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.replace(/\0/g, '').trim()).filter(name => safeName.test(name) && !/^docker-desktop(-data)?$/i.test(name));
}

function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

// exists(ruta) y runWsl() se pueden sustituir en las pruebas.
async function detectShells({ env = process.env, exists = file => { try { return fs.statSync(file).isFile(); } catch { return false; } }, runWsl = defaultRunWsl } = {}) {
  const system = env.SystemRoot || 'C:\\Windows';
  const programFiles = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432].filter(Boolean);
  const found = [];
  const pwsh = [...programFiles.map(dir => path.join(dir, 'PowerShell', '7', 'pwsh.exe')), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe')].filter(Boolean).find(exists);
  if (pwsh) found.push({ id: 'shell-pwsh', name: 'PowerShell 7', command: pwsh, args: ['-NoLogo'], icon: 'powershell' });
  const cmd = path.join(system, 'System32', 'cmd.exe');
  if (exists(cmd)) found.push({ id: 'shell-cmd', name: 'Símbolo del sistema', command: cmd, args: [], icon: 'terminal' });
  const gitBash = [...programFiles.map(dir => path.join(dir, 'Git', 'bin', 'bash.exe')), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe')].filter(Boolean).find(exists);
  if (gitBash) found.push({ id: 'shell-gitbash', name: 'Git Bash', command: gitBash, args: ['--login', '-i'], icon: 'terminal' });
  const wsl = path.join(system, 'System32', 'wsl.exe');
  if (exists(wsl)) {
    let names = [];
    try { names = parseWslList(await runWsl(wsl)); } catch {}
    const used = new Set();
    for (const name of names) {
      let id = 'shell-wsl-' + slug(name);
      if (!slug(name) || used.has(id)) continue;
      used.add(id);
      found.push({ id, name: 'WSL · ' + name, command: wsl, args: ['-d', name], icon: 'terminal' });
    }
  }
  return found;
}

function defaultRunWsl(wsl) {
  return new Promise((resolve, reject) => {
    execFile(wsl, ['-l', '-q'], { encoding: 'buffer', windowsHide: true, timeout: 6000, maxBuffer: 256 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

module.exports = { detectShells, parseWslList };
