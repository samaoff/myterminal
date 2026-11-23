const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { generateKeyPairSync } = require('node:crypto');
const { Server } = require('ssh2');
const { SftpBrowser, safeName } = require('./sftp-browser.cjs');
test('rejects unsafe and Windows reserved filenames', () => {
  for (const name of ['../x', 'a/b', 'a\\b', 'NUL.txt', 'a:b', '.', 'name.', 'file\n']) assert.throws(() => safeName(name));
  assert.equal(safeName('informe español.txt'), 'informe español.txt');
});
test('real SSH handshake verifies fingerprint, authenticates and closes cleanly', async t => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
  const clients = new Set();
  const server = new Server({ hostKeys: [key] }, client => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', ctx => ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'secret' ? ctx.accept() : ctx.reject());
    client.on('ready', () => client.on('session', accept => accept().on('sftp', acceptSftp => {
      const sftp = acceptSftp(); sftp.on('REALPATH', req => sftp.name(req, [{ filename: '/home/tester', longname: '', attrs: {} }]));
    })));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const client of clients) client.end(); server.close(); });
  let verified = false;
  const browser = new SftpBrowser({ verifyHost: (_entry, fingerprint) => { assert.match(fingerprint, /^SHA256:/); verified = true; return true; } }); t.after(() => browser.dispose());
  const entry = { host: '127.0.0.1', port: server.address().port, username: 'tester', localFolder: os.tmpdir() };
  const opened = await browser.open(entry, { password: 'secret' });
  assert.equal(verified, true); assert.equal(opened.remote, '/home/tester'); assert.equal(browser.size, 1);
  browser.close(opened.id); assert.equal(browser.size, 0);
  const rejected = new SftpBrowser({ verifyHost: () => false }); t.after(() => rejected.dispose());
  await assert.rejects(rejected.open(entry, { password: 'secret' })); assert.equal(rejected.size, 0);
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-test-')), local = path.join(root, 'local'), remote = path.join(root, 'remote'); fs.mkdirSync(local); fs.mkdirSync(remote);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const api = { lstat: fs.lstat, realpath: fs.realpath, rename: fs.rename, unlink: fs.unlink, createReadStream: fs.createReadStream, createWriteStream: fs.createWriteStream };
  const updates = [], browser = new SftpBrowser({ progress: event => updates.push(event) });
  browser.sessions.set('test', { sftp: api, local, remote, client: { destroy() {} } });
  return { local, remote, browser, updates };
}
test('transfers bytes in both directions, preserves collisions and rejects links', async t => {
  const { local, remote, browser, updates } = fixture(t), content = Buffer.alloc(300000, 37);
  fs.writeFileSync(path.join(local, 'upload.bin'), content);
  await browser.transfer('test', 'upload', 'upload.bin'); assert.deepEqual(fs.readFileSync(path.join(remote, 'upload.bin')), content);
  fs.writeFileSync(path.join(remote, 'download.bin'), content);
  await browser.transfer('test', 'download', 'download.bin'); assert.deepEqual(fs.readFileSync(path.join(local, 'download.bin')), content);
  await assert.rejects(browser.transfer('test', 'download', 'download.bin'), /ya existe/);
  fs.mkdirSync(path.join(local, 'directory')); await assert.rejects(browser.transfer('test', 'upload', 'directory'), /archivo normal/);
  assert.equal(updates.filter(event => event.done).length, 2);
  assert.equal(fs.readdirSync(local).some(name => name.endsWith('.part')), false);
});
test('cancelling transfer removes partial file and preserves source', async t => {
  const { local, remote, browser } = fixture(t);
  fs.writeFileSync(path.join(local, 'large.bin'), Buffer.alloc(1024 * 1024));
  browser.progress = () => browser.cancel('test');
  await assert.rejects(browser.transfer('test', 'upload', 'large.bin'), /abort/i);
  assert.deepEqual(fs.readdirSync(remote), []); assert.equal(fs.statSync(path.join(local, 'large.bin')).size, 1024 * 1024);
});
