const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UserProfiles } = require('./user-profiles.cjs');
const { RecentProjects } = require('./recent-projects.cjs');
const { TerminalProfiles } = require('./terminal-profiles');
test('user profiles migrate legacy state, isolate settings and remember the selected user', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-users-'));
  try {
    const settings = { theme: 'forest', terminal: { customColors: true, colors: { foreground: '#abcdef' } }, usage: { indicator: 'ring', font: 'mono' } };
    fs.writeFileSync(path.join(root, 'ui-preferences.json'), JSON.stringify(settings));
    fs.writeFileSync(path.join(root, 'projects.json'), JSON.stringify([root]));
    const legacyTerminals = new TerminalProfiles(root); legacyTerminals.save({name:'Personal', command:'powershell.exe',args:[],icon:'terminal'});
    const manager = new UserProfiles(root), first = manager.directory();
    assert.equal(manager.current().id, 'default');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first,'ui-preferences.json'),'utf8')), settings);
    assert.deepEqual(new RecentProjects(path.join(first,'projects.json')).list(), [root]);
    assert.equal(new TerminalProfiles(first).list().length,1);
    const second = manager.create('Dani'); manager.switch(second.id);
    const secondDirectory = manager.directory();
    assert.notEqual(first,secondDirectory);
    assert.deepEqual(new RecentProjects(path.join(secondDirectory,'projects.json')).list(), []);
    assert.deepEqual(new TerminalProfiles(secondDirectory).list(), []);
    fs.writeFileSync(path.join(secondDirectory,'ui-preferences.json'), JSON.stringify({theme:'ocean'}));
    manager.rename(second.id, 'Trabajo');
    assert.equal(new UserProfiles(root).current().name,'Trabajo');
    manager.switch('default');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(manager.directory(),'ui-preferences.json'),'utf8')),settings);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'ui-preferences.json'),'utf8')).theme,'forest');
    assert.throws(()=>manager.create('principal'),/Ya existe/);
    assert.throws(()=>manager.create('  '),/nombre/);
    assert.throws(()=>manager.directory('../escape'),/no existe/);
    assert.throws(()=>manager.switch('../escape'),/no existe/);
    assert.throws(()=>manager.rename('default','Trabajo'),/Ya existe/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
