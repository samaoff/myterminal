// Ejecuta las comprobaciones con la aplicación arrancada. Uso: npm run smoke
// Cada una usa una carpeta de datos temporal y no toca los datos del usuario.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron');
const root = path.join(__dirname, '..');
const suites = ['personalization', 'user-profiles', 'session-tools', 'shell-history', 'design-gallery', 'shell', 'quota', 'shells', 'palette', 'shortcuts', 'restore', 'panes', 'security', 'gpu', 'background', 'external', 'second-screen', 'themes', 'layout', 'custom-terminals'];
let failed = 0;
for (const name of suites) {
  const file = 'smoke-' + name + '.cjs';
  const result = path.join(root, 'smoke-' + name + '-result.json');
  fs.rmSync(result, { force: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-pro-smoke-'));
  spawnSync(electron, [file, '--user-data-dir=' + data], { cwd: root, stdio: 'ignore', timeout: 180000 });
  let outcome = null;
  try { outcome = JSON.parse(fs.readFileSync(result, 'utf8')); } catch {}
  const ok = Boolean(outcome && (outcome.ok === true || outcome.passed === true));
  console.log((ok ? 'OK    ' : 'FALLA ') + name + (ok ? '' : ' · ' + (outcome ? outcome.error : 'sin resultado')));
  if (!ok) failed++;
  fs.rmSync(result, { force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
console.log(failed ? failed + ' comprobaciones fallan' : 'Todas las comprobaciones pasan');
process.exit(failed ? 1 : 0);
