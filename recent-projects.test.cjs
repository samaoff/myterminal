const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RecentProjects } = require('./recent-projects.cjs');

test('recent projects deduplicate real folders, remove persistently and preserve files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-recents-'));
  try {
    const folder = path.join(root, 'project'); fs.mkdirSync(folder);
    const contents = path.join(folder, 'keep.txt'); fs.writeFileSync(contents, 'keep');
    const file = path.join(root, 'projects.json');
    const alias = folder + path.sep + '.';
    fs.writeFileSync(file, JSON.stringify([folder, alias, folder, contents, path.join(root, 'missing'), null]));
    const history = new RecentProjects(file);
    assert.deepEqual(history.list(), [folder]);
    history.add(alias);
    assert.deepEqual(new RecentProjects(file).list(), [alias]);
    if (process.platform === 'win32') {
      history.add(folder.toUpperCase());
      assert.equal(history.list().length, 1);
    }
    history.remove(folder);
    assert.deepEqual(new RecentProjects(file).list(), []);
    assert.equal(fs.readFileSync(contents, 'utf8'), 'keep');
    fs.writeFileSync(file, '{}'); assert.deepEqual(history.list(), []);
    fs.writeFileSync(file, 'invalid'); assert.deepEqual(history.list(), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
