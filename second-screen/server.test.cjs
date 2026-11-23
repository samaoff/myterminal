const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, isPrivateAddress, isAllowedHost } = require('./server.cjs');

test('solo se aceptan redes privadas y cabeceras Host razonables', () => {
  for (const ok of ['192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.1', '127.0.0.1', '::1', '::ffff:192.168.1.30', 'fe80::1', 'fd12::1', '169.254.4.4']) assert.equal(isPrivateAddress(ok), true, ok);
  for (const bad of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '203.0.113.9', '2606:4700::1', '', undefined, 'abc']) assert.equal(isPrivateAddress(bad), false, String(bad));
  for (const ok of ['192.168.1.20:3210', 'localhost:3210', 'mi-pc.local', 'mi-pc.local:3210']) assert.equal(isAllowedHost(ok), true, ok);
  for (const bad of ['evil.example.com', 'evil.example.com:3210', '', undefined, '192.168.1.20.evil.com']) assert.equal(isAllowedHost(bad), false, String(bad));
});

async function start(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-assets-'));
  for (const [name, text] of [['viewer.html', '<!doctype html><title>visor</title>'], ['viewer.js', 'console.log(1)'], ['viewer.css', 'body{}']]) fs.writeFileSync(path.join(dir, name), text);
  const received = [], events = [];
  const service = createServer({ onSignal: message => received.push(message), onEvent: event => events.push(event), assets: dir, ...extra });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + service.server.address().port;
  return { service, received, events, base, dir, stop: () => { service.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const post = (base, route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('emparejamiento: código correcto, incorrecto y límite de intentos', async () => {
  const s = await start();
  try {
    let response = await post(s.base, '/api/pair', { pin: '000000' === s.service.pin ? '111111' : '000000' });
    assert.equal(response.status, 401);
    response = await post(s.base, '/api/pair', { pin: 'abc' });
    assert.equal(response.status, 401);
    response = await post(s.base, '/api/pair', { pin: s.service.pin });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, s.service.token);
    for (let i = 0; i < 10; i++) await post(s.base, '/api/pair', { pin: '123456' });
    response = await post(s.base, '/api/pair', { pin: s.service.pin });
    assert.equal(response.status, 429);
  } finally { s.stop(); }
});

test('señalización: exige token, valida mensajes y aísla receptores', async () => {
  let time = 1000;
  const s = await start({ now: () => time });
  try {
    const headers = client => ({ Authorization: 'Bearer ' + s.service.token, 'X-Client-Id': client });
    assert.equal((await fetch(s.base + '/api/signals')).status, 401);
    assert.equal((await fetch(s.base + '/api/signals', { headers: { Authorization: 'Bearer mal', 'X-Client-Id': 'cliente-uno-1' } })).status, 401);
    assert.equal((await fetch(s.base + '/api/signals', { headers: { Authorization: 'Bearer ' + s.service.token, 'X-Client-Id': 'x' } })).status, 400);
    s.service.send({ type: 'offer', description: { sdp: 'x' } });
    let response = await fetch(s.base + '/api/signals', { headers: headers('cliente-uno-1') });
    assert.equal(response.status, 200);
    // el primer receptor limpia lo anterior: no recibe lo que se envió antes de conectar
    assert.deepEqual(await response.json(), []);
    s.service.send({ type: 'offer', description: { sdp: 'y' } });
    response = await fetch(s.base + '/api/signals', { headers: headers('cliente-uno-1') });
    assert.equal((await response.json())[0].type, 'offer');
    response = await post(s.base, '/api/signals', { type: 'ready' }, headers('cliente-uno-1'));
    assert.equal(response.status, 200);
    response = await post(s.base, '/api/signals', { type: 'inventado' }, headers('cliente-uno-1'));
    assert.equal(response.status, 400);
    response = await post(s.base, '/api/signals', { type: 'device', width: 10, height: 10, dpr: 2 }, headers('cliente-uno-1'));
    assert.equal(response.status, 400);
    response = await post(s.base, '/api/signals', { type: 'device', width: 1180, height: 820, dpr: 2 }, headers('cliente-uno-1'));
    assert.equal(response.status, 200);
    assert.deepEqual(s.received.map(m => m.type), ['ready', 'device']);
    // un segundo iPad no puede entrar mientras el primero está activo
    response = await fetch(s.base + '/api/signals', { headers: headers('cliente-dos-2') });
    assert.equal(response.status, 409);
    // ...pero sí cuando el primero deja de responder
    time += 60000;
    response = await fetch(s.base + '/api/signals', { headers: headers('cliente-dos-2') });
    assert.equal(response.status, 200);
  } finally { s.stop(); }
});

test('la espera larga entrega el mensaje en cuanto llega', async () => {
  const s = await start();
  try {
    const headers = { Authorization: 'Bearer ' + s.service.token, 'X-Client-Id': 'cliente-largo-1' };
    await fetch(s.base + '/api/signals', { headers });
    const started = Date.now();
    const pending = fetch(s.base + '/api/signals', { headers }).then(r => r.json());
    setTimeout(() => s.service.send({ type: 'fit', value: 'cover' }), 150);
    const messages = await pending;
    assert.equal(messages[0].type, 'fit');
    assert.ok(Date.now() - started < 3000);
  } finally { s.stop(); }
});

test('eventos de conexión, despedida y rotación del código', async () => {
  const s = await start();
  try {
    const headers = { Authorization: 'Bearer ' + s.service.token, 'X-Client-Id': 'cliente-evento-1', 'Content-Type': 'application/json' };
    await fetch(s.base + '/api/signals', { headers });
    assert.deepEqual(s.events, [{ type: 'viewer', connected: true }]);
    assert.equal(s.service.viewerConnected(), true);
    await fetch(s.base + '/api/signals', { method: 'POST', headers, body: JSON.stringify({ type: 'bye' }) });
    assert.deepEqual(s.events.at(-1), { type: 'viewer', connected: false });
    const oldToken = s.service.token, oldPin = s.service.pin;
    s.service.rotate();
    assert.notEqual(s.service.token, oldToken);
    assert.notEqual(s.service.pin, oldPin);
    assert.equal((await fetch(s.base + '/api/signals', { headers })).status, 401);
  } finally { s.stop(); }
});

test('sirve la página y rechaza rutas desconocidas y otros métodos', async () => {
  const s = await start();
  try {
    const page = await fetch(s.base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(s.base + '/../server.cjs')).status, 404);
    assert.equal((await fetch(s.base + '/secreto')).status, 404);
    assert.equal((await post(s.base, '/', {})).status, 404);
    // fetch no deja cambiar la cabecera Host: se usa http.request.
    const status = await new Promise((resolve, reject) => { const request = require('node:http').request({ host: '127.0.0.1', port: s.service.server.address().port, path: '/', headers: { Host: 'evil.example.com' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end(); });
    assert.equal(status, 400);
  } finally { s.stop(); }
});
