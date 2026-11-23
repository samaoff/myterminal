const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const tools=require('./project-tools');
test('Git actions preserve edits, support initial index, commits and local remote sync',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ai-terminal-git-actions-'));
 const project=path.join(root,'project'),remote=path.join(root,'remote.git');await fs.mkdir(project);
 const git=(args,cwd=project)=>execFileSync('git',args,{cwd,windowsHide:true,encoding:'utf8'});
 try{
  assert.equal((await tools.gitInfo(project)).available,false);
  git(['init']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
  await fs.writeFile(path.join(project,'file.txt'),'first\n');
  await tools.gitAction(project,'stage','file.txt');
  assert.equal((await tools.changes(project)).entries[0].state,'A ');
  await tools.gitAction(project,'unstage','file.txt');
  assert.equal(await fs.readFile(path.join(project,'file.txt'),'utf8'),'first\n');
  await tools.gitAction(project,'stage','file.txt');await tools.gitAction(project,'commit',null,'Initial fixture');
  await fs.writeFile(path.join(project,'file.txt'),'second\n');
  await tools.gitAction(project,'stage','file.txt');await tools.gitAction(project,'unstage','file.txt');
  assert.equal((await tools.changes(project)).entries[0].state,' M');
  await tools.gitAction(project,'stage','file.txt');await tools.gitAction(project,'commit',null,'Second fixture');
  git(['init','--bare',remote]);git(['remote','add','origin',remote]);git(['push','-u','origin','HEAD']);
  await tools.gitAction(project,'fetch');await tools.gitAction(project,'pull');await tools.gitAction(project,'push');
  assert.equal((await tools.gitInfo(project)).ahead,0);
  assert.match((await tools.gitInfo(project)).history,/Second fixture/);
  await assert.rejects(tools.gitAction(project,'reset'),/no válida/);
  await assert.rejects(tools.gitAction(project,'stage','../escape'),/Actualiza/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('system and plugin duplicates are protected',()=>{
 assert.equal(tools.canDeleteSkill({scope:'Personal',file:'D:/skills/foo/SKILL.md'}),true);
 assert.equal(tools.canDeleteSkill({scope:'Caché de plugin',file:'D:/plugins/foo/SKILL.md'}),false);
 assert.equal(tools.canDeleteSkill({scope:'Personal / sistema',file:'D:/skills/foo/SKILL.md'}),false);
 assert.equal(tools.canDeleteSkill({scope:'Personal',file:'D:/skills/.system/foo/SKILL.md'}),false);
});
