const fs = require('node:fs');
const path = require('node:path');

function projectKey(folder) {
  const resolved = fs.realpathSync.native(folder);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
class RecentProjects {
  constructor(file) { this.file = file; }
  list() {
    let entries;
    try { entries = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return []; }
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    return entries.filter(folder => {
      if (typeof folder !== 'string' || !path.isAbsolute(folder)) return false;
      try {
        if (!fs.statSync(folder).isDirectory()) return false;
        const key = projectKey(folder);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      } catch { return false; }
    }).slice(0, 8);
  }
  save(entries) {
    fs.writeFileSync(this.file, JSON.stringify(entries));
    return entries;
  }
  add(folder) {
    const key = projectKey(folder);
    return this.save([folder, ...this.list().filter(value => projectKey(value) !== key)].slice(0, 8));
  }
  remove(folder) {
    if (typeof folder !== 'string') throw new Error('Proyecto no válido.');
    let key;
    try { key = projectKey(folder); } catch { key = null; }
    return this.save(this.list().filter(value => key ? projectKey(value) !== key : value !== folder));
  }
}
module.exports = { RecentProjects };
