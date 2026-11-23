// Restaurar las pestañas de la sesión anterior: mismas carpetas, nombres y colores, con terminales nuevos.
// Los procesos no se reanudan y nada se inicia solo: la portada ofrece restaurar o descartar.
(() => {
  const storeKey = 'samaapp.workspace';
  const maxTabs = 12;
  const skipKinds = new Set(['sftp', 'sftp-browser', 'rdp']);

  let previous = [];
  try {
    const saved = window.desktop.initialPreferences.workspace?.tabs || JSON.parse(uiStorage.getItem(storeKey))?.tabs;
    if (Array.isArray(saved)) previous = saved.filter(item => item && typeof item.launch === 'string' && typeof item.folder === 'string').slice(0, maxTabs);
  } catch {}

  function snapshot() {
    const tabs = [];
    for (const [id, session] of sessions) {
      if (session.ended || session.closing || skipKinds.has(session.kind) || !session.folder) continue;
      const item = { launch: String(session.profileId || session.kind), folder: String(session.folder), name: session.displayName || '', color: session.color || '', notify: session.notify !== false, active: id === active };
      if (session.remote) { if (typeof session.remote.id === 'string') item.remoteId = session.remote.id; else continue; }
      tabs.push(item);
    }
    return tabs.slice(0, maxTabs);
  }

  // No se guarda nada mientras haya una sesión anterior pendiente de restaurar o descartar.
  let armed = previous.length === 0, frozen = false, lastSaved = JSON.stringify(previous);
  function persist(tabs) {
    lastSaved = JSON.stringify(tabs);
    const payload = { tabs, savedAt: Date.now() };
    try { uiStorage.setItem(storeKey, JSON.stringify(payload)); } catch {}
    window.desktop.savePreferences({ workspace: payload }).catch(() => {});
  }
  function tick() {
    if (frozen) return;
    if (!armed) { if (sessions.size === 0) return; armed = true; }
    const tabs = snapshot();
    if (JSON.stringify(tabs) !== lastSaved) persist(tabs);
  }
  // Al cerrar la ventana los procesos terminan: se congela lo guardado para que esa salida no cuente como «cerrar todo».
  for (const name of ['beforeunload', 'pagehide']) window.addEventListener(name, () => { frozen = true; });
  setInterval(tick, 2000);

  const kindLabel = item => item.name || ({ powershell: 'PowerShell', codex: 'Codex', claude: 'Claude Code' }[item.launch] || (window.detectedShellList || []).find(s => s.id === item.launch)?.name || (typeof customTerminalProfiles !== 'undefined' ? customTerminalProfiles.find(p => p.id === item.launch)?.name : '') || 'Terminal');
  const folderName = item => item.folder.split(/[\\/]/).filter(Boolean).pop() || item.folder;

  async function restore(items = previous) {
    let opened = 0, failed = 0, activeId = null;
    armed = true;
    for (const item of items) {
      try {
        if (item.folder !== folder) chooseFolder(item.folder);
        await launch(item.launch, item.remoteId || null);
        const id = active, session = sessions.get(id);
        if (session) {
          if (item.name) { session.displayName = item.name; const label = session.tab.querySelector('span:not(.close):not(.tab-dot)'); if (label) label.textContent = item.name; session.tab.setAttribute('aria-label', item.name + ' · Opciones con clic derecho'); }
          if (item.color) { session.color = item.color; session.tab.style.setProperty('--session-color', item.color); }
          session.notify = item.notify !== false;
          if (item.active) activeId = id;
        }
        opened++;
      } catch { failed++; }
    }
    if (activeId && sessions.has(activeId)) activate(activeId);
    hideCard();
    status(opened ? 'Se han restaurado ' + opened + (opened === 1 ? ' pestaña' : ' pestañas') + (failed ? ' y ' + failed + ' no se pudo abrir (¿la carpeta ya no existe?).' : '.') : 'No se pudo restaurar ninguna pestaña. Comprueba que las carpetas siguen existiendo.');
    return { opened, failed };
  }
  function discard() {
    armed = true; previous = []; persist([]); hideCard();
    status('Sesión anterior descartada.');
  }

  // Tarjeta en la portada
  const welcome = document.getElementById('welcome');
  const card = document.createElement('section');
  card.id = 'restore-card'; card.className = 'restore-card'; card.setAttribute('aria-label', 'Sesión anterior'); card.hidden = true;
  function hideCard() { card.hidden = true; }
  function paintCard() {
    if (!previous.length || sessions.size > 0) { card.hidden = true; return; }
    const title = document.createElement('h2'); title.textContent = 'Sesión anterior';
    const list = document.createElement('ul');
    for (const item of previous.slice(0, 6)) {
      const row = document.createElement('li');
      const name = document.createElement('strong'); name.textContent = kindLabel(item);
      const where = document.createElement('small'); where.textContent = folderName(item); where.title = item.folder;
      row.append(name, where); list.append(row);
    }
    if (previous.length > 6) { const more = document.createElement('li'); more.className = 'more'; more.textContent = '… y ' + (previous.length - 6) + ' más'; list.append(more); }
    const note = document.createElement('p'); note.textContent = 'Se abrirán terminales nuevos en las mismas carpetas. Los procesos anteriores no se reanudan.';
    const actions = document.createElement('div'); actions.className = 'restore-actions';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'primary'; go.id = 'restore-go'; go.textContent = 'Restaurar ' + previous.length + (previous.length === 1 ? ' pestaña' : ' pestañas');
    go.onclick = async () => { go.disabled = true; await restore(); };
    const drop = document.createElement('button'); drop.type = 'button'; drop.className = 'secondary'; drop.id = 'restore-discard'; drop.textContent = 'Descartar';
    drop.onclick = discard;
    actions.append(go, drop);
    card.replaceChildren(title, list, note, actions);
    card.hidden = false;
  }
  if (welcome) { const anchor = document.getElementById('welcome-open'); (anchor || welcome.lastElementChild).after(card); }
  paintCard();

  window.sessionRestore = { available: () => previous.length, restore: () => restore(), discard, snapshot };
})();
