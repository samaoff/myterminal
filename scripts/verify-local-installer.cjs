const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const directory = path.resolve(process.argv[2] || path.join(root, 'dist-' + version));
const archive = path.join(directory, 'win-unpacked', 'resources', 'app.asar');
const installer = path.join(directory, 'MyTerminal-Setup-' + version + '.exe');
const files = ['README.md', 'main.js', 'preload.js', 'renderer.js', 'index.html', 'releases.json', 'sftp-browser.cjs', 'sftp-browser-ui.js', 'session-tools.js', 'session-tools.css', 'remote-connections-ui.js', 'terminal-search.js', 'shell-history.ps1'];
for (const file of files) assert(asar.extractFile(archive, file).equals(fs.readFileSync(path.join(root, file))), 'Packaged source differs: ' + file);
// electron-builder removes development metadata from package.json.
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
for (const field of ['name', 'version', 'main', 'dependencies']) assert.deepEqual(packaged[field], require('../package.json')[field], 'Packaged metadata differs: ' + field);
const entries = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
assert(entries.includes('/node_modules/ssh2/package.json'), 'Missing SSH2 runtime');
assert(entries.includes('/node_modules/@xterm/addon-search/lib/addon-search.js'), 'Missing terminal search addon');
const moduleRoot = path.join('vendor', 'PSReadLine', '2.3.6');
for (const file of ['PSReadLine.psd1', 'PSReadLine.psm1', 'Microsoft.PowerShell.PSReadLine2.dll', 'License.txt']) {
  assert(fs.readFileSync(path.join(directory, 'win-unpacked', 'resources', moduleRoot, file)).equals(fs.readFileSync(path.join(root, moduleRoot, file))), 'Packaged PSReadLine differs: ' + file);
}
assert(!entries.some(file => /(?:smoke-session-tools|preview-notifications)\.cjs$/.test(file)), 'Development demo included in installer');
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
assert.equal(JSON.parse(asar.extractFile(archive, 'releases.json'))[0].version, version);
assert.equal(require('../package-lock.json').packages[''].version, version);
const bytes = fs.readFileSync(installer);
assert.equal(bytes.subarray(0, 2).toString(), 'MZ', 'Installer is not a Windows executable');
const sha256 = createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(installer + '.sha256', sha256 + '  ' + path.basename(installer) + '\n');
const report = { passed: true, version, installer, bytes: bytes.length, sha256, packagedSourcesVerified: files, ssh2Included: true, developmentDemosExcluded: true };
fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
