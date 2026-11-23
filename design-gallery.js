// Galería de diseños: aplica un tema, la consola, la cuota y la barra lateral de una vez, y permite deshacerlo.
(() => {
  const builtIn = [
    { id: 'pro', name: 'Medianoche Pro', description: 'El diseño de MyTerminal: azul noche, acento cian y cuota en fila.', tags: ['Oscuro'],
      theme: 'pro', terminal: { fontFamily: 'jetbrains', fontSize: 13 }, usage: {}, sidebar: { compact: false } },
    { id: 'pro-claro', name: 'Papel Pro', description: 'La versión clara de Pro, con acento verde azulado.', tags: ['Claro'],
      theme: 'pro-light', terminal: { fontFamily: 'jetbrains', fontSize: 13 }, usage: {}, sidebar: { compact: false } },
    { id: 'carbon', name: 'Carbón Pro', description: 'Negro neutro, sesiones con estado en la barra lateral y diffs a fila completa.', tags: ['Oscuro'],
      theme: 'carbon', terminal: { fontFamily: 'jetbrains', fontSize: 13 }, usage: {}, sidebar: { compact: false } },
    { id: 'grafito', name: 'Grafito clásico', description: 'El aspecto original de MyTerminal.', tags: ['Oscuro'],
      theme: 'samapp', terminal: { fontFamily: 'jetbrains' }, usage: {}, sidebar: { compact: false } },
    { id: 'fosforo', name: 'Fósforo verde', description: 'Consola de fósforo con cuota en segmentos finos.', tags: ['Oscuro', 'Compacto'],
      theme: 'forest', terminal: { fontFamily: 'source-code', fontSize: 13, cursorStyle: 'underline' },
      usage: { indicator: 'segments', barHeight: 6, customColor: true, color: '#91d5a6' }, sidebar: { compact: false } },
    { id: 'oceano', name: 'Océano en tarjetas', description: 'Azules fríos y cuota en tarjetas con actualización.', tags: ['Oscuro'],
      theme: 'ocean', terminal: { fontFamily: 'jetbrains' }, usage: { layout: 'cards', updated: true }, sidebar: { compact: false } },
    { id: 'papel', name: 'Papel de oficina', description: 'Fondo claro, fuente grande y anillo de cuota.', tags: ['Claro', 'Accesible'],
      theme: 'sand', terminal: { fontFamily: 'atkinson', fontSize: 16, lineHeight: 1.4 },
      usage: { indicator: 'ring', layout: 'stack', size: 'large' }, sidebar: { compact: false } },
    { id: 'artico', name: 'Ártico legible', description: 'Claro y de contraste cómodo para sesiones largas.', tags: ['Claro', 'Accesible'],
      theme: 'arctic', terminal: { fontFamily: 'cascadia', fontSize: 15 }, usage: { textSize: 14 }, sidebar: { compact: false } },
    { id: 'ciruela', name: 'Ciruela nocturna', description: 'Morados con cursor de barra y cuota numérica.', tags: ['Oscuro'],
      theme: 'plum', terminal: { fontFamily: 'fira', cursorStyle: 'bar' }, usage: { indicator: 'number', layout: 'cards' }, sidebar: { compact: false } },
    { id: 'volcan', name: 'Volcán compacto', description: 'Cálidos, barra lateral de iconos y cuota mínima.', tags: ['Oscuro', 'Compacto'],
      theme: 'volcano', terminal: { fontFamily: 'fira', fontSize: 13 }, usage: { size: 'compact', details: false, model: false }, sidebar: { compact: true } },
    { id: 'contraste', name: 'Alto contraste', description: 'Negro y amarillo con letra en negrita, pensado para accesibilidad.', tags: ['Oscuro', 'Accesible'],
      theme: 'contrast', terminal: { fontFamily: 'atkinson', fontSize: 16, fontWeight: '600' }, usage: { barHeight: 14, textSize: 15 }, sidebar: { compact: false } }
  ];
  const filters = ['Todos', 'Oscuro', 'Claro', 'Compacto', 'Accesible'];
  const maxCustom = 24;
  let custom = [];
  try {
    const saved = window.desktop.initialPreferences.designs?.items || JSON.parse(uiStorage.getItem('samaapp.designs'))?.items;
    if (Array.isArray(saved)) custom = saved.filter(d => d && typeof d.id === 'string' && typeof d.name === 'string' && appThemes[d.theme]).slice(0, maxCustom);
  } catch {}
  // Primera apertura de MyTerminal: si el tema sigue siendo el original, se estrena el diseño Pro. Después manda el usuario.
  try {
    if (!window.desktop.initialPreferences.proLook) {
      if (selectedTheme === 'samapp') { applyTheme('pro'); terminalPreferences = sanitizeTerminalSettings({ ...terminalPreferences, fontFamily: 'jetbrains', fontSize: 13 }); saveTerminalPreferences(); applyTerminalPreferences(); }
      window.desktop.savePreferences({ proLook: true }).catch(() => {});
    }
  } catch {}
  let tab = 'builtin', filter = 'Todos', query = '', undoSnapshot = null, activeId = null;

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el[key] = value;
      else el.setAttribute(key, value);
    }
    el.append(...children.flat().filter(Boolean));
    return el;
  }
  function iconButton(icon, label, props) {
    const button = h('button', { type: 'button', ...props });
    button.append(terminalIcon(icon).cloneNode(true), document.createTextNode(label ? ' ' + label : ''));
    button.firstChild.classList.add('ic');
    return button;
  }

  function currentDesign() {
    return {
      theme: selectedTheme,
      terminal: JSON.parse(JSON.stringify(terminalPreferences)),
      usage: JSON.parse(JSON.stringify(usagePreferences)),
      sidebar: { compact: sidebarState.compact }
    };
  }
  // exact: restaura una copia completa; si no, parte de los valores por defecto y aplica solo lo que define el diseño.
  function applyDesign(design, exact) {
    applyTheme(design.theme);
    terminalPreferences = sanitizeTerminalSettings(exact ? design.terminal : { ...terminalDefaults, ...design.terminal });
    saveTerminalPreferences();
    applyTerminalPreferences();
    for (const key of Object.keys(usagePreferences)) delete usagePreferences[key];
    Object.assign(usagePreferences, usageDefaults, design.usage);
    syncUsageControls();
    saveUsageDisplay();
    sidebarState.compact = Boolean(design.sidebar?.compact);
    renderSidebar();
  }

  function saveCustom() {
    const payload = { items: custom };
    try { uiStorage.setItem('samaapp.designs', JSON.stringify(payload)); } catch {}
    window.desktop.savePreferences({ designs: payload }).catch(() => say('No se pudieron guardar tus diseños.'));
  }

  // Exportar e importar: el diseño viaja como texto JSON y se valida por completo al entrar.
  const usageEnums = { indicator: ['bar', 'segments', 'ring', 'number'], layout: ['row', 'cards', 'stack'], size: ['compact', 'normal', 'large'], font: ['system', 'mono', 'consolas', 'serif'] };
  function exportText(design) {
    return JSON.stringify({ format: 'ai-terminal-design', version: 1, name: design.name, description: design.description || '', theme: design.theme, terminal: design.terminal, usage: design.usage, sidebar: design.sidebar }, null, 2);
  }
  function parseDesign(text) {
    if (typeof text !== 'string' || text.length > 20000) throw new Error('El texto es demasiado largo para ser un diseño.');
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error('Esto no es un diseño válido: el texto no es JSON.'); }
    if (!raw || raw.format !== 'ai-terminal-design' || raw.version !== 1) throw new Error('No parece un diseño de MyTerminal.');
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 40 || /[\x00-\x1f]/.test(name)) throw new Error('El diseño necesita un nombre de entre 1 y 40 caracteres.');
    if (!Object.hasOwn(appThemes, raw.theme)) throw new Error('El tema «' + String(raw.theme).slice(0, 30) + '» no existe en esta versión.');
    const source = raw.usage && typeof raw.usage === 'object' ? raw.usage : {};
    const usage = {};
    for (const [key, fallback] of Object.entries(usageDefaults)) {
      const value = source[key];
      if (usageEnums[key]) { if (usageEnums[key].includes(value)) usage[key] = value; }
      else if (key === 'color') { if (/^#[0-9a-f]{6}$/i.test(value)) usage[key] = value; }
      else if (typeof fallback === 'number') { if (Number.isFinite(value)) usage[key] = Math.min(24, Math.max(3, value)); }
      else if (typeof fallback === 'boolean' && typeof value === 'boolean') usage[key] = value;
    }
    const terminal = sanitizeTerminalSettings(raw.terminal);
    return { id: 'custom-' + Date.now(), name, description: typeof raw.description === 'string' ? raw.description.slice(0, 120) : '', tags: [], theme: raw.theme, terminal, usage, sidebar: { compact: Boolean(raw.sidebar?.compact) } };
  }

  const dialog = h('dialog', { id: 'design-gallery', 'aria-labelledby': 'design-gallery-title' });
  const closeButton = iconButton('close', 'Cerrar', { id: 'design-gallery-close', 'aria-label': 'Cerrar galería' });
  const heading = h('div', { class: 'panel-heading' }, h('strong', { id: 'design-gallery-title', text: 'Galería de diseños' }), closeButton);
  const intro = h('p', { class: 'gallery-intro', text: 'Un diseño cambia el tema, la consola, la cuota y la barra lateral a la vez. Se aplica al perfil activo y puedes deshacerlo.' });
  const tabBuiltin = h('button', { type: 'button', role: 'tab', id: 'gallery-tab-builtin' }, 'Incluidos');
  const tabCustom = h('button', { type: 'button', role: 'tab', id: 'gallery-tab-custom' }, 'Mis diseños');
  const search = h('input', { type: 'search', id: 'gallery-search', placeholder: 'Buscar diseños', 'aria-label': 'Buscar diseños' });
  const tabs = h('div', { class: 'gallery-tabs', role: 'tablist', 'aria-label': 'Origen de los diseños' }, tabBuiltin, tabCustom, search);
  const chips = h('div', { class: 'gallery-chips', role: 'group', 'aria-label': 'Filtrar por tipo' });
  const grid = h('div', { class: 'gallery-grid', id: 'gallery-grid' });
  const nameInput = h('input', { type: 'text', id: 'gallery-name', maxlength: '40', placeholder: 'Nombre del diseño', 'aria-label': 'Nombre del diseño' });
  const saveButton = h('button', { type: 'button', id: 'gallery-save', class: 'secondary', text: 'Guardar el diseño actual' });
  const saveRow = h('div', { class: 'gallery-save' }, nameInput, saveButton);
  const message = h('p', { class: 'gallery-message', role: 'status', 'aria-live': 'polite' });
  const importBox = h('textarea', { id: 'gallery-import', rows: '5', placeholder: 'Pega aquí un diseño copiado', 'aria-label': 'Texto del diseño a importar', spellcheck: 'false' });
  const importButton = h('button', { type: 'button', id: 'gallery-import-go', class: 'secondary', text: 'Importar diseño' });
  const importDetails = h('details', { class: 'gallery-import' }, h('summary', { text: 'Importar un diseño' }), importBox, importButton);
  importButton.onclick = () => {
    try {
      if (custom.length >= maxCustom) throw new Error('Has llegado al máximo de ' + maxCustom + ' diseños. Elimina alguno antes de importar.');
      const design = parseDesign(importBox.value);
      custom.unshift(design); saveCustom();
      importBox.value = ''; importDetails.open = false; tab = 'custom';
      say('Se ha importado «' + design.name + '» en Mis diseños.'); render();
    } catch (error) { say(error.message); }
  };
  dialog.append(heading, h('div', { class: 'gallery-body' }, intro, tabs, chips, grid, saveRow, importDetails, message));
  document.body.append(dialog);

  function say(text, undo) {
    message.textContent = text;
    if (undo) {
      const button = iconButton('undo', 'Deshacer', { class: 'secondary gallery-undo' });
      button.onclick = () => { applyDesign(undoSnapshot, true); activeId = null; say('Se ha restaurado el diseño anterior.'); render(); };
      message.append(' ', button);
    }
  }

  function preview(theme, terminal) {
    const p = appThemes[theme];
    const font = terminalFonts[terminal?.fontFamily] || terminalFonts.jetbrains;
    const box = h('div', { class: 'gallery-preview', 'aria-hidden': 'true' });
    box.style.cssText = `background:${p[1]};color:${p[5]};font-family:${font}`;
    const side = h('div', { class: 'gp-side' }); side.style.background = p[2];
    for (const color of [p[7], p[3], p[3]]) { const bar = h('i'); bar.style.background = color; side.append(bar); }
    const tabsRow = h('div', { class: 'gp-tabs' }); tabsRow.style.background = p[2];
    const active = h('i'); active.style.cssText = `background:${p[1]};box-shadow:inset 0 2px 0 ${p[7]}`;
    const idle = h('i'); idle.style.background = p[3];
    tabsRow.append(active, idle);
    const lines = h('div', { class: 'gp-lines' });
    const line1 = h('span'); line1.append(Object.assign(h('b', { text: '❯ ' }), { style: `color:${p[7]};font-weight:400` }), 'npm test');
    const line2 = h('span', { text: '✓ 41 pruebas' }); line2.style.color = p[14];
    const line3 = h('span', { text: '✗ 1 aviso' }); line3.style.color = p[10];
    const meter = h('em'); meter.style.background = p[3]; const fill = h('i'); fill.style.background = p[7]; meter.append(fill);
    lines.append(line1, line2, line3, meter);
    box.append(side, h('div', { class: 'gp-main' }, tabsRow, lines));
    return box;
  }

  function card(design, isCustom) {
    const p = appThemes[design.theme];
    const apply = h('button', { type: 'button', class: 'primary', 'data-design': design.id, text: 'Aplicar' });
    apply.onclick = () => {
      undoSnapshot = currentDesign();
      applyDesign(design, false);
      activeId = design.id;
      say('Se ha aplicado «' + design.name + '».', true);
      render();
    };
    const actions = h('div', { class: 'gallery-actions' }, apply);
    if (isCustom) {
      const remove = h('button', { type: 'button', class: 'secondary', text: 'Eliminar', 'aria-label': 'Eliminar ' + design.name });
      remove.onclick = () => { custom = custom.filter(item => item.id !== design.id); saveCustom(); say('Se ha eliminado «' + design.name + '».'); render(); };
      const copy = h('button', { type: 'button', class: 'secondary', text: 'Copiar', 'aria-label': 'Copiar ' + design.name + ' para compartirlo' });
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(exportText(design)); say('Diseño «' + design.name + '» copiado. Pégalo en «Importar» de otro perfil o equipo.'); }
        catch { importBox.value = exportText(design); importDetails.open = true; importBox.select(); say('No se pudo usar el portapapeles. El texto está en el cuadro «Importar» para copiarlo.'); }
      };
      actions.append(copy, remove);
    }
    const title = h('strong', { text: design.name });
    if (design.id === activeId) title.append(' ', h('span', { class: 'gallery-badge', text: 'ACTIVO' }));
    const tagsLine = (design.tags || []).concat(isCustom ? ['Tuyo'] : ['Incluido']).join(' · ');
    return h('article', { class: 'gallery-card', 'aria-label': design.name },
      preview(design.theme, design.terminal),
      h('div', { class: 'gallery-card-body' }, title, h('p', { text: design.description || 'Tema ' + p[0] + ', ' + (terminalFonts[design.terminal?.fontFamily] ? design.terminal.fontFamily : 'jetbrains') + '.' }), h('small', { text: tagsLine }), actions));
  }

  function render() {
    tabBuiltin.setAttribute('aria-selected', String(tab === 'builtin'));
    tabCustom.setAttribute('aria-selected', String(tab === 'custom'));
    chips.hidden = tab !== 'builtin';
    chips.replaceChildren(...filters.map(name => {
      const chip = h('button', { type: 'button', 'aria-pressed': String(filter === name), text: name });
      chip.onclick = () => { filter = name; render(); };
      return chip;
    }));
    const needle = query.trim().toLowerCase();
    const source = tab === 'builtin' ? builtIn : custom;
    const items = source.filter(d => (tab !== 'builtin' || filter === 'Todos' || d.tags.includes(filter)) && (!needle || (d.name + ' ' + (d.description || '')).toLowerCase().includes(needle)));
    grid.replaceChildren(...(items.length ? items.map(d => card(d, tab === 'custom')) : [h('p', { class: 'gallery-empty', text: tab === 'custom' && !custom.length ? 'Todavía no has guardado ningún diseño. Ajusta tu aspecto y usa «Guardar el diseño actual».' : 'No hay diseños que coincidan.' })]));
  }

  tabBuiltin.onclick = () => { tab = 'builtin'; render(); };
  tabCustom.onclick = () => { tab = 'custom'; render(); };
  search.oninput = () => { query = search.value; render(); };
  saveButton.onclick = () => {
    const name = nameInput.value.trim();
    if (!name || name.length > 40 || /[\x00-\x1f]/.test(name)) { say('Escribe un nombre de entre 1 y 40 caracteres.'); nameInput.focus(); return; }
    if (custom.length >= maxCustom) { say('Has llegado al máximo de ' + maxCustom + ' diseños. Elimina alguno para guardar otro.'); return; }
    const now = currentDesign();
    custom.unshift({ id: 'custom-' + Date.now(), name, description: 'Diseño guardado desde tu configuración.', tags: [], ...now });
    saveCustom();
    nameInput.value = '';
    tab = 'custom';
    say('Se ha guardado «' + name + '» en Mis diseños.');
    render();
  };
  closeButton.onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  // Acceso desde la paleta de comandos.
  window.designGallery = {
    list: () => builtIn.concat(custom).map(d => ({ id: d.id, name: d.name })),
    apply: id => {
      const design = builtIn.concat(custom).find(d => d.id === id);
      if (!design) return false;
      undoSnapshot = currentDesign(); applyDesign(design, false); activeId = design.id;
      say('Se ha aplicado «' + design.name + '».', true); render();
      return true;
    }
  };

  const opener = document.getElementById('gallery-open');
  const openerIcon = terminalIcon('gallery'); openerIcon.classList.add('ic');
  opener.prepend(openerIcon);
  opener.onclick = () => { render(); if (!dialog.open) dialog.showModal(); search.focus(); };
})();
