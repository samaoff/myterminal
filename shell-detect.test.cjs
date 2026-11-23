const test = require('node:test');
const assert = require('node:assert/strict');
const { detectShells, parseWslList } = require('./shell-detect.cjs');

const env = { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };

test('parseWslList lee UTF-16, descarta Docker y nombres peligrosos', () => {
  const text = 'Ubuntu-22.04\r\ndocker-desktop\r\nDebian\r\nmal nombre; calc\r\n';
  assert.deepEqual(parseWslList(Buffer.from('\uFEFF' + text, 'utf16le')), ['Ubuntu-22.04', 'Debian']);
  assert.deepEqual(parseWslList(Buffer.from(text, 'utf8')), ['Ubuntu-22.04', 'Debian']);
});

test('detectShells ofrece solo lo que está instalado', async () => {
  const present = new Set(['C:\\Windows\\System32\\cmd.exe']);
  const shells = await detectShells({ env, exists: file => present.has(file) });
  assert.deepEqual(shells.map(s => s.id), ['shell-cmd']);
});

test('detectShells encuentra PowerShell 7, Git Bash y cada distribución de WSL', async () => {
  const present = new Set(['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\Windows\\System32\\cmd.exe', 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Windows\\System32\\wsl.exe']);
  const shells = await detectShells({ env, exists: file => present.has(file), runWsl: async () => Buffer.from('Ubuntu\r\nDebian\r\n', 'utf16le') });
  assert.deepEqual(shells.map(s => s.id), ['shell-pwsh', 'shell-cmd', 'shell-gitbash', 'shell-wsl-ubuntu', 'shell-wsl-debian']);
  assert.deepEqual(shells.find(s => s.id === 'shell-wsl-debian').args, ['-d', 'Debian']);
  assert.deepEqual(shells.find(s => s.id === 'shell-gitbash').args, ['--login', '-i']);
});

test('detectShells sigue funcionando si WSL falla', async () => {
  const present = new Set(['C:\\Windows\\System32\\wsl.exe']);
  const shells = await detectShells({ env, exists: file => present.has(file), runWsl: async () => { throw new Error('sin WSL'); } });
  assert.deepEqual(shells, []);
});
