const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const {TerminalProfiles,validateProfile,findExecutable,scriptCommand}=require('./terminal-profiles');
test('custom profiles persist, update and delete independently of built-in terminals',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-profiles-'));
 try{
  const store=new TerminalProfiles(root);assert.deepEqual(store.list(),[]);
  const first=store.save({name:'Mi Ollama',command:'ollama',args:['run','mi-modelo'],icon:'ollama'});
  const second=store.save({name:'Otro chat',command:'ollama',args:['run','otro-modelo'],icon:'ollama'});
  assert.equal(new TerminalProfiles(root).resolve(first.id).args[1],'mi-modelo');
  store.save({...first,name:'Chat editado'});assert.equal(store.resolve(first.id).name,'Chat editado');
  store.remove(first.id);assert.equal(store.list().length,1);assert.equal(store.resolve(second.id).name,'Otro chat');
  assert.equal(store.resolve('codex').kind,'codex');assert.throws(()=>store.save({...second,id:'codex'}),/no existe/);
  fs.writeFileSync(store.file,'broken fixture');assert.throws(()=>store.save({name:'New',command:'node',args:[]}),/se conserva/);assert.equal(fs.readFileSync(store.file,'utf8'),'broken fixture');
 }finally{if(path.dirname(root)===os.tmpdir())fs.rmSync(root,{recursive:true,force:true});}
});
test('commands resolve from PATH and native arguments remain literal',()=>{
 const env={Path:path.dirname(process.execPath),PATHEXT:'.EXE'};
 const file=findExecutable(path.basename(process.execPath),os.tmpdir(),env);assert.equal(file.toLowerCase(),process.execPath.toLowerCase());
 const args=['model with spaces',"O'Brien",'$(Write-Output injected)','value; Write-Output injected','"quoted value"'];
 const result=spawnSync(file,['-e','console.log(JSON.stringify(process.argv.slice(1)))','--',...args],{windowsHide:true,encoding:'utf8'});
 assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout),args);
 assert.throws(()=>findExecutable('ai-terminal-fixture-missing.exe',os.tmpdir(),env),/No se encuentra/);
 assert.throws(()=>validateProfile({name:'Test',command:'node\nother',args:[]}),/sola línea/);
 assert.throws(()=>validateProfile({name:'Test',command:'node',args:[null]}),/argumentos/);
 assert.equal(scriptCommand({command:"D:/O'Brien/tool.ps1",args:['$(data)',"it's literal"]}),"& 'D:/O''Brien/tool.ps1' @('$(data)','it''s literal')");
});
