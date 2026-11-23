// Paleta de comandos (Ctrl+Mayús+P): proyectos, terminales, pestañas, diseños, ajustes y herramientas en un solo buscador.
(() => {
  const plain = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const click = selector => { const element = document.querySelector(selector); if (element) element.click(); else status('Esa acción no está disponible ahora.'); };
  const needsFolder = action => () => { if (typeof folder !== 'string' || !folder) { status('Abre un proyecto para iniciar un terminal.'); return; } action(); };
  const findButton = text => [...document.querySelectorAll('#workspace-bar button, .workspace-bar button, header ~ div button')].find(button => plain(button.textContent).includes(plain(text)));

  async function buildCommands() {
    const list = [];
    const add = (group, title, run, hint = '') => list.push({ group, title, run, hint });

    add('Proyecto', 'Abrir proyecto…', () => click('#folder'));
    try {
      for (const value of (await window.desktop.projects()).slice(0, 8)) {
        if (value === folder) continue;
        add('Proyecto', 'Abrir reciente: ' + (value.split(/[\\/]/).filter(Boolean).pop() || value), () => chooseFolder(value), value);
      }
    } catch {}

    add('Terminal', 'Nuevo terminal: Codex', needsFolder(() => launch('codex')));
    add('Terminal', 'Nuevo terminal: Claude Code', needsFolder(() => launch('claude')));
    add('Terminal', 'Nuevo terminal: PowerShell', needsFolder(() => launch('powershell')));
    for (const shell of window.detectedShellList || []) add('Terminal', 'Nuevo terminal: ' + shell.name, needsFolder(() => launch(shell.id)), shell.command);
    for (const profile of typeof customTerminalProfiles !== 'undefined' ? customTerminalProfiles : []) add('Terminal', 'Nuevo terminal: ' + profile.name, needsFolder(() => launch(profile.id)), profile.command);
    add('Terminal', 'Añadir un terminal propio…', () => click('#add-terminal'));
    if (typeof savedRemoteConnections !== 'undefined') for (const entry of savedRemoteConnections) add('Remoto', 'Conectar: ' + (entry.name || entry.host), () => connectRemote(entry), String(entry.protocol || '').toUpperCase() + ' · ' + (entry.host || ''));

    for (const [id, session] of sessions) {
      const label = session.tab?.querySelector(':scope > span:not(.tab-dot):not(.close)')?.textContent || session.name || 'Terminal';
      add('Pestañas', 'Ir a: ' + label, () => activate(id), id === active ? 'activa' : '');
    }
    if (active && sessions.has(active)) add('Pestañas', 'Cerrar la pestaña activa', () => close(active));
    add('Pestañas', 'Dividir el panel', () => { const button = findButton('Dividir'); if (button) button.click(); else status('Abre un terminal para dividir el panel.'); });
    add('Pestañas', 'Buscar en el terminal', () => { const button = findButton('Buscar'); if (button) button.click(); else status('Abre un terminal para buscar.'); }, 'Ctrl+F');

    add('Aspecto', 'Abrir la galería de diseños', () => click('#gallery-open'));
    for (const design of window.designGallery?.list() || []) add('Aspecto', 'Aplicar diseño: ' + design.name, () => window.designGallery.apply(design.id));
    add('Aspecto', 'Personalizar la consola', () => click('#console-customize'));
    add('Aspecto', 'Ajustes de la cuota', () => click('#usage-customize'));
    add('Aspecto', 'Mostrar u ocultar la barra lateral', () => click('#sidebar-toggle'));

    add('Herramientas', 'Abrir Skills', () => click('#fixed-tools [data-panel="skills"]'));
    add('Herramientas', 'Abrir Archivos', () => click('#fixed-tools [data-panel="files"]'));
    add('Herramientas', 'Abrir Git y cambios', () => click('#fixed-tools [data-panel="changes"]'));
    add('Herramientas', 'Abrir conexiones remotas', () => click('[data-panel="connections"]'));
    add('Aspecto', window.paneHeaders?.isEnabled() ? 'Ocultar la cabecera de los paneles' : 'Mostrar la cabecera de los paneles', () => window.paneHeaders?.toggle());
    if (window.gpuRender?.available) add('Aspecto', window.gpuRender.isEnabled() ? 'Desactivar la aceleración por GPU del terminal' : 'Activar la aceleración por GPU del terminal', () => { const on = window.gpuRender.toggle(); status('Aceleración por GPU ' + (on ? 'activada.' : 'desactivada.')); });
    add('Aspecto', window.backgroundMode?.isEnabled() ? 'Cerrar la ventana también cierra los terminales' : 'Mantener los terminales al cerrar la ventana', async () => { const on = await window.backgroundMode.toggle(); status(on ? 'Al cerrar la ventana, los terminales seguirán en la bandeja del sistema.' : 'Al cerrar la ventana se cerrarán los terminales.'); });
    add('Pantalla', 'Pantalla externa…', () => window.externalDisplay?.open());
    add('Pantalla', 'Segunda pantalla: enlazar un dispositivo (QR)…', () => window.secondScreen?.open());
    if (window.secondScreen?.isRunning()) {
      add('Pantalla', 'Detener la segunda pantalla', () => window.secondScreen.stop());
      add('Pantalla', window.secondScreen.state().paused ? 'Reanudar la imagen de la segunda pantalla' : 'Pausar la imagen de la segunda pantalla', () => window.secondScreen.togglePause());
    }
    if (window.externalDisplay?.isActive()) add('Pantalla', 'Salir de la pantalla externa', () => window.externalDisplay.leave());
    add('Aspecto', 'Atajos de teclado…', () => window.openShortcuts?.());
    if (window.sessionRestore?.available() && sessions.size === 0) add('Proyecto', 'Restaurar la sesión anterior (' + window.sessionRestore.available() + ' pestañas)', () => window.sessionRestore.restore());

    // Cada comando muestra el atajo que tenga asignado ahora, también si el usuario lo ha cambiado.
    const shortcutOf = { 'Abrir proyecto…': 'project.open', 'Nuevo terminal: PowerShell': 'terminal.powershell', 'Nuevo terminal: Claude Code': 'terminal.claude', 'Nuevo terminal: Codex': 'terminal.codex', 'Cerrar la pestaña activa': 'tab.close', 'Dividir el panel': 'pane.split', 'Abrir la galería de diseños': 'design.gallery', 'Mostrar u ocultar la barra lateral': 'sidebar.toggle', 'Personalizar la consola': 'console.settings', 'Ajustes de la cuota': 'quota.settings', 'Abrir la paleta de comandos': 'palette.open', 'Pantalla externa…': 'external.toggle', 'Salir de la pantalla externa': 'external.toggle', 'Añadir un terminal propio…': 'terminal.add', 'Abrir Skills': 'tools.skills', 'Abrir Archivos': 'tools.files', 'Abrir Git y cambios': 'tools.git', 'Abrir conexiones remotas': 'tools.connections', 'Segunda pantalla: enlazar un dispositivo (QR)…': 'second.open', 'Detener la segunda pantalla': 'second.stop', 'Atajos de teclado…': 'shortcuts.open' };
    for (const command of list) if (!command.hint && command.title.startsWith('Nuevo terminal: ')) { const match = window.shortcuts?.list().find(item => item.title === 'Nuevo terminal ' + command.title.slice(16)); if (match) command.hint = match.combo; }
    for (const command of list) if (!command.hint && shortcutOf[command.title]) command.hint = window.shortcuts?.comboFor(shortcutOf[command.title]) || '';
    return list;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'command-palette'; dialog.setAttribute('aria-label', 'Paleta de comandos');
  const input = document.createElement('input');
  input.type = 'text'; input.id = 'palette-input'; input.placeholder = 'Escribe un comando…'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'palette-list'); input.setAttribute('aria-label', 'Buscar comando');
  const results = document.createElement('ul');
  results.id = 'palette-list'; results.setAttribute('role', 'listbox');
  const footer = document.createElement('div');
  footer.className = 'palette-hint'; footer.textContent = '↑ ↓ para moverte · Intro para ejecutar · Esc para cerrar';
  dialog.append(input, results, footer);
  document.body.append(dialog);

  let commands = [], shown = [], selected = 0;
  function filter(query) {
    const tokens = plain(query).split(/\s+/).filter(Boolean);
    const scored = [];
    commands.forEach((command, order) => {
      const haystack = plain(command.group + ' ' + command.title);
      if (!tokens.every(token => haystack.includes(token))) return;
      const title = plain(command.title);
      const rank = tokens.length && tokens.every(token => title.startsWith(token) || title.includes(': ' + token)) ? 0 : 1;
      scored.push({ command, rank, order });
    });
    return scored.sort((a, b) => a.rank - b.rank || a.order - b.order).map(item => item.command).slice(0, 40);
  }
  function paint() {
    results.replaceChildren(...shown.map((command, index) => {
      const item = document.createElement('li');
      item.id = 'palette-item-' + index; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(index === selected));
      const group = document.createElement('span'); group.className = 'palette-group'; group.textContent = command.group;
      const title = document.createElement('span'); title.className = 'palette-title'; title.textContent = command.title;
      item.append(group, title);
      if (command.hint) { const hint = document.createElement('small'); hint.textContent = command.hint; item.append(hint); }
      item.onmousemove = () => { if (selected !== index) { selected = index; mark(); } };
      item.onclick = () => execute(index);
      return item;
    }));
    if (!shown.length) { const empty = document.createElement('li'); empty.className = 'palette-empty'; empty.textContent = 'No hay comandos que coincidan.'; results.append(empty); }
    mark();
  }
  function mark() {
    results.querySelectorAll('[role=option]').forEach((item, index) => item.setAttribute('aria-selected', String(index === selected)));
    const current = results.querySelector('[aria-selected=true]');
    if (current) { input.setAttribute('aria-activedescendant', current.id); current.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function execute(index) {
    const command = shown[index];
    if (!command) return;
    dialog.close();
    setTimeout(() => { try { command.run(); } catch (error) { status(error.message); } }, 0);
  }
  async function open() {
    if (dialog.open) { input.focus(); input.select(); return; }
    commands = await buildCommands();
    input.value = ''; selected = 0; shown = filter('');
    dialog.showModal(); paint(); input.focus();
  }

  input.addEventListener('input', () => { selected = 0; shown = filter(input.value); paint(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (shown.length) selected = (selected + 1) % shown.length; mark(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (shown.length) selected = (selected - 1 + shown.length) % shown.length; mark(); }
    else if (event.key === 'Enter') { event.preventDefault(); execute(selected); }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  // El atajo de apertura lo gestiona shortcuts.js (configurable); aquí solo se expone la acción.

  // Acceso visible desde la barra superior.
  const actions = document.querySelector('main > header .header-actions');
  if (actions) {
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'palette-open'; button.className = 'secondary palette-open';
    button.title = 'Paleta de comandos (Ctrl+Mayús+P)'; button.setAttribute('aria-label', 'Abrir la paleta de comandos');
    const label = document.createElement('span'); label.textContent = 'Comandos';
    const keys = document.createElement('kbd'); keys.textContent = 'Ctrl+Mayús+P';
    button.append(label, keys);
    button.onclick = open;
    actions.prepend(button);
  }
  window.openCommandPalette = open;
})();
