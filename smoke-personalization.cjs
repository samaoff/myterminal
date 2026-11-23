const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const applicationArgument = process.argv.slice(2).find(value => !value.startsWith('--'));
const applicationRoot = applicationArgument ? path.resolve(applicationArgument) : __dirname;
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-personalization-'));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
dialog.showMessageBox = async () => ({ response: 1 });
require(path.join(applicationRoot, 'main'));
app.whenReady().then(async () => {
 let win, saved;
 const assert = (condition, message) => { if (!condition) throw new Error(message); };
 const js = code => win.webContents.executeJavaScript(code);
 try {
  win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false);
  const errors = []; win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  saved = await js("({prefs:localStorage.getItem('samaapp.terminal'),theme:localStorage.getItem('samapp.theme'),sidebar:localStorage.getItem('samaapp.sidebar')})");
  await js("terminalPreferences=sanitizeTerminalSettings(null);applyTheme('mac-glass');sidebarState.compact=false;renderSidebar();pick()");
  await js("launch('powershell')");
  await js("launch('powershell')");
  assert(await js("sessions.size===2&&[...sessions.values()].every(s=>s.term.options.allowTransparency&&s.term.options.theme.background.endsWith('00')&&s.term.options.theme.background.length===9)"), 'Mac theme transparency');
  await js("document.querySelector('#console-customize').click()");
  assert(await js("document.querySelector('#console-settings').open"), 'Settings button');
  await js("document.querySelector('#console-larger').click();document.querySelector('#console-larger').click()");
  assert(await js("[...sessions.values()].every(s=>s.term.options.fontSize===16)"), 'Existing sessions font update');
  const change = (id, value, event = 'input') => js(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)}));})()`);
  assert(win.isMaximized(), 'Maximized startup');
  for (const font of ['jetbrains', 'fira', 'source-code', 'atkinson']) {
   await change('console-font', font);
   assert(await js("document.fonts.load('14px '+terminalFonts[terminalPreferences.fontFamily].split(',')[0]).then(fonts=>fonts.length>0)"), 'Bundled font loads: ' + font);
  }
  await change('opening-size', 'small', 'change');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert(!win.isMaximized() && win.getBounds().width <= 1000, 'Small opening size');
  await change('opening-size', 'large', 'change');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert(!win.isMaximized(), 'Large opening size');
  await change('opening-size', 'maximized', 'change');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert(win.isMaximized(), 'Maximized opening size');
  await change('console-font', 'consolas'); await change('console-weight', '600');
  await change('console-line-height', '1.5'); await change('console-letter-spacing', '1.25'); await change('console-cursor', 'bar');
  await js("document.querySelector('#console-blink').click();document.querySelector('#console-custom-colors').click()");
  for (const [key, value] of [['background', '#152238'], ['foreground', '#e3eefc'], ['green', '#4edba9']]) await js(`(()=>{const el=document.querySelector('[data-console-color=${key}]');el.value='${value}';el.dispatchEvent(new Event('input'));})()`);
  assert(await js("[...sessions.values()].every(s=>s.term.options.fontFamily.startsWith('Consolas')&&s.term.options.fontWeight==='600'&&s.term.options.lineHeight===1.5&&s.term.options.letterSpacing===1.25&&s.term.options.cursorStyle==='bar'&&!s.term.options.cursorBlink&&s.term.options.theme.foreground==='#e3eefc'&&s.term.options.theme.brightGreen==='#4edba9')"), 'Typography and colors');
  await change('settings-theme', 'nord', 'change');
  assert(await js("sessions.get(active).term.options.theme.background==='#152238'"), 'Custom colors retained across themes');
  await js("document.querySelector('#console-colors-reset').click()");
  assert(await js("!terminalPreferences.customColors&&sessions.get(active).term.options.theme.background===appThemes.nord[1]"), 'Theme colors reset');
  await change('settings-theme', 'mac-glass', 'change');
  await js("closeConsoleSettings();launch('powershell')");
  assert(await js("sessions.size===3&&sessions.get(active).term.options.fontSize===16&&sessions.get(active).term.options.lineHeight===1.5"), 'New sessions inherit preferences');
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true,code:'Equal',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true,code:'Minus',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true,code:'Digit0',bubbles:true}))");
  assert(await js('terminalPreferences.fontSize===14'), 'Keyboard size shortcuts');
  await js("changeTerminalPreference('fontSize',999);changeTerminalPreference('lineHeight',-2)");
  assert(await js('terminalPreferences.fontSize===32&&terminalPreferences.lineHeight===1'), 'Safe size boundaries');
  await js("changeTerminalPreference('fontSize',20);changeTerminalPreference('lineHeight',1.3);showPanel('skills')");
  for (const compact of [false, true]) {
   await js(`sidebarState.compact=${compact};renderSidebar()`);
   await new Promise(resolve => setTimeout(resolve, 160));
   assert(await js("(()=>{const s=sessions.get(active),w=document.querySelector('#workspace').getBoundingClientRect();return s.term.cols===terminalTargetSize(s).cols&&s.pane.querySelector('.xterm-screen').getBoundingClientRect().right<=w.right+1&&document.documentElement.scrollWidth<=innerWidth;})()"), 'Personalization layout overflow');
  }
  await js("sidebarState.compact=false;renderSidebar();changeTerminalPreference('fontSize',15);changeTerminalPreference('lineHeight',1.3);changeTerminalPreference('fontWeight','400');changeTerminalPreference('letterSpacing',0);new Promise(resolve=>sessions.get(active).term.write('\\r\\n\\x1b[32msamaapp\\x1b[0m · MyTerminal\\r\\nTu espacio, a tu manera.\\r\\n',resolve))");
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync('preview-mac-cristal.png', (await win.webContents.capturePage()).toPNG());
  await js('openConsoleSettings()');
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync('preview-console-settings.png', (await win.webContents.capturePage()).toPNG());
  await js('closeConsoleSettings()');
  const wanted = await js('JSON.stringify(terminalPreferences)');
  for (const id of await js('[...sessions.keys()]')) await js(`close(${JSON.stringify(id)})`);
  win.webContents.reload(); await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  assert(await js('JSON.stringify(terminalPreferences)') === wanted, 'Persisted preferences');
  assert(await js("selectedTheme==='mac-glass'"), 'Persisted theme');
  await js("openConsoleSettings();document.querySelector('#console-reset').click()");
  assert(await js("terminalPreferences.fontSize===14&&terminalPreferences.fontFamily==='cascadia'&&!terminalPreferences.customColors&&selectedTheme==='mac-glass'"), 'Full reset keeps app theme');
  await js("closeConsoleSettings();sidebarState.compact=true;renderSidebar();document.querySelector('#appearance-icon').click()");
  assert(await js("document.querySelector('#console-settings').open"), 'Compact appearance access');
  assert(errors.length === 0, errors.join('\n'));
  fs.writeFileSync('smoke-personalization-result.json', JSON.stringify({ passed: true, applicationRoot, checks: ['Mac glass transparency', 'settings access', 'live typography across sessions', 'font/color/cursor controls', 'custom colors across themes', 'theme color reset', 'new session defaults', 'keyboard zoom', 'size boundaries', 'sidebar and panel resizing', 'preferences after reload', 'full reset', 'compact settings access'] }, null, 2));
  await restore(); app.exit(0);
 } catch (error) { fs.writeFileSync('smoke-personalization-result.json', JSON.stringify({ passed: false, error: String(error) }, null, 2)); await restore().catch(() => {}); app.exit(1); }
 async function restore() {
  if (!saved || !win || win.isDestroyed()) return;
  for (const [key, value] of [['samaapp.terminal', saved.prefs], ['samapp.theme', saved.theme], ['samaapp.sidebar', saved.sidebar]]) await js(value === null ? `localStorage.removeItem(${JSON.stringify(key)})` : `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(value)})`);
 }
});
app.on('will-quit', () => { if (path.dirname(fixture) === os.tmpdir()) fs.rmSync(fixture, { recursive: true, force: true }); });
