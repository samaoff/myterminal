const $ = selector => document.querySelector(selector);
const sessions = new Map();
const pending = new Map();
let savedTheme;
try { savedTheme = window.desktop.initialPreferences.theme || uiStorage.getItem('samapp.theme'); } catch {}
applyTheme(savedTheme);
let folder = null;
let active = null;
const names = { codex: 'Codex', claude: 'Claude Code', powershell: 'PowerShell' };
function status(message) { $('#status').textContent = message; $('#status').title = message; }
function chooseFolder(value) {
  folder = value;
  $('#current').textContent = value.split(/[\\/]/).filter(Boolean).pop();
  $('#current').title = value;
  $('#path').textContent = value;
  document.querySelectorAll('[data-kind],[data-profile]').forEach(button => button.disabled = false);
  status('Proyecto preparado · Elige un terminal');
  window.desktop.rememberProject(value).catch(error => status(error.message));
  refreshProjects().catch(error => status(error.message));
  if (typeof refreshPanel === 'function') refreshPanel();
}
async function refreshProjects() {
  $('#recent').replaceChildren();
  for (const value of await window.desktop.projects()) {
    if (value === folder) continue;
    const button = document.createElement('button');
    button.className = 'recent'; button.textContent = '▸ ' + value.split(/[\\/]/).filter(Boolean).pop(); button.title = value;
    button.onclick = () => chooseFolder(value);
    const row = document.createElement('div'); row.className='recent-row'; row.append(button);
    const remove = document.createElement('button');
    remove.className = 'project-icon recent-remove'; remove.textContent = '×';
    remove.title = 'Quitar de recientes'; remove.setAttribute('aria-label', 'Quitar de recientes · ' + value);
    remove.onclick = async () => {
      remove.disabled = true;
      try { await window.desktop.forgetProject(value); await refreshProjects(); status('Proyecto quitado de recientes. Los archivos se conservan.'); }
      catch (error) { remove.disabled = false; status(error.message); }
    };
    row.append(remove);
    $('#recent').append(row);
  }
  if (!$('#recent').children.length) {
    const empty = document.createElement('p'); empty.className = 'recent-empty';
    empty.textContent = folder ? 'Aquí aparecerán tus otros proyectos recientes.' : 'Los proyectos que abras aparecerán aquí.'; $('#recent').append(empty);
  }
}
async function pick() { try { const value = await window.desktop.pickFolder(); if (value) { chooseFolder(value); await refreshProjects(); } } catch (error) { status(error.message); } }
function activate(id) {
  active = id;
  for (const [key, session] of sessions) { session.pane.hidden = key !== id; session.tab.classList.toggle('active', key === id); }
  const session = sessions.get(id);
  if (typeof syncRemoteDesktopLayout === 'function') syncRemoteDesktopLayout(session?.kind === 'rdp');
  if (typeof refreshUsage === 'function') refreshUsage();
  if (session && !session.remote && folder !== session.folder) chooseFolder(session.folder);
  if (session) {
    $('#path').textContent = session.remote ? remoteSessionLocation(session.remote) : session.folder;
    document.querySelector('.header-actions .badge').textContent = session.kind === 'rdp' ? '● Escritorio remoto' : session.remote ? '● ' + session.remote.protocol.toUpperCase() + ' remoto' : '● Terminal local';
  }
  if (session) requestAnimationFrame(() => {
    if (active !== id || !sessions.has(id)) return;
    if (session.kind === 'rdp') {
      $('#path').textContent=remoteSessionLocation(session.remote);
      document.querySelector('.header-actions .badge').textContent='● Escritorio remoto';
      status(session.name+' · escritorio remoto en esta pestaña');return;
    }
    if (!session.term) { status(session.name); return; }
    fitSession(session); session.term.focus();
    const location = session.remote ? remoteSessionLocation(session.remote) : session.folder;
    $('#path').textContent = location;
    document.querySelector('.header-actions .badge').textContent = session.remote ? '● ' + session.remote.protocol.toUpperCase() + ' remoto' : '● Terminal local';
    status(session.ended ? 'Sesión finalizada' : `${session.name} · ${location}`);
  });
}
function remoteSessionLocation(remote) { return (remote.username ? remote.username + '@' : '') + (remote.host.includes(':') ? '[' + remote.host + ']' : remote.host) + ':' + remote.port; }
async function close(id) {
  const session = sessions.get(id); if (!session) return;
  if (session.closing) return;
  session.closing = true;
  try { if (!await (session.kind === 'sftp-browser' ? window.desktop.sftpClose(id) : window.desktop.close(id))) return; session.term?.dispose(); session.tab.remove(); session.pane.remove(); sessions.delete(id); }
  catch (error) { status(error.message); return; }
  finally { session.closing = false; }
  if (active === id) { const next = [...sessions.keys()].pop(); if (next) activate(next); else { active = null; $('#welcome').hidden = false; $('#welcome').style.display = ''; $('#path').textContent = folder || 'Abre un proyecto para empezar'; document.querySelector('.header-actions .badge').textContent = '● Terminal local'; status('Sesiones cerradas'); if (typeof refreshUsage === 'function') refreshUsage(); } }
}
window.desktop.onData(({ id, data }) => { const session = sessions.get(id); if (session) session.term.write(data, () => window.desktop.consumed(id, data.length)); else { pending.set(id, (pending.get(id) || '') + data); } });
window.desktop.onExit(({ id, exitCode }) => { const session = sessions.get(id); if (session) { session.ended = true; session.term.write(`\r\n\x1b[90m[Proceso finalizado: ${exitCode}]\x1b[0m\r\n`); if (active === id) { status('Sesión finalizada'); if (typeof refreshUsage === 'function') refreshUsage(); } } });
async function launch(kind, remoteId = null) {
  if (!remoteId && !folder) { await pick(); if (!folder) return; }
  try {
    const created = await window.desktop.create({ folder, kind, remoteId });
    const project = created.folder || folder;
    const { id } = created;
    const sessionName = created.name || names[kind] || 'Terminal';
    const sessionKind = created.kind || kind;
    const pane = document.createElement('div'); pane.className = 'terminal-pane'; $('#workspace').append(pane);
    const term = new Terminal({ ...terminalOptions(), allowProposedApi: true });
    const fit = new FitAddon.FitAddon(); term.loadAddon(fit); term.open(pane);
    const search = attachTerminalSearch(term, pane);
    const tab = document.createElement('button'); tab.className = 'tab';
    const label = document.createElement('span'); label.textContent = `${sessionName} · ${created.remote ? created.remote.protocol.toUpperCase() : project.split(/[\\/]/).pop()}`; tab.append(terminalIcon(created.icon || kind), label);
    tab.title = created.remote ? remoteSessionLocation(created.remote) : project;
    const cross = document.createElement('span'); cross.className = 'close'; cross.textContent = '×'; cross.title = 'Cerrar sesión'; cross.onclick = event => { event.stopPropagation(); close(id); }; tab.append(cross);
    tab.onclick = () => activate(id); $('#tabs').append(tab);
    sessions.set(id, { term, fit, search, pane, tab, folder: project, name: sessionName, kind: sessionKind, profileId: created.profileId || kind, remote:created.remote || null });
    term.onData(data => window.desktop.write(id, data)); term.onResize(({ cols, rows }) => window.desktop.resize(id, cols, rows));
    term.attachCustomKeyEventHandler(event => {
      if (event.ctrlKey && !event.altKey && event.code === 'KeyF') {
        if (event.type === 'keydown') { event.preventDefault(); search.open(); }
        return false;
      }
      if (event.type !== 'keydown' || !event.ctrlKey || !event.shiftKey) return true;
      if (event.code === 'KeyC') { navigator.clipboard.writeText(term.getSelection()).catch(error => status(error.message)); return false; }
      if (event.code === 'KeyV') { navigator.clipboard.readText().then(text => term.paste(text)).catch(error => status(error.message)); return false; }
      return true;
    });
    if (created.remote?.protocol === 'sftp') term.writeln('SFTP · Local: ' + project + '\r\nComandos: ls · cd · get archivo · put archivo · lcd carpeta · help · bye\r\n');
    if (pending.has(id)) { const buffered = pending.get(id); term.write(buffered, () => window.desktop.consumed(id, buffered.length)); pending.delete(id); }
    $('#welcome').style.display = 'none'; activate(id);
  } catch (error) { status('No se pudo iniciar: ' + error.message); }
}
$('#folder').onclick = pick; $('#welcome-open').onclick = pick;
document.querySelectorAll('[data-kind]').forEach(button => { button.prepend(terminalIcon(button.dataset.kind)); button.disabled = true; button.onclick = () => launch(button.dataset.kind); });
let terminalFitFrame = null;
// FitAddon mide el panel entero y no descuenta su relleno (la cabecera del panel usa padding-top), así que el
// terminal quedaba más alto y ancho que el hueco y la cuota tapaba la última fila. Se calcula sobre el hueco real.
function terminalTargetSize(session) {
  const { term, fit, pane } = session;
  if (!term || !fit || !pane) return null;
  const cell = term._core?._renderService?.dimensions?.css?.cell;
  if (!cell?.width || !cell?.height) return fit.proposeDimensions() || null;
  const style = getComputedStyle(pane);
  const padV = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const padH = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const viewport = pane.querySelector('.xterm-viewport');
  const scrollbar = viewport ? Math.max(0, viewport.offsetWidth - viewport.clientWidth) : 0;
  const cols = Math.max(2, Math.floor((pane.clientWidth - padH - scrollbar) / cell.width));
  const rows = Math.max(1, Math.floor((pane.clientHeight - padV) / cell.height));
  return { cols, rows };
}
function fitSession(session) {
  const size = terminalTargetSize(session);
  if (size && (session.term.cols !== size.cols || session.term.rows !== size.rows)) session.term.resize(size.cols, size.rows);
}
function scheduleTerminalFit() {
  if (terminalFitFrame !== null) return;
  terminalFitFrame = requestAnimationFrame(() => {
    terminalFitFrame = null;
    for (const session of sessions.values()) {
      if (session.pane.hidden || !session.pane.clientWidth || !session.pane.clientHeight) continue;
      if (session.kind === 'rdp') { if (typeof syncRemoteDesktopLayout === 'function') syncRemoteDesktopLayout(); continue; }
      fitSession(session);
    }
  });
}
new ResizeObserver(scheduleTerminalFit).observe($('#workspace'));
window.addEventListener('resize', scheduleTerminalFit);
refreshProjects().catch(error => status(error.message));

$('#project-tree').onclick=()=>{if(folder)showPanel('files');else status('Abre un proyecto primero.');};
$('#project-open').onclick=async()=>{try{if(folder)await window.desktop.openProject(folder);else status('Abre un proyecto primero.');}catch(error){status(error.message);}};
