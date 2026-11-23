const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedUrl, permissionAllowed, guardIpc } = require('./security.cjs');

const index = 'D:\\Claude\\app\\index.html';

test('solo el index.html de la aplicación es de confianza', () => {
  assert.equal(isTrustedUrl('file:///D:/Claude/app/index.html', index), true);
  assert.equal(isTrustedUrl('file:///d:/claude/app/index.html#x', index), true);
  assert.equal(isTrustedUrl('file:///D:/Claude/app/otra.html', index), false);
  assert.equal(isTrustedUrl('https://example.com/', index), false);
  assert.equal(isTrustedUrl('', index), false);
  assert.equal(isTrustedUrl(undefined, index), false);
  assert.equal(isTrustedUrl('file:///D:/Claude/app/index.html/../../secreto.html', index), false);
});

test('solo se permite el portapapeles desde la página de la aplicación', () => {
  const url = 'file:///D:/Claude/app/index.html';
  assert.equal(permissionAllowed('clipboard-read', url, index), true);
  assert.equal(permissionAllowed('clipboard-sanitized-write', url, index), true);
  assert.equal(permissionAllowed('media', url, index), false);
  assert.equal(permissionAllowed('geolocation', url, index), false);
  assert.equal(permissionAllowed('clipboard-read', 'https://example.com/', index), false);
});

test('la captura solo la puede pedir la ventana oculta de la segunda pantalla', () => {
  const host = 'D:\\Claude\\app\\second-screen\\host.html';
  assert.equal(permissionAllowed('display-capture', 'file:///D:/Claude/app/second-screen/host.html', index, host), true);
  assert.equal(permissionAllowed('display-capture', 'file:///D:/Claude/app/index.html', index, host), false);
  assert.equal(permissionAllowed('display-capture', 'file:///D:/Claude/app/second-screen/host.html', index), false);
  assert.equal(permissionAllowed('geolocation', 'file:///D:/Claude/app/second-screen/host.html', index, host), false);
});

test('un canal con página propia solo acepta esa página', () => {
  const handlers = new Map();
  const ipcMain = { handle: (c, f) => handlers.set(c, f), on: (c, f) => handlers.set(c, f) };
  guardIpc(ipcMain, index, { 'ss-host-event': 'D:\\Claude\\app\\second-screen\\host.html' });
  ipcMain.on('ss-host-event', () => {});
  ipcMain.handle('otro', () => 'ok');
  const host = { senderFrame: { url: 'file:///D:/Claude/app/second-screen/host.html' } }, main = { senderFrame: { url: 'file:///D:/Claude/app/index.html' } };
  const a = { ...main }; handlers.get('ss-host-event')(a); assert.equal(a.returnValue, null);
  const b = { ...host }; handlers.get('ss-host-event')(b); assert.equal(b.returnValue, undefined);
  assert.throws(() => handlers.get('otro')(host), /Origen no autorizado/);
  assert.equal(handlers.get('otro')(main), 'ok');
});

test('guardIpc rechaza orígenes ajenos y deja pasar la aplicación', async () => {
  const handlers = new Map(), listeners = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn), on: (channel, fn) => listeners.set(channel, fn) };
  guardIpc(ipcMain, index);
  let called = 0;
  ipcMain.handle('uno', () => { called++; return 'ok'; });
  ipcMain.on('dos', () => { called++; });
  const good = { senderFrame: { url: 'file:///D:/Claude/app/index.html' } };
  const bad = { senderFrame: { url: 'https://example.com/' } };
  assert.equal(await handlers.get('uno')(good), 'ok');
  assert.throws(() => handlers.get('uno')(bad), /Origen no autorizado/);
  listeners.get('dos')(good);
  const sync = { ...bad };
  listeners.get('dos')(sync);
  assert.equal(sync.returnValue, null);
  assert.equal(called, 2);
});
