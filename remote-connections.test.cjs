const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {RemoteConnections,validateConnection,remoteArguments,connectionLaunch}=require('./remote-connections.cjs');
const base={name:'Servidor',protocol:'ssh',host:'example.test',port:2222,username:'dani'};
test('remote connections validate endpoints and pass native arguments without shell interpolation',()=>{
  assert.deepEqual(remoteArguments(base),['-p','2222','-o','ConnectTimeout=15','-l','dani','--','example.test']);
  assert.deepEqual(remoteArguments({...base,protocol:'sftp',host:'[::1]',keyFile:path.resolve('key with spaces')}),['-P','2222','-o','ConnectTimeout=15','-o','User=dani','-i',path.resolve('key with spaces'),'--','[::1]']);
  assert.throws(()=>remoteArguments({...base,protocol:'rdp',host:'::1',port:3389}),/integrado/);
  assert.equal(validateConnection({...base,protocol:'rdp',fitToTab:false}).fitToTab,false);
  assert.equal(validateConnection({...base,protocol:'rdp'}).username,'dani');
  for(const host of ['-oProxyCommand=bad','host;command','user@host','host:22','host/other','$(bad)','host\nother'])assert.throws(()=>validateConnection({...base,host}));
  for(const port of [0,65536,1.5,'wrong'])assert.throws(()=>validateConnection({...base,port}));
  assert.throws(()=>validateConnection({...base,username:'user -oProxyCommand=bad'}));
  assert.throws(()=>validateConnection({...base,keyFile:'../key'}));
  assert.equal(validateConnection({...base,password:'NEVER_STORE',privateKey:'PRIVATE'}).password,undefined);
  assert.equal(validateConnection({...base,protocol:'rdp',port:''}).port,3389);
});
test('remote access CRUD persists independently per user and removal preserves keys',()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-remotes-'));
  try{
    const first=new RemoteConnections(path.join(fixture,'first')),second=new RemoteConnections(path.join(fixture,'second'));
    const keyFile=path.join(fixture,'private key');fs.writeFileSync(keyFile,'FIXTURE_KEY');
    const entry=first.save({...base,keyFile,password:'NEVER_STORE'});
    assert.equal(first.list().length,1);assert.deepEqual(second.list(),[]);
    assert.doesNotMatch(fs.readFileSync(first.file,'utf8'),/NEVER_STORE|FIXTURE_KEY/);
    first.save({...entry,name:'Renombrado'});assert.equal(new RemoteConnections(path.join(fixture,'first')).get(entry.id).name,'Renombrado');
    if(process.platform==='win32'){
      const launch=connectionLaunch(entry,fixture);assert.equal(path.basename(launch.file),'ssh.exe');assert.equal(launch.folder,fixture);assert.ok(launch.args.includes(keyFile));
    }
    assert.throws(()=>connectionLaunch({...entry,localFolder:path.join(fixture,'missing')}));
    first.remove(entry.id);assert.deepEqual(first.list(),[]);assert.equal(fs.readFileSync(keyFile,'utf8'),'FIXTURE_KEY');
    fs.writeFileSync(first.file,'invalid JSON');assert.throws(()=>first.list(),/se conserva/);
  }finally{fs.rmSync(fixture,{recursive:true,force:true});}
});
