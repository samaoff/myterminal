const test = require('node:test');
const assert = require('node:assert/strict');
const { describeDisplays, findAlLado, alLadoCandidates, pickDisplay } = require('./external-display.cjs');

const displays = [
  { id: 1, label: 'DELL U2723QE', bounds: { x: 0, y: 0, width: 2560, height: 1440 }, size: { width: 2560, height: 1440 }, scaleFactor: 1 },
  { id: 7, label: 'VDD by MTT', bounds: { x: 2560, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
  { id: 9, label: '', bounds: { x: 0, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1.5 }
];

test('describeDisplays marca principal, actual y virtual, y nombra las pantallas sin etiqueta', () => {
  const list = describeDisplays(displays, 1, 7);
  assert.deepEqual(list.map(d => [d.id, d.primary, d.current, d.virtual]), [[1, true, false, false], [7, false, true, true], [9, false, false, false]]);
  assert.equal(list[2].name, 'Pantalla 3');
  assert.equal(list[2].width, 1920);
  assert.equal(list[1].name, 'VDD by MTT');
});

test('findAlLado usa la ruta elegida y después las instalaciones habituales', () => {
  const env = { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
  const present = new Set(['C:\\Users\\u\\AppData\\Local\\Programs\\Al lado\\Al lado.exe']);
  assert.equal(findAlLado({ env, exists: f => present.has(f) }), 'C:\\Users\\u\\AppData\\Local\\Programs\\Al lado\\Al lado.exe');
  present.add('D:\\mia\\Al lado.exe');
  assert.equal(findAlLado({ env, savedPath: 'D:\\mia\\Al lado.exe', exists: f => present.has(f) }), 'D:\\mia\\Al lado.exe');
  assert.equal(findAlLado({ env, exists: () => false }), null);
});

test('findAlLado ignora rutas que no son ejecutables', () => {
  assert.equal(findAlLado({ env: {}, savedPath: 'D:\\mia\\notas.txt', exists: () => true }), null);
  assert.ok(alLadoCandidates({ ProgramFiles: 'C:\\Program Files' }, '').some(file => file.endsWith('Al lado.exe')));
});

test('pickDisplay solo acepta identificadores enteros de pantallas existentes', () => {
  assert.equal(pickDisplay(displays, 7).id, 7);
  assert.equal(pickDisplay(displays, 99), null);
  assert.equal(pickDisplay(displays, '7'), null);
  assert.equal(pickDisplay(displays, undefined), null);
  assert.equal(pickDisplay(displays, 7.5), null);
});
