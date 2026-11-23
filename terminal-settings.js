const terminalDefaults = Object.freeze({ fontSize: 14, fontFamily: 'cascadia', fontWeight: '400', lineHeight: 1.2, letterSpacing: 0, cursorStyle: 'block', cursorBlink: true, customColors: false, colors: {} });
const terminalFonts = {
  'jetbrains': '"JetBrains Mono", Consolas, monospace',
  'fira': '"Fira Code", Consolas, monospace',
  'source-code': '"Source Code Pro", Consolas, monospace',
  'atkinson': '"Atkinson Hyperlegible Mono", Consolas, monospace',
  cascadia: '"Cascadia Code", Consolas, monospace',
  'cascadia-mono': '"Cascadia Mono", Consolas, monospace',
  consolas: 'Consolas, "Lucida Console", monospace',
  courier: '"Courier New", monospace',
  lucida: '"Lucida Console", Consolas, monospace',
  system: 'monospace'
};
function sanitizeTerminalSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const clean = { ...terminalDefaults, colors: {} };
  for (const [key, min, max] of [['fontSize', 10, 32], ['lineHeight', 1, 1.8], ['letterSpacing', 0, 3]]) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) clean[key] = Math.min(max, Math.max(min, source[key]));
  }
  clean.fontSize = Math.round(clean.fontSize);
  if (Object.hasOwn(terminalFonts, source.fontFamily)) clean.fontFamily = source.fontFamily;
  if (['400', '500', '600', '700'].includes(source.fontWeight)) clean.fontWeight = source.fontWeight;
  if (['block', 'bar', 'underline'].includes(source.cursorStyle)) clean.cursorStyle = source.cursorStyle;
  for (const key of ['cursorBlink', 'customColors']) if (typeof source[key] === 'boolean') clean[key] = source[key];
  for (const key of ['background', 'foreground', 'cursor', 'selectionBackground', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan']) {
    if (typeof source.colors?.[key] === 'string' && /^#[0-9a-f]{6}$/i.test(source.colors[key])) clean.colors[key] = source.colors[key];
  }
  return clean;
}
let terminalPreferences = sanitizeTerminalSettings(null);
try { terminalPreferences = sanitizeTerminalSettings(window.desktop.initialPreferences.terminal || JSON.parse(uiStorage.getItem('samaapp.terminal'))); } catch {}
function terminalOptions() {
  return { allowTransparency: true, fontFamily: terminalFonts[terminalPreferences.fontFamily], fontSize: terminalPreferences.fontSize, fontWeight: terminalPreferences.fontWeight, lineHeight: terminalPreferences.lineHeight, letterSpacing: terminalPreferences.letterSpacing, cursorStyle: terminalPreferences.cursorStyle, cursorBlink: terminalPreferences.cursorBlink, scrollback: 10000, minimumContrastRatio: terminalContrast(), theme: terminalTheme() };
}
function saveTerminalPreferences() {
  try { uiStorage.setItem('samaapp.terminal', JSON.stringify(terminalPreferences)); } catch {}
  window.desktop.savePreferences({terminal:terminalPreferences}).catch(() => status('No se pudieron guardar los ajustes de consola.'));
}
function applyConsoleFontVariable() { document.documentElement.style.setProperty('--console-font', terminalFonts[terminalPreferences.fontFamily]); }
applyConsoleFontVariable();
function applyTerminalPreferences() {
  applyConsoleFontVariable();
  const options = terminalOptions();
  for (const session of sessions.values()) {
    if (!session.term) continue;
    for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'cursorStyle', 'cursorBlink', 'theme']) session.term.options[key] = options[key];
  }
  syncTerminalSettings();
  scheduleTerminalFit();
  if (document.fonts?.ready) document.fonts.ready.then(() => { scheduleTerminalFit(); });
}
function changeTerminalPreference(key, value) {
  terminalPreferences = sanitizeTerminalSettings({ ...terminalPreferences, [key]: value });
  saveTerminalPreferences(); applyTerminalPreferences();
}
function changeTerminalFontSize(delta) { changeTerminalPreference('fontSize', terminalPreferences.fontSize + delta); }
function syncTerminalSettings() {
  const prefs = terminalPreferences;
  for (const [key, id] of Object.entries({ fontSize: 'console-size', fontFamily: 'console-font', fontWeight: 'console-weight', lineHeight: 'console-line-height', letterSpacing: 'console-letter-spacing', cursorStyle: 'console-cursor' })) document.getElementById(id).value = prefs[key];
  document.getElementById('console-size-value').textContent = prefs.fontSize + ' px';
  document.getElementById('console-line-height-value').textContent = prefs.lineHeight.toFixed(1);
  document.getElementById('console-letter-spacing-value').textContent = prefs.letterSpacing + ' px';
  document.getElementById('console-blink').checked = prefs.cursorBlink;
  document.getElementById('console-custom-colors').checked = prefs.customColors;
  document.getElementById('console-color-fields').disabled = !prefs.customColors;
  const palette = terminalTheme();
  for (const input of document.querySelectorAll('[data-console-color]')) {
    const value = palette[input.dataset.consoleColor];
    // The transparent Mac background uses the theme's opaque base as its editable swatch.
    input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : appThemes[selectedTheme][1];
  }
  document.getElementById('settings-theme').value = selectedTheme;
  const preview = document.getElementById('console-preview');
  preview.style.fontFamily = terminalFonts[prefs.fontFamily]; preview.style.fontSize = prefs.fontSize + 'px';
  preview.style.fontWeight = prefs.fontWeight; preview.style.lineHeight = prefs.lineHeight;
  preview.style.letterSpacing = prefs.letterSpacing + 'px';
  preview.style.background = palette.background === '#00000000' ? appThemes[selectedTheme][1] : palette.background;
  preview.style.color = palette.foreground;
  preview.querySelector('.preview-accent').style.color = palette.green;
  const cursor = preview.querySelector('.preview-cursor');
  cursor.dataset.style = prefs.cursorStyle; cursor.style.setProperty('--preview-cursor', palette.cursor);
  cursor.classList.toggle('blinking', prefs.cursorBlink);
}
let settingsReturnFocus;
function openConsoleSettings() {
  settingsReturnFocus = document.activeElement;
  syncTerminalSettings();
  if (!document.getElementById('console-settings').open) document.getElementById('console-settings').showModal();
}
function closeConsoleSettings() { document.getElementById('console-settings').close(); }
document.getElementById('console-settings').addEventListener('close', () => {
  if (settingsReturnFocus?.isConnected) settingsReturnFocus.focus();
});
for (const [key, id, numeric] of [['fontSize', 'console-size', true], ['fontFamily', 'console-font'], ['fontWeight', 'console-weight'], ['lineHeight', 'console-line-height', true], ['letterSpacing', 'console-letter-spacing', true], ['cursorStyle', 'console-cursor']]) {
  document.getElementById(id).addEventListener('input', event => changeTerminalPreference(key, numeric ? Number(event.target.value) : event.target.value));
}
document.getElementById('console-blink').onchange = event => changeTerminalPreference('cursorBlink', event.target.checked);
document.getElementById('console-custom-colors').onchange = event => {
  if (event.target.checked && !Object.keys(terminalPreferences.colors).length) {
    const palette = terminalTheme(), colors = {};
    for (const input of document.querySelectorAll('[data-console-color]')) colors[input.dataset.consoleColor] = /^#[0-9a-f]{6}$/i.test(palette[input.dataset.consoleColor]) ? palette[input.dataset.consoleColor] : appThemes[selectedTheme][1];
    terminalPreferences.colors = colors;
  }
  changeTerminalPreference('customColors', event.target.checked);
};
for (const input of document.querySelectorAll('[data-console-color]')) input.addEventListener('input', () => {
  terminalPreferences = sanitizeTerminalSettings({ ...terminalPreferences, colors: { ...terminalPreferences.colors, [input.dataset.consoleColor]: input.value } });
  saveTerminalPreferences(); applyTerminalPreferences();
});
document.getElementById('console-colors-reset').onclick = () => { terminalPreferences.colors = {}; changeTerminalPreference('customColors', false); };
document.getElementById('console-reset').onclick = () => { terminalPreferences = sanitizeTerminalSettings(null); saveTerminalPreferences(); applyTerminalPreferences(); };
document.getElementById('console-smaller').onclick = () => changeTerminalFontSize(-1);
document.getElementById('console-larger').onclick = () => changeTerminalFontSize(1);
document.getElementById('console-settings-close').onclick = closeConsoleSettings;
document.getElementById('console-customize').onclick = openConsoleSettings;
document.getElementById('settings-theme').onchange = event => applyTheme(event.target.value);
for (const [id, palette] of Object.entries(appThemes)) { const option = document.createElement('option'); option.value = id; option.textContent = palette[0]; document.getElementById('settings-theme').append(option); }
document.addEventListener('keydown', event => {
  if (!event.ctrlKey || event.altKey || event.metaKey) return;
  const delta = ['Equal', 'NumpadAdd'].includes(event.code) ? 1 : ['Minus', 'NumpadSubtract'].includes(event.code) ? -1 : 0;
  const reset = ['Digit0', 'Numpad0'].includes(event.code);
  if (!delta && !reset) return;
  event.preventDefault(); event.stopPropagation();
  if (reset) changeTerminalPreference('fontSize', terminalDefaults.fontSize); else changeTerminalFontSize(delta);
}, true);

const openingSizeControl = document.getElementById('opening-size');
openingSizeControl.value = ['large', 'small'].includes(window.desktop.initialPreferences.openingSize) ? window.desktop.initialPreferences.openingSize : 'maximized';
openingSizeControl.onchange = async () => {
  try { if (!await window.desktop.savePreferences({ openingSize: openingSizeControl.value })) throw new Error(); }
  catch { status('No se pudo guardar el tamaño de apertura.'); }
};
