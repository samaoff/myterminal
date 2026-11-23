const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createHash} = require('node:crypto');
const {AppUpdates,compareVersions,versionParts,RELEASES} = require('./app-updates.cjs');
const binary = Buffer.from('MZ\0fixture installer, never executed');
const checksum = createHash('sha256').update(binary).digest('hex');
const filename = 'MyTerminal-Setup-0.10.0.exe';
const release = (version, extra={}) => ({tag_name:'v'+version,name:'MyTerminal '+version,body:'Novedades',draft:false,prerelease:false,assets:[{name:`MyTerminal-Setup-${version}.exe`,browser_download_url:'https://untrusted.invalid/ignored.exe'},{name:`MyTerminal-Setup-${version}.exe.sha256`}],...extra});
const secure = {
  async isAsyncEncryptionAvailable(){return true;},
  async encryptStringAsync(text){return Buffer.from('encrypted:'+Buffer.from(text).toString('base64'));},
  async decryptStringAsync(buffer){return {result:Buffer.from(buffer.toString().slice(10),'base64').toString()};}
};
function service(t, options={}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'terminal-updates-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const calls=[];
  const fetchImpl = async (url, options) => {
    calls.push({url,options});
    if (url.includes('/releases?')) return Response.json([release('0.10.0'),release('0.9.0')]);
    if (url.endsWith('.sha256')) return new Response(`${checksum}  ${filename}\n`);
    return new Response(binary,{headers:{'content-length':String(binary.length)}});
  };
  return {updater:new AppUpdates({directory,version:'0.9.0',packaged:true,safeStorage:secure,fetchImpl,...options}), calls,directory};
}
test('version ordering is numeric and only accepts stable versions',()=>{
  assert.equal(compareVersions('0.10.0','0.9.0'),1);
  assert.equal(compareVersions('v1.0.0','1.0.0'),0);
  for(const value of ['0.10.0-beta.1','../1.0.0','01.0.0','Infinity.0.0','1.0'])assert.equal(versionParts(value),null);
});
test('check ignores future, draft and prerelease releases and downloads verified bytes from the fixed release path',async t=>{
  const {updater,calls}=service(t);
  const base=updater.fetch;
  updater.fetch=(url,options)=>url.includes('/releases?')?Response.json([release('0.9.0'),release('9.0.0',{published_at:'2099-01-01'}),release('8.0.0',{draft:true}),release('7.0.0',{prerelease:true}),release('0.10.0'),release('2.0.0-beta.1')]):base(url,options);
  assert.equal((await updater.check()).availableVersion,'0.10.0');
  const state=await updater.download();
  assert.equal(state.status,'downloaded');assert.equal(state.progress,100);
  assert.deepEqual(fs.readFileSync(await updater.verifiedInstaller()),binary);
  assert(calls.every(call=>call.url.startsWith(RELEASES+'/download/v0.10.0/')));
  assert.equal(JSON.stringify(state).includes(updater.downloaded.file),false);
});
test('equal or older releases do not offer an update; incomplete latest release is reported',async t=>{
  const {updater}=service(t,{version:'0.10.0'});
  assert.equal((await updater.check()).status,'current');
  updater.fetch=async()=>Response.json([release('0.11.0',{assets:[]})]);
  const state=await updater.check();assert.equal(state.status,'error');assert.match(state.message,/todavía no está publicado/);
  assert.equal(state.availableVersion,null);
});
test('tokens are encrypted on disk, never returned to the renderer, reload and can be removed',async t=>{
  const {updater,calls,directory}=service(t);const token='glpat-unit-test-secret';
  await updater.configure({token,autoCheck:false});
  assert.equal(fs.readFileSync(updater.settingsFile,'utf8').includes(token),false);
  assert.equal(JSON.stringify(updater.snapshot()).includes(token),false);
  const restored=new AppUpdates({directory,version:'0.9.0',packaged:true,safeStorage:secure});
  await restored.initialize();assert.equal(restored.token,token);assert.equal(restored.snapshot().autoCheck,false);
  await updater.check();assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);
  await updater.configure({forgetToken:true});assert.equal(updater.token,'');assert.equal(updater.snapshot().hasToken,false);
});
test('refuses plain text token persistence when secure encryption is unavailable',async t=>{
  const {updater}=service(t,{safeStorage:{async isAsyncEncryptionAvailable(){return false;}}});
  await assert.rejects(updater.configure({token:'secret'}),/proteger/);
  assert.equal(fs.existsSync(updater.settingsFile),false);
});
test('foreign redirects are rejected before any credential is sent there',async t=>{
  const {updater,calls}=service(t);
  await updater.configure({token:'test-token'});
  updater.fetch=async(url,options)=>{calls.push({url,options});return new Response(null,{status:302,headers:{location:'https://untrusted.invalid/file.exe'}});};
  const state=await updater.check();assert.equal(state.status,'error');assert.match(state.message,/no pertenece/);
  assert.equal(calls.length,1);
});
test('GitHub failures are actionable and network errors do not leak tokens',async t=>{
  const {updater}=service(t,{fetchImpl:async()=>new Response(null,{status:404})});
  assert.match((await updater.check()).message,/no encuentra/);
  updater.fetch=async()=>new Response(null,{status:403});
  assert.match((await updater.check()).message,/limitado/);
  updater.fetch=async()=>{throw Error('private url with token=secret');};
  assert.equal((await updater.check()).message.includes('secret'),false);
});
test('hash mismatch and HTML responses never become installers, partial files are removed',async t=>{
  const {updater,directory}=service(t);await updater.check();
  const base=updater.fetch;
  updater.fetch=(url,options)=>url.endsWith('.exe')?new Response('MZcorrupted'):base(url,options);
  assert.equal((await updater.download()).status,'error');assert.equal(updater.downloaded,null);
  assert.deepEqual(fs.readdirSync(path.join(directory,'updates')),[]);
  updater.fetch=(url,options)=>url.endsWith('.exe')?new Response('<html>sign in</html>'):base(url,options);
  assert.match((await updater.download()).message,/no es un ejecutable/);
});
test('changed downloads are refused before installation and development cannot install',async t=>{
  const {updater}=service(t);await updater.check();await updater.download();
  fs.appendFileSync(updater.downloaded.file,'tampered');
  await assert.rejects(updater.verifiedInstaller(),/ha cambiado/);assert.equal(updater.downloaded,null);
  const dev=service(t,{packaged:false}).updater;await dev.check();await dev.download();
  await assert.rejects(dev.verifiedInstaller(),/no en desarrollo/);
});
test('download cancellation cleans partial data and permits a later retry',async t=>{
  const {updater,directory}=service(t);await updater.check();const base=updater.fetch;
  updater.fetch=async(url,options)=>{
    if(!url.endsWith('.exe'))return base(url,options);
    return new Response(new ReadableStream({start(controller){controller.enqueue(binary);options.signal.addEventListener('abort',()=>controller.error(options.signal.reason),{once:true});}}));
  };
  let cancel;
  updater.on('change',state=>{if(state.bytes>0&&state.status==='downloading')cancel=setImmediate(()=>updater.cancel());});
  const result=await updater.download();clearImmediate(cancel);
  assert.equal(result.status,'error');assert.equal(updater.busy,false);
  assert.deepEqual(fs.readdirSync(path.join(directory,'updates')),[]);
  updater.removeAllListeners();updater.fetch=base;
  assert.equal((await updater.download()).status,'downloaded');
});
test('the token only reaches the GitHub API, never the download storage it redirects to',async t=>{
  const {updater,calls}=service(t);
  await updater.configure({token:'ghp-unit-test-secret'});await updater.check();
  const base=updater.fetch;
  updater.fetch=async(url,options)=>{calls.push({url,options});if(url.startsWith(RELEASES))return new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/file'+(url.endsWith('.sha256')?'.sha256':'')}});return base(url,options);};
  assert.equal((await updater.download()).status,'downloaded');
  const sent=calls.filter(call=>JSON.stringify(call.options?.headers||{}).includes('ghp-unit-test-secret')).map(call=>new URL(call.url).origin);
  assert.deepEqual([...new Set(sent)],['https://api.github.com']);
  assert(calls.some(call=>call.url.startsWith('https://release-assets.githubusercontent.com/')));
});
