// Comprueba la sintaxis de todos los módulos y ejecuta las pruebas.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sources = fs.readdirSync(root).filter(f => /\.(c?js)$/.test(f) && !/\.test\./.test(f) && !/^(smoke|preview)/.test(f));
let failed = 0;
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status) { console.error(file + '\n' + result.stderr); failed++; }
}
console.log(failed ? failed + ' archivos con errores de sintaxis' : sources.length + ' módulos con sintaxis correcta');
if (failed) process.exit(1);

const lint = spawnSync(process.execPath, [path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js'), '.', '--max-warnings', '0'], { cwd: root, stdio: 'inherit' });
if (lint.status) process.exit(lint.status);
console.log('ESLint sin avisos');

const tests = fs.readdirSync(root).filter(f => /\.test\.(c?js)$/.test(f));
const run = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
process.exit(run.status || 0);
