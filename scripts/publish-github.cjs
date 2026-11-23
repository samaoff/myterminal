// Publica en GitHub Releases el instalador ya generado (npm run dist), con su suma SHA-256 y las notas de releases.json.
// Uso: node scripts/publish-github.cjs <versión>   (necesita gh con la sesión iniciada)
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { REPOSITORY } = require('../app-updates.cjs');
const root = path.resolve(__dirname, '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Indica una versión estable, por ejemplo: node scripts/publish-github.cjs 2.0.1');
if (require('../package.json').version !== version) throw new Error('package.json no está en la versión ' + version);
const filename = 'MyTerminal-Setup-' + version + '.exe';
const installer = path.join(root, 'dist-pro', filename);
if (!fs.existsSync(installer)) throw new Error('No se encuentra ' + installer + '. Ejecuta antes npm run dist.');
const sha256 = createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
fs.writeFileSync(installer + '.sha256', sha256 + '  ' + filename + '\n');
const entry = JSON.parse(fs.readFileSync(path.join(root, 'releases.json'), 'utf8')).find(item => item.version === version);
const notes = (entry ? entry.changes.map(change => '- ' + change).join('\n') + '\n\n' : '') +
  'Instalador para Windows de 64 bits, sin firmar: SmartScreen mostrará un aviso (Más información → Ejecutar de todas formas).\n\nSHA-256: `' + sha256 + '`';
const title = 'MyTerminal ' + version + (entry?.title ? ' · ' + entry.title : '');
const result = spawnSync('gh', ['release', 'create', 'v' + version, installer, installer + '.sha256', '--repo', REPOSITORY, '--title', title, '--notes', notes, '--verify-tag'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
