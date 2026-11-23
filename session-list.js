// Barra lateral centrada en las sesiones (todos los diseños):
// - arriba, «Nueva sesión» abre un menú con el proyecto, los recientes, los terminales y las conexiones guardadas;
// - en medio, las sesiones abiertas agrupadas por proyecto, con su estado (de shell-status.js), búsqueda y filtros;
// - abajo, las herramientas en una fila de iconos.
(() => {
  const sidebar = document.getElementById('sidebar');
  const scroll = sidebar?.querySelector('.sidebar-scroll');
  if (!sidebar || !scroll) return;
  const labels = { work: 'Trabajando', wait: 'Esperando tu respuesta', done: 'Terminado', error: 'Terminó con error', idle: 'Sin actividad' };
  const since = new Map();
  let filter = 'all';
  let query = '';
  let lastKey = '';
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
  const icon = kind => { const svg = terminalIcon(kind); svg.classList.add('ic'); svg.setAttribute('aria-hidden', 'true'); return svg; };

  // ── Cabecera: «Nueva sesión» y búsqueda ──
  const head = el('div', 'ns-head');
  const newButton = el('button', 'ns-new');
  newButton.type = 'button'; newButton.id = 'new-session';
  newButton.title = 'Nueva sesión'; newButton.setAttribute('aria-haspopup', 'true'); newButton.setAttribute('aria-expanded', 'false');
  newButton.append(icon('plus'), el('span', 'ns-new-label', 'Nueva sesión'), icon('chevron'));
  const search = el('label', 'ns-search');
  const searchInput = el('input');
  searchInput.type = 'search'; searchInput.placeholder = 'Buscar sesiones'; searchInput.setAttribute('aria-label', 'Buscar sesiones');
  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); lastKey = ''; paint(); });
  search.append(icon('search'), searchInput);
  head.append(newButton, search);
  const folderButton = document.getElementById('folder');
  if (folderButton) folderButton.before(head); else scroll.prepend(head);

  // ── Menú «Nueva sesión»: reúne lo que antes ocupaba la barra ──
  const menu = el('div', 'ns-menu');
  menu.id = 'new-session-menu'; menu.hidden = true;
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Nueva sesión');
  newButton.setAttribute('aria-controls', menu.id);
  const block = (title, ...nodes) => { const box = el('div', 'ns-block'); box.append(el('div', 'ns-block-title', title), ...nodes.filter(Boolean)); return box; };
  const connectionTool = document.querySelector('[data-panel="connections"]');
  const remoteGroup = document.querySelector('#sidebar .sidebar-group');
  if (connectionTool) document.querySelector('#fixed-tools .tool-buttons')?.append(connectionTool);
  remoteGroup?.querySelector('.fixed-tools-title')?.remove();
  menu.append(
    block('Proyecto', folderButton, document.querySelector('#sidebar .sidebar-section[data-section="recent"]')),
    block('Abrir con', document.querySelector('#sidebar .sidebar-section[data-section="sessions"]')),
    remoteGroup ? block('Conexiones guardadas', remoteGroup) : null
  );
  sidebar.append(menu);

  function place() {
    const r = newButton.getBoundingClientRect();
    const compact = sidebar.classList.contains('compact');
    menu.style.left = (compact ? r.right + 8 : r.left) + 'px';
    menu.style.top = (compact ? r.top : r.bottom + 6) + 'px';
    menu.style.maxHeight = Math.max(240, window.innerHeight - (compact ? r.top : r.bottom + 6) - 16) + 'px';
  }
  function openMenu(open) {
    menu.hidden = !open;
    newButton.setAttribute('aria-expanded', String(open));
    if (open) { place(); (menu.querySelector('.launch') || menu.querySelector('button'))?.focus(); }
  }
  newButton.addEventListener('click', () => openMenu(menu.hidden));
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { openMenu(false); newButton.focus(); } });
  document.addEventListener('mousedown', event => { if (!menu.hidden && !menu.contains(event.target) && !newButton.contains(event.target)) openMenu(false); });
  // Lanzar algo cierra el menú; elegir proyecto o plegar una sección lo deja abierto para elegir con qué abrirlo.
  menu.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.closest('.section-toggle') || button.closest('[data-section="recent"]') || button.id === 'add-terminal') return;
    setTimeout(() => openMenu(false));
  });
  window.addEventListener('resize', () => { if (!menu.hidden) place(); });

  // ── Lista de sesiones ──
  const host = el('section');
  host.id = 'open-sessions'; host.setAttribute('aria-label', 'Sesiones abiertas');
  const filters = el('div', 'os-filters');
  filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Filtrar sesiones');
  const list = el('div', 'os-list');
  host.append(filters, list);
  head.after(host);

  const filterButtons = [['all', 'Todas'], ['wait', 'Esperando'], ['work', 'Trabajando']].map(([value, text]) => {
    const button = el('button', 'os-pill');
    button.type = 'button'; button.dataset.filter = value;
    button.addEventListener('click', () => { filter = value; lastKey = ''; paint(); });
    if (value !== 'all') { const dot = el('span', 'tab-dot'); dot.dataset.state = value; button.append(dot); }
    button.append(el('span', null, text), el('span', 'os-count'));
    filters.append(button);
    return button;
  });

  const base = value => String(value || '').split(/[\\/]/).filter(Boolean).pop() || 'Sin carpeta';
  const ago = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };

  function collect() {
    const now = Date.now();
    const rows = [];
    for (const [id, session] of sessions) {
      if (!session.tab) continue;
      const state = session.tab.querySelector(':scope > .tab-dot')?.dataset.state || 'idle';
      const prev = since.get(id);
      if (!prev || prev.state !== state) since.set(id, { state, at: now });
      const name = session.tab.querySelector(':scope > span:not(.tab-dot):not(.close)')?.textContent || session.name || 'Terminal';
      const kind = String(session.kind || 'shell').toLowerCase();
      const group = session.remote ? (session.remote.host || 'Remoto') : base(session.folder);
      rows.push({ id, state, name, kind, group, time: ago(now - since.get(id).at), active: session.tab.classList.contains('active') });
    }
    for (const id of since.keys()) if (!sessions.has(id)) since.delete(id);
    return rows;
  }

  function item(row) {
    const button = el('button', 'os-item' + (row.active ? ' active' : ''));
    button.type = 'button';
    button.title = row.name + ' · ' + labels[row.state];
    button.addEventListener('click', () => activate(row.id));
    const known = ['claude', 'codex', 'powershell', 'ssh', 'sftp', 'rdp'].find(kind => row.kind.includes(kind));
    const badge = el('span', 'os-badge');
    badge.dataset.kind = known || 'shell';
    badge.append(icon(known || 'terminal'));
    const text = el('span', 'os-text');
    const top = el('span', 'os-top');
    top.append(el('span', 'os-title', row.name), el('span', 'os-time', row.time));
    const sub = el('span', 'os-sub', labels[row.state]);
    sub.dataset.state = row.state;
    text.append(top, sub);
    button.append(badge, text);
    return button;
  }

  function paint() {
    if (typeof sessions === 'undefined') return;
    const rows = collect();
    const key = filter + '|' + query + '|' + rows.map(r => [r.id, r.state, r.name, r.group, r.time, r.active].join(':')).join('|');
    if (key === lastKey) return;
    lastKey = key;
    const counts = { all: rows.length, wait: rows.filter(r => r.state === 'wait').length, work: rows.filter(r => r.state === 'work').length };
    for (const button of filterButtons) {
      const value = button.dataset.filter;
      button.classList.toggle('on', value === filter);
      button.setAttribute('aria-pressed', String(value === filter));
      button.querySelector('.os-count').textContent = counts[value] ? String(counts[value]) : '';
    }
    const visible = rows.filter(r => (filter === 'all' || r.state === filter) && (!query || (r.name + ' ' + r.group).toLowerCase().includes(query)));
    const groups = new Map();
    for (const row of visible) { if (!groups.has(row.group)) groups.set(row.group, []); groups.get(row.group).push(row); }
    const nodes = [];
    for (const [name, items] of groups) nodes.push(el('div', 'os-group', name), ...items.map(item));
    if (!nodes.length) nodes.push(el('p', 'os-empty', rows.length ? 'Ninguna sesión coincide.' : 'Pulsa «Nueva sesión» para abrir Claude, Codex o un terminal.'));
    list.replaceChildren(...nodes);
  }

  // ── Herramientas en una fila de iconos ──
  const tools = document.querySelector('#fixed-tools .tool-buttons');
  const screen = document.getElementById('second-screen-open');
  if (screen && !screen.querySelector('svg')) screen.prepend(icon('screen'));
  const appearance = document.getElementById('appearance-icon');
  if (tools && appearance) { appearance.classList.add('tool-appearance'); tools.append(appearance); }
  for (const button of tools ? tools.querySelectorAll('button') : []) {
    const label = button.querySelector('.tool-label, .appearance-label')?.textContent.trim();
    if (label && !button.title) button.title = label;
  }

  const tabs = document.getElementById('tabs');
  if (tabs) new MutationObserver(() => paint()).observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-state'] });
  setInterval(paint, 5000);
  paint();
})();
