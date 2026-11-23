// Cabecera en una sola fila (todos los diseños): las pestañas a la izquierda y, a la derecha,
// buscar, dividir y un menú «⋯» con el resto de la antigua barra de acciones, más Comandos y Personalizar.
// Los controles originales se mueven al menú, así conservan sus manejadores y su estado (activado, texto).
(() => {
  const actions = document.querySelector('main > header .header-actions');
  if (!actions || typeof workspaceBar === 'undefined') return;
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
  const svg = (paths, fill) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true'); s.classList.add('ic');
    for (const d of paths) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', d.startsWith('c:') ? 'circle' : 'path');
      if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(','); p.setAttribute('cx', cx); p.setAttribute('cy', cy); p.setAttribute('r', r); }
      else p.setAttribute('d', d);
      s.append(p);
    }
    s.setAttribute('fill', fill ? 'currentColor' : 'none'); s.setAttribute('stroke', fill ? 'none' : 'currentColor'); s.setAttribute('stroke-width', '1.4');
    return s;
  };
  const iconButton = (label, icon) => { const b = el('button', 'hdr-icon'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.append(icon); return b; };

  const group = el('div', 'hdr-tools');
  const search = iconButton('Buscar en el terminal · Ctrl+F', svg(['c:7,7,4.5', 'M10.5 10.5 14 14']));
  search.addEventListener('click', () => terminalSearchButton.click());
  const split = iconButton('Dividir', svg(['M2.5 2.5h11v11h-11z', 'M8 2.5v11']));
  split.addEventListener('click', () => splitToggle.click());
  const syncSplit = () => {
    const on = !!splitPeer;
    const label = on ? 'Quitar división' : 'Dividir';
    split.title = label; split.setAttribute('aria-label', label); split.setAttribute('aria-pressed', String(on));
    split.classList.toggle('on', on);
  };
  new MutationObserver(syncSplit).observe(splitToggle, { childList: true, characterData: true, subtree: true });
  syncSplit();

  const more = iconButton('Más acciones', svg(['c:3,8,1.3', 'c:8,8,1.3', 'c:13,8,1.3'], true));
  more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-expanded', 'false');
  const menu = el('div', 'hdr-menu');
  menu.id = 'header-more-menu'; menu.hidden = true; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Más acciones');
  more.setAttribute('aria-controls', menu.id);
  const choiceLabel = el('label', 'hdr-menu-field');
  choiceLabel.append(el('span', null, 'Segunda sesión'), splitChoice);
  menu.append(choiceLabel, splitRotate, splitMax, el('div', 'hdr-menu-sep'), selectionAction, sessionOptions);
  for (const extra of [...workspaceBar.querySelectorAll('button')].filter(b => b !== splitToggle && b !== terminalSearchButton)) menu.append(extra);
  const shortcutsItem = el('button', null, 'Atajos de teclado…');
  shortcutsItem.type = 'button'; shortcutsItem.id = 'header-shortcuts';
  shortcutsItem.addEventListener('click', () => window.openShortcuts?.());
  menu.append(el('div', 'hdr-menu-sep'), shortcutsItem);
  document.body.append(menu);
  workspaceBar.classList.add('hdr-moved');

  const place = () => { const r = more.getBoundingClientRect(); menu.style.top = (r.bottom + 6) + 'px'; menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; };
  const open = value => { menu.hidden = !value; more.setAttribute('aria-expanded', String(value)); more.classList.toggle('on', value); if (value) { place(); menu.querySelector('button:not(:disabled), select')?.focus(); } };
  more.addEventListener('click', () => open(menu.hidden));
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { open(false); more.focus(); } });
  menu.addEventListener('click', event => { if (event.target.closest('button')) setTimeout(() => open(false)); });
  document.addEventListener('mousedown', event => { if (!menu.hidden && !menu.contains(event.target) && !more.contains(event.target)) open(false); });
  window.addEventListener('resize', () => { if (!menu.hidden) place(); });

  group.append(search, split, more, el('span', 'hdr-sep'));
  actions.prepend(group);
  if (typeof scheduleTerminalFit === 'function') scheduleTerminalFit();
})();
