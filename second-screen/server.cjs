// Servidor local de la segunda pantalla: sirve la página del dispositivo, empareja con un código de seis cifras y
// transporta la señalización de WebRTC. Solo acepta redes privadas y un receptor a la vez.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PAIR_WINDOW_MS = 60000, PAIR_MAX_ATTEMPTS = 8, ACTIVE_TIMEOUT_MS = 45000, LONG_POLL_MS = 25000, MAX_BODY = 100000;
const allowedMessages = ['ready', 'answer', 'ice', 'bye', 'device', 'stats'];

// Direcciones de redes domésticas y locales: cualquier otra se rechaza antes de mirar la petición.
function isPrivateAddress(address) {
  let value = String(address || '');
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1' || /^fe80:/i.test(value) || /^f[cd][0-9a-f]{2}:/i.test(value)) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return false;
  const [first, second] = [Number(match[1]), Number(match[2])];
  return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254);
}
// Defensa frente a DNS rebinding: la cabecera Host debe ser una IP, localhost o un nombre .local.
function isAllowedHost(host) {
  return /^(localhost|\d{1,3}(\.\d{1,3}){3}|[a-z0-9-]+\.local)(:\d{1,5})?$/i.test(String(host || ''));
}
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function createServer({ onSignal = () => {}, onEvent = () => {}, assets = __dirname, now = () => Date.now() } = {}) {
  let token = crypto.randomBytes(24).toString('hex');
  let pin = String(crypto.randomInt(100000, 1000000));
  let attempts = [];
  let queue = [], waiters = [], active = null, closed = false;

  const files = { '/': ['viewer.html', 'text/html; charset=utf-8'], '/viewer.js': ['viewer.js', 'text/javascript; charset=utf-8'], '/viewer.css': ['viewer.css', 'text/css; charset=utf-8'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
  const wake = () => { const list = waiters; waiters = []; for (const flush of list) flush(); };

  function viewerConnected() { return Boolean(active && now() - active.time < ACTIVE_TIMEOUT_MS); }

  const server = http.createServer(async (req, res) => {
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (closed) return reply(503, { error: 'La transmisión está detenida.' });
    if (!isPrivateAddress(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
    if (!isAllowedHost(req.headers.host)) return reply(400, { error: 'Dirección no válida. Usa la dirección que aparece en el PC.' });
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/pair' && req.method === 'POST') {
      attempts = attempts.filter(time => now() - time < PAIR_WINDOW_MS);
      if (attempts.length >= PAIR_MAX_ATTEMPTS) return reply(429, { error: 'Demasiados intentos. Espera un minuto.' });
      attempts.push(now());
      try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1000) return reply(413, {}); }
        const given = String(JSON.parse(body).pin || '');
        if (!/^\d{6}$/.test(given) || !safeEqual(given, pin)) return reply(401, { error: 'Código incorrecto. Mira el código que aparece en el PC.' });
        return reply(200, { token });
      } catch { return reply(400, { error: 'Código no válido' }); }
    }

    if (url.pathname.startsWith('/api/')) {
      const bearer = String(req.headers.authorization || '');
      if (!safeEqual(bearer, 'Bearer ' + token)) return reply(401, { error: 'Enlace no válido. Abre el enlace que aparece en el PC.' });
      const client = req.headers['x-client-id'];
      if (typeof client !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(client)) return reply(400, { error: 'Cliente no válido' });
      if (active && active.id !== client && viewerConnected()) return reply(409, { error: 'Ya hay un dispositivo conectado. Cierra su página y espera unos segundos.' });
      let fresh = false;
      if (!active || active.id !== client) { const first = !viewerConnected() || !active; queue = []; active = { id: client, time: now() }; fresh = true; if (first) onEvent({ type: 'viewer', connected: true }); }
      active.time = now();

      if (req.method === 'GET' && url.pathname === '/api/signals') {
        const deliver = () => { if (res.writableEnded) return; if (active) active.time = now(); reply(200, queue.splice(0)); };
        // El primer sondeo de un receptor nuevo responde al momento; los siguientes esperan hasta que haya algo que contar.
        if (queue.length || fresh) return deliver();
        const timer = setTimeout(() => { waiters = waiters.filter(entry => entry !== finish); deliver(); }, LONG_POLL_MS);
        const finish = () => { clearTimeout(timer); deliver(); };
        waiters.push(finish);
        req.on('close', () => { clearTimeout(timer); waiters = waiters.filter(entry => entry !== finish); });
        return undefined;
      }
      if (req.method !== 'POST' || url.pathname !== '/api/signals') return reply(404, {});
      try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > MAX_BODY) return reply(413, { error: 'Mensaje demasiado grande' }); }
        const message = JSON.parse(body);
        if (!message || !allowedMessages.includes(message.type)) return reply(400, { error: 'Mensaje no válido' });
        if (message.type === 'device') {
          const valid = value => Number.isFinite(value) && value >= 200 && value <= 10000;
          if (!valid(message.width) || !valid(message.height) || !Number.isFinite(message.dpr) || message.dpr < 1 || message.dpr > 4) return reply(400, { error: 'Tamaño de pantalla no válido' });
        }
        if (message.type === 'bye') { onEvent({ type: 'viewer', connected: false }); active = null; }
        onSignal(message);
        return reply(200, { ok: true });
      } catch { return reply(400, { error: 'Mensaje no válido' }); }
    }

    const entry = files[url.pathname];
    if (!entry || req.method !== 'GET') return reply(404, {});
    const file = path.join(assets, entry[0]);
    if (!fs.existsSync(file)) return reply(404, {});
    res.setHeader('Content-Type', entry[1]);
    fs.createReadStream(file).pipe(res);
    return undefined;
  });

  return {
    server,
    get token() { return token; },
    get pin() { return pin; },
    viewerConnected,
    // Mensaje de la aplicación hacia el dispositivo.
    send(message) { if (queue.length > 200) queue = []; queue.push(message); wake(); },
    // Nuevo código y enlace: se usa al iniciar cada transmisión.
    rotate() { token = crypto.randomBytes(24).toString('hex'); pin = String(crypto.randomInt(100000, 1000000)); attempts = []; queue = []; active = null; wake(); },
    reset() { queue = []; active = null; wake(); },
    close() { closed = true; wake(); server.close(); server.closeAllConnections?.(); }
  };
}

module.exports = { createServer, isPrivateAddress, isAllowedHost };
