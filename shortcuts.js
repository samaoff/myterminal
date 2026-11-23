// Atajos de teclado configurables por perfil, con detección de conflictos y protección de los atajos del shell.
(() => {
  const storeKey = 'samaapp.shortcuts';
  const goNewTerminal = kind => () => { if (typeof folder !== 'string' || !folder) { status('Abre un proyecto para iniciar un terminal.'); return; } launch(kind); };
  const clickTool = selector => () => { const element = document.querySelector(selector); if (element) element.click(); };
  const cycle = step => () => {
    const ids = [...sessions.keys()];
    if (ids.length < 2) return;
    const current = ids.indexOf(active);
    activate(ids[(current + step + ids.length) % ids.length]);
  };

  const call = fn => () => { try { fn(); } catch (error) { status(error.message); } };
  const press = getter => () => { let element = null; try { element = getter(); } catch {} if (element && !element.disabled) element.click(); else status('Esa acción no está disponible ahora.'); };

  // id, grupo, título, atajo por defecto y acción. Los atajos de Ctrl+letra sin Mayús quedan para el shell.
  const actions = [
    { id: 'palette.open', group: 'General', title: 'Abrir la paleta de comandos', combo: 'Ctrl+Shift+P', run: () => window.openCommandPalette?.() },
    { id: 'shortcuts.open', group: 'General', title: 'Atajos de teclado', combo: '', run: () => window.openShortcuts?.() },
    { id: 'project.open', group: 'Proyecto', title: 'Abrir proyecto', combo: 'Ctrl+Shift+O', run: clickTool('#folder') },
    { id: 'session.new', group: 'Sesiones', title: 'Menú «Nueva sesión»', combo: '', run: clickTool('#new-session') },
    { id: 'session.search', group: 'Sesiones', title: 'Buscar sesiones', combo: '', run: () => document.querySelector('.ns-search input')?.focus() },
    { id: 'terminal.powershell', group: 'Terminales', title: 'Nuevo terminal PowerShell', combo: 'Ctrl+Shift+T', run: goNewTerminal('powershell') },
    { id: 'terminal.claude', group: 'Terminales', title: 'Nuevo terminal Claude Code', combo: '', run: goNewTerminal('claude') },
    { id: 'terminal.codex', group: 'Terminales', title: 'Nuevo terminal Codex', combo: '', run: goNewTerminal('codex') },
    { id: 'terminal.add', group: 'Terminales', title: 'Añadir un terminal propio', combo: '', run: clickTool('#add-terminal') },
    { id: 'tab.next', group: 'Pestañas', title: 'Pestaña siguiente', combo: 'Ctrl+Tab', run: cycle(1) },
    { id: 'tab.prev', group: 'Pestañas', title: 'Pestaña anterior', combo: 'Ctrl+Shift+Tab', run: cycle(-1) },
    { id: 'tab.close', group: 'Pestañas', title: 'Cerrar la pestaña activa', combo: 'Ctrl+Shift+W', run: () => { if (active && sessions.has(active)) close(active); } },
    { id: 'tab.options', group: 'Pestañas', title: 'Opciones de pestaña', combo: '', run: press(() => sessionOptions) },
    ...Array.from({ length: 9 }, (_, i) => ({ id: 'tab.goto' + (i + 1), group: 'Pestañas', title: 'Ir a la pestaña ' + (i + 1), combo: '', run: () => { const id = [...sessions.keys()][i]; if (id !== undefined) activate(id); } })),
    { id: 'pane.split', group: 'Panel', title: 'Dividir el panel o quitar la división', combo: 'Ctrl+Shift+E', run: press(() => splitToggle) },
    { id: 'pane.rotate', group: 'Panel', title: 'Cambiar la orientación de la división', combo: '', run: press(() => splitRotate) },
    { id: 'pane.maximize', group: 'Panel', title: 'Maximizar o restaurar el panel', combo: '', run: press(() => splitMax) },
    { id: 'pane.selection', group: 'Panel', title: 'Consultar la selección con IA', combo: '', run: press(() => selectionAction) },
    { id: 'pane.headers', group: 'Panel', title: 'Mostrar u ocultar la cabecera de los paneles', combo: '', run: () => window.paneHeaders?.toggle() },
    { id: 'tools.skills', group: 'Herramientas', title: 'Abrir Skills', combo: '', run: clickTool('#fixed-tools [data-panel="skills"]') },
    { id: 'tools.files', group: 'Herramientas', title: 'Abrir Archivos', combo: '', run: clickTool('#fixed-tools [data-panel="files"]') },
    { id: 'tools.git', group: 'Herramientas', title: 'Abrir Git y cambios', combo: '', run: clickTool('#fixed-tools [data-panel="changes"]') },
    { id: 'tools.connections', group: 'Herramientas', title: 'Abrir conexiones remotas', combo: '', run: clickTool('[data-panel="connections"]') },
    { id: 'external.toggle', group: 'Pantalla', title: 'Pantalla externa: enviar o volver', combo: 'Ctrl+Shift+X', run: () => window.externalDisplay?.toggle() },
    { id: 'external.open', group: 'Pantalla', title: 'Pantalla externa (opciones)', combo: '', run: () => window.externalDisplay?.open() },
    { id: 'second.open', group: 'Pantalla', title: 'Segunda pantalla: enlazar un dispositivo', combo: '', run: () => window.secondScreen?.open() },
    { id: 'second.stop', group: 'Pantalla', title: 'Detener la segunda pantalla', combo: '', run: () => window.secondScreen?.stop() },
    { id: 'second.pause', group: 'Pantalla', title: 'Pausar o reanudar la segunda pantalla', combo: '', run: () => window.secondScreen?.togglePause() },
    { id: 'sidebar.toggle', group: 'Aspecto', title: 'Mostrar u ocultar la barra lateral', combo: 'Ctrl+Shift+B', run: clickTool('#sidebar-toggle') },
    { id: 'design.gallery', group: 'Aspecto', title: 'Abrir la galería de diseños', combo: 'Ctrl+Shift+G', run: clickTool('#gallery-open') },
    { id: 'console.settings', group: 'Aspecto', title: 'Personalizar la consola', combo: '', run: clickTool('#console-customize') },
    { id: 'quota.settings', group: 'Aspecto', title: 'Ajustes de la cuota', combo: '', run: clickTool('#usage-customize') },
    { id: 'gpu.toggle', group: 'Aspecto', title: 'Activar o desactivar la aceleración por GPU', combo: '', run: call(() => { if (window.gpuRender?.available) status(window.gpuRender.toggle() ? 'Aceleración por GPU activada.' : 'Aceleración por GPU desactivada.'); }) },
    { id: 'background.toggle', group: 'Aspecto', title: 'Mantener o no los terminales al cerrar la ventana', combo: '', run: call(() => window.backgroundMode?.toggle()) }
  ];

  // Terminales detectados y propios: se añaden al vuelo, porque esas listas llegan después de arrancar.
  function dynamicActions() {
    const known = new Set(actions.map(action => action.id));
    const list = [];
    const addTerminal = (id, name) => { const key = 'terminal.' + id; if (!id || known.has(key)) return; known.add(key); list.push({ id: key, group: 'Terminales', title: 'Nuevo terminal ' + name, combo: '', run: goNewTerminal(id) }); };
    for (const shell of window.detectedShellList || []) addTerminal(shell.id, shell.name);
    try { for (const profile of typeof customTerminalProfiles !== 'undefined' ? customTerminalProfiles : []) addTerminal(profile.id, profile.name); } catch {}
    return list;
  }
  const allActions = () => [...actions, ...dynamicActions()];
  const findAction = id => allActions().find(action => action.id === id);

  // Atajos que ya usa la aplicación o el terminal y no se pueden reasignar.
  const reserved = new Map([
    ['Ctrl+C', 'copiar o interrumpir'], ['Ctrl+V', 'pegar'], ['Ctrl+F', 'buscar en el terminal'], ['Ctrl+Shift+C', 'copiar'], ['Ctrl+Shift+V', 'pegar'],
    ['Ctrl++', 'ampliar el texto'], ['Ctrl+-', 'reducir el texto'], ['Ctrl+=', 'ampliar el texto'], ['Ctrl+0', 'tamaño de texto original'],
    ['Ctrl+R', 'buscar en el historial'], ['Ctrl+Shift+I', 'herramientas de desarrollo']
  ]);

  // Forma canónica: Ctrl+Alt+Shift+Tecla.
  function fromEvent(event) {
    if (['Control', 'Shift', 'Alt', 'Meta', 'Dead', 'AltGraph'].includes(event.key)) return null;
    let key = event.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    else if (key.startsWith('Arrow')) key = key.slice(5);
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    return { combo: [...parts, key].join('+'), key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };
  }
  // Devuelve el motivo si el atajo no es válido, o cadena vacía.
  function problem(parsed) {
    const functionKey = /^F([1-9]|1[0-2])$/.test(parsed.key);
    if (parsed.meta) return 'La tecla Windows no se puede usar.';
    if (parsed.ctrl && parsed.alt && parsed.key.length === 1) return 'Ctrl+Alt equivale a AltGr y escribe caracteres.';
    if (!functionKey && !parsed.ctrl && !parsed.alt) return 'Incluye Ctrl o Alt, o usa una tecla de función (F1 a F12).';
    if (parsed.alt && !parsed.ctrl && !parsed.shift && !functionKey) return 'Alt con una sola letra lo usa el shell. Añade Mayús.';
    if (parsed.ctrl && !parsed.shift && !parsed.alt && /^[A-Z]$/.test(parsed.key)) return 'Ctrl con una letra lo usa el shell. Añade Mayús.';
    if (reserved.has(parsed.combo)) return 'Ya lo usa la aplicación para ' + reserved.get(parsed.combo) + '.';
    return '';
  }

  let custom = {};
  try {
    const saved = window.desktop.initialPreferences.shortcuts?.map || JSON.parse(uiStorage.getItem(storeKey))?.map;
    if (saved && typeof saved === 'object') for (const [id, combo] of Object.entries(saved)) if (/^[a-z][\w.-]{0,80}$/i.test(id) && typeof combo === 'string' && combo.length <= 40) custom[id] = combo;
  } catch {}
  const comboOf = id => Object.hasOwn(custom, id) ? custom[id] : (findAction(id)?.combo || '');
  function save() {
    const payload = { map: custom };
    try { uiStorage.setItem(storeKey, JSON.stringify(payload)); } catch {}
    window.desktop.savePreferences({ shortcuts: payload }).catch(() => status('No se pudieron guardar los atajos.'));
  }
  function owner(combo, exceptId) { return allActions().find(action => action.id !== exceptId && comboOf(action.id) === combo && combo); }

  // Despacho global, antes de que el terminal reciba la tecla.
  let capturing = null;
  window.addEventListener('keydown', event => {
    if (capturing) return;
    if (event.repeat) return;
    const parsed = fromEvent(event);
    if (!parsed) return;
    const action = allActions().find(item => comboOf(item.id) === parsed.combo);
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    try { action.run(); } catch (error) { status(error.message); }
  }, true);

  // Diálogo de atajos
  const dialog = document.createElement('dialog');
  dialog.id = 'shortcuts-dialog'; dialog.setAttribute('aria-labelledby', 'shortcuts-title');
  const heading = document.createElement('div'); heading.className = 'panel-heading';
  const titleElement = document.createElement('strong'); titleElement.id = 'shortcuts-title'; titleElement.textContent = 'Atajos de teclado';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'Cerrar ×'; closeButton.id = 'shortcuts-close';
  heading.append(titleElement, closeButton);
  const intro = document.createElement('p'); intro.className = 'shortcuts-intro';
  intro.textContent = 'Pulsa «Cambiar» y luego la combinación que quieras. Las combinaciones de Ctrl con una letra quedan para el shell; usa Ctrl+Mayús.';
  const list = document.createElement('div'); list.className = 'shortcuts-list';
  const message = document.createElement('p'); message.className = 'shortcuts-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const resetAll = document.createElement('button'); resetAll.type = 'button'; resetAll.className = 'secondary'; resetAll.id = 'shortcuts-reset'; resetAll.textContent = 'Restablecer todos';
  const filterInput = document.createElement('input'); filterInput.type = 'search'; filterInput.id = 'shortcuts-filter';
  filterInput.placeholder = 'Buscar un comando…'; filterInput.setAttribute('aria-label', 'Buscar un comando');
  filterInput.addEventListener('input', () => render());
  const body = document.createElement('div'); body.className = 'shortcuts-body'; body.append(intro, filterInput, list, message, resetAll);
  dialog.append(heading, body);
  document.body.append(dialog);

  function render() {
    const query = filterInput.value.trim().toLowerCase();
    const rows = [];
    let lastGroup = '';
    for (const action of allActions()) {
      const combo = comboOf(action.id);
      if (query && !(action.title + ' ' + action.group + ' ' + combo).toLowerCase().includes(query)) continue;
      if (action.group !== lastGroup) { lastGroup = action.group; const head = document.createElement('div'); head.className = 'shortcut-group'; head.textContent = action.group; rows.push(head); }
      rows.push(row(action));
    }
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'shortcuts-empty'; empty.textContent = 'Ningún comando coincide.'; rows.push(empty); }
    list.replaceChildren(...rows);
  }
  function row(action) {
    {
      const row = document.createElement('div'); row.className = 'shortcut-row'; row.dataset.action = action.id;
      const name = document.createElement('span'); name.className = 'shortcut-name'; name.textContent = action.title;
      const combo = comboOf(action.id);
      const keys = document.createElement('kbd'); keys.className = 'shortcut-keys'; keys.textContent = combo || 'Sin atajo';
      if (!combo) keys.classList.add('empty');
      const change = document.createElement('button'); change.type = 'button'; change.className = 'secondary shortcut-change'; change.textContent = 'Cambiar';
      change.setAttribute('aria-label', 'Cambiar el atajo de ' + action.title);
      change.onclick = () => capture(action, keys, change);
      const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'secondary shortcut-clear'; clear.textContent = 'Quitar';
      clear.setAttribute('aria-label', 'Quitar el atajo de ' + action.title); clear.disabled = !combo;
      clear.onclick = () => { custom[action.id] = ''; save(); message.textContent = 'Se ha quitado el atajo de «' + action.title + '».'; render(); };
      const back = document.createElement('button'); back.type = 'button'; back.className = 'secondary shortcut-default'; back.textContent = 'Por defecto';
      back.setAttribute('aria-label', 'Restablecer el atajo de ' + action.title); back.disabled = !Object.hasOwn(custom, action.id);
      back.onclick = () => { delete custom[action.id]; save(); message.textContent = 'Atajo restablecido.'; render(); };
      row.append(name, keys, change, clear, back);
      return row;
    }
  }

  function capture(action, keys, button) {
    if (capturing) capturing.cancel();
    keys.textContent = 'Pulsa la combinación…'; keys.classList.add('listening'); button.textContent = 'Cancelar';
    const finish = () => { window.removeEventListener('keydown', handler, true); capturing = null; };
    const handler = event => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape' && !event.ctrlKey && !event.shiftKey && !event.altKey) { finish(); render(); return; }
      const parsed = fromEvent(event);
      if (!parsed) return;
      const reason = problem(parsed);
      if (reason) { message.textContent = parsed.combo + ': ' + reason; return; }
      const other = owner(parsed.combo, action.id);
      if (other) { message.textContent = parsed.combo + ' ya está asignado a «' + other.title + '». Quítaselo primero.'; return; }
      custom[action.id] = parsed.combo; save();
      message.textContent = '«' + action.title + '» ahora es ' + parsed.combo + '.';
      finish(); render();
    };
    capturing = { cancel: () => { finish(); render(); } };
    window.addEventListener('keydown', handler, true);
    button.onclick = () => { finish(); render(); };
  }

  closeButton.onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (capturing) capturing.cancel(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  resetAll.onclick = () => { custom = {}; save(); message.textContent = 'Se han restablecido todos los atajos.'; render(); };

  window.shortcuts = {
    list: () => allActions().map(action => ({ id: action.id, title: action.title, combo: comboOf(action.id) })),
    comboFor: id => (findAction(id) ? comboOf(id) : ''),
    open: () => { message.textContent = ''; filterInput.value = ''; render(); if (!dialog.open) dialog.showModal(); }
  };
  window.openShortcuts = window.shortcuts.open;
})();
