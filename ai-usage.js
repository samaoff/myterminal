const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
function windowLabel(minutes) {
  if (minutes === 10080) return '7 días';
  if (Number.isFinite(minutes) && minutes > 0) return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
  return 'Cuota';
}
function quotaMeter(label, used, reset, now = Date.now()) {
  if (percent(used) === null) return null;
  const resetAt = typeof reset === 'number' && Number.isFinite(reset) ? reset * 1000 : null;
  // A passed reset doesn't imply a full allowance. Wait for fresh provider data.
  if (resetAt !== null && resetAt <= now) return null;
  return { label, remainingPercent: Math.round((100 - used) * 10) / 10, resetAt, scope: 'account' };
}
function normalizeCodex(data, now = Date.now()) {
  const buckets = data?.rateLimitsByLimitId && Object.keys(data.rateLimitsByLimitId).length ? Object.entries(data.rateLimitsByLimitId) : [['codex', data?.rateLimits]];
  const meters = [];
  for (const [key, bucket] of buckets) {
    if (!bucket) continue;
    for (const name of ['primary', 'secondary']) {
      const value = bucket[name]; if (!value) continue;
      const label = (buckets.length > 1 ? `${bucket.limitName || key} · ` : '') + windowLabel(value.windowDurationMins);
      const meter = quotaMeter(label, value.usedPercent, value.resetsAt, now); if (meter) meters.push(meter);
    }
  }
  return { provider: 'codex', meters, updatedAt: now, note: meters.length ? 'Cuota de la cuenta' : 'Cuota no disponible con esta cuenta o proveedor' };
}
function normalizeClaude(data, updatedAt, now = Date.now()) {
  const meters = [];
  for (const [key, label] of [['five_hour', '5 h'], ['seven_day', '7 días'], ['spend_limit', 'Límite de gasto']]) {
    const value = data?.rate_limits?.[key];
    const meter = quotaMeter(label, value?.used_percentage, value?.resets_at, now); if (meter) meters.push(meter);
  }
  const remaining = percent(data?.context_window?.remaining_percentage);
  if (remaining !== null) meters.push({ label: 'Contexto de la sesión', remainingPercent: remaining, resetAt: null, scope: 'context' });
  return { provider: 'claude', meters, updatedAt, model: typeof data?.model === 'string' ? data.model.slice(0, 100) : '', note: meters.some(m => m.scope === 'account') ? 'Cuota de la cuenta · contexto independiente' : 'Claude aún no ha facilitado la cuota de la cuenta' };
}
function commandEnvironment() {
  const env = { ...process.env };
  env.Path = [process.env.Path || process.env.PATH || '', path.join(os.homedir(), 'AppData', 'Roaming', 'npm'), path.join(os.homedir(), '.local', 'bin')].join(path.delimiter);
  delete env.PATH;
  return env;
}
function codexCommand(env) {
  for (const dir of env.Path.split(path.delimiter)) {
    const candidates = [path.join(dir, 'codex.exe'), ...['node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe', 'node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/codex/codex.exe'].map(s => path.join(dir, s))];
    for (const file of candidates) if (fs.existsSync(file)) return { file, args: ['app-server', '--listen', 'stdio://'] };
  }
  return { file: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-NonInteractive', '-Command', '& codex.cmd app-server --listen stdio://'] };
}
class CodexQuotaClient {
  constructor(launch = spawn) { this.launch = launch; this.pending = new Map(); this.sequence = 0; this.cache = null; this.lastAttempt = 0; }
  async start() {
    if (this.starting) return this.starting;
    const env = commandEnvironment(), command = codexCommand(env);
    const child = this.child = this.launch(command.file, command.args, { env, cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) { this.stop(); return; }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        const request = this.pending.get(message.id);
        if (request) { this.pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error('Codex no proporciona esta cuota.')) : request.resolve(message.result); }
        else if (message.id !== undefined && message.method) child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Read-only quota client' } }) + '\n');
      }
    });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => this.stop());
    child.on('error', () => this.stop());
    child.on('exit', () => { if (this.child === child) this.stop(); });
    this.starting = this.request('initialize', { clientInfo: { name: 'samaapp_ai_terminal', title: 'MyTerminal', version: '0.5.0' } }).then(() => {
      if (this.child !== child) throw new Error('Codex desconectado.');
      child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    }).catch(error => { this.stop(); throw error; });
    return this.starting;
  }
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Tiempo de espera de cuota agotado.')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  async read(force = false) {
    if (this.reading) return this.reading;
    if (Date.now() - this.lastAttempt < (force ? 10000 : 60000) && this.cache) return this.cache;
    this.lastAttempt = Date.now();
    this.reading = (async () => {
      try { await this.start(); const data = await this.request('account/rateLimits/read'); this.cache = normalizeCodex(data); }
      catch {
        this.cache = this.cache?.meters.length ? { ...this.cache, stale: true, note: 'Sin actualizar · último dato recibido' } : { provider: 'codex', meters: [], note: 'No se pudo consultar la cuota. Comprueba el inicio de sesión de Codex.' };
      }
      return this.cache;
    })().finally(() => { this.reading = null; });
    return this.reading;
  }
  stop() {
    const child = this.child; this.child = null; this.starting = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Cliente cerrado.')); }
    this.pending.clear();
    if (child) { child.stdin.end(); const timer = setTimeout(() => { try { child.kill(); } catch {} }, 1500); timer.unref(); }
  }
}
class UsageTracker {
  constructor(userData, source = __dirname) { this.root = fs.mkdtempSync(path.join(userData, 'usage-')); this.source = source; this.sessions = new Map(); this.codex = new CodexQuotaClient(); }
  prepare(id, kind) {
    const entry = { kind }; this.sessions.set(id, entry);
    if (kind !== 'claude') return null;
    const token = require('node:crypto').randomUUID();
    const usagePath = path.join(this.root, `${token}.json`), settingsPath = path.join(this.root, `${token}.settings.json`), script = path.join(this.root, 'statusline.ps1');
    if (!fs.existsSync(script)) fs.copyFileSync(path.join(this.source, 'usage-statusline.ps1'), script);
    const command = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + script.replaceAll('\\', '/') + '"';
    fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command } }));
    Object.assign(entry, { usagePath, sessionId: token, settingsPath });
    return { settingsPath, env: { AI_TERMINAL_USAGE_FILE: usagePath, AI_TERMINAL_CLAUDE_SESSION: token }, sessionId: token };
  }
  async read(id, force) {
    const entry = this.sessions.get(id);
    if (!entry || !['codex', 'claude'].includes(entry.kind)) return { meters: [], note: 'Sin sesión de IA' };
    if (entry.kind === 'codex') return this.codex.read(force);
    try {
      const stat = fs.statSync(entry.usagePath); if (stat.size > 64 * 1024) throw new Error('Invalid snapshot');
      const data = JSON.parse(fs.readFileSync(entry.usagePath, 'utf8'));
      if (data.session_id !== entry.sessionId) throw new Error('Session mismatch');
      return normalizeClaude(data, stat.mtimeMs);
    } catch { return { provider: 'claude', meters: [], note: 'Esperando datos de Claude · pueden aparecer tras la primera respuesta' }; }
  }
  end(id) {
    this.sessions.delete(id);
    if (![...this.sessions.values()].some(s => s.kind === 'codex')) this.codex.stop();
  }
  dispose() {
    this.codex.stop(); this.sessions.clear();
    // root was created by this tracker; only remove that exact per-instance directory.
    if (path.basename(this.root).startsWith('usage-')) fs.rmSync(this.root, { recursive: true, force: true });
  }
}
module.exports = { UsageTracker, CodexQuotaClient, normalizeCodex, normalizeClaude, quotaMeter };
