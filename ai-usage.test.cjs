const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {spawnSync}=require('node:child_process');const {EventEmitter}=require('node:events');const {PassThrough,Writable}=require('node:stream');
const {normalizeCodex,normalizeClaude,CodexQuotaClient,UsageTracker}=require('./ai-usage');
test('quota normalization separates account quota from context and rejects missing or expired values',()=>{
 const now=2000000;
 const codex=normalizeCodex({rateLimits:{primary:{usedPercent:20,windowDurationMins:300,resetsAt:3000},secondary:{usedPercent:100,windowDurationMins:10080,resetsAt:4000}}},now);
 assert.deepEqual(codex.meters.map(m=>[m.label,m.remainingPercent]),[['5 h',80],['7 días',0]]);
 assert.equal(normalizeCodex({},now).meters.length,0);
 assert.equal(normalizeCodex({rateLimits:{primary:{usedPercent:null}}},now).meters.length,0);
 assert.equal(normalizeCodex({rateLimits:{primary:{usedPercent:25,resetsAt:1000}}},now).meters.length,0);
 const claude=normalizeClaude({rate_limits:{five_hour:{used_percentage:37.5,resets_at:3000}},context_window:{remaining_percentage:12}},now,now);
 assert.deepEqual(claude.meters.map(m=>[m.scope,m.remainingPercent]),[['account',62.5],['context',12]]);
 assert.equal(normalizeClaude({context_window:{remaining_percentage:null}},now,now).meters.length,0);
 const multiple=normalizeCodex({rateLimitsByLimitId:{codex:{primary:{usedPercent:10}},other:{primary:{usedPercent:50}}}},now);
 assert.match(multiple.meters[0].label,/codex/);assert.match(multiple.meters[1].label,/other/);
});
test('Codex uses read-only handshake and account quota RPC with shared caching',async()=>{
 const requests=[];let child;
 const launch=()=>{
  child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin=new Writable({write(chunk,_encoding,done){
   const request=JSON.parse(chunk.toString());requests.push(request.method);
   if(request.id!==undefined)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:request.id,result:request.method==='initialize'?{}:{rateLimits:{primary:{usedPercent:40,windowDurationMins:300,resetsAt:Date.now()/1000+1000}}}})+'\n'));
   done();
  }});return child;
 };
 const client=new CodexQuotaClient(launch);
 try {const [first,second]=await Promise.all([client.read(),client.read()]);assert.equal(first.meters[0].remainingPercent,60);assert.deepEqual(first,second);await client.read();assert.deepEqual(requests,['initialize','initialized','account/rateLimits/read']);}
 finally{client.stop();}
});
test('Claude statusline writes numeric data only and isolates simultaneous sessions',async()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-usage-test-'));
 const tracker=new UsageTracker(fixture);
 try{
  const first=tracker.prepare('one','claude'),second=tracker.prepare('two','claude');
  assert.equal((await tracker.read('one')).meters.length,0);
  const input={session_id:first.sessionId,model:{display_name:'Fixture model'},context_window:{remaining_percentage:67},rate_limits:{five_hour:{used_percentage:12,resets_at:Date.now()/1000+600}},messages:['SENSITIVE_FIXTURE'],transcript_path:'PRIVATE_FIXTURE'};
  const script=path.join(tracker.root,'statusline.ps1');
  const run=env=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{env:{...process.env,...env},input:JSON.stringify(input),encoding:'utf8',windowsHide:true});
  const captured=run(first.env);assert.equal(captured.status,0,captured.stderr);
  const stored=fs.readFileSync(first.env.AI_TERMINAL_USAGE_FILE,'utf8');assert.doesNotMatch(stored,/SENSITIVE|PRIVATE/);
  assert.equal((await tracker.read('one')).meters[0].remainingPercent,88);
  assert.equal((await tracker.read('two')).meters.length,0);
  run(second.env);assert.equal(fs.existsSync(second.env.AI_TERMINAL_USAGE_FILE),false);
  tracker.end('one');assert.equal((await tracker.read('one')).meters.length,0);
 }finally{tracker.dispose();if(path.dirname(fixture)===os.tmpdir())fs.rmSync(fixture,{recursive:true,force:true});}
});
