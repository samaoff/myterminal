// Cabecera pequeña sobre cada panel del terminal: nombre, carpeta y estado. Útil sobre todo con la vista dividida.
(() => {
  const storeKey = 'samaapp.paneheader';
  const height = 26;
  const labels = { work: 'trabajando', wait: 'espera respuesta', done: 'terminado', error: 'con error' };
  let enabled = true;
  try { enabled = uiStorage.getItem(storeKey) !== '0'; } catch {}

  function apply() {
    document.documentElement.style.setProperty('--pane-head-h', enabled ? height + 'px' : '0px');
    document.body.classList.toggle('no-pane-head', !enabled);
    if (typeof scheduleTerminalFit === 'function') scheduleTerminalFit();
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    try { uiStorage.setItem(storeKey, enabled ? '1' : '0'); } catch {}
    apply();
    paint();
  }

  const shorten = path => {
    const parts = String(path).split(/[\\/]/).filter(Boolean);
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : parts.join('/') || String(path);
  };

  function headerFor(id, session) {
    let head = session.pane.querySelector(':scope > .pane-head');
    if (head) return head;
    head = document.createElement('div');
    head.className = 'pane-head';
    const dot = document.createElement('i'); dot.className = 'pane-dot'; dot.setAttribute('role', 'img');
    const name = document.createElement('strong'); name.className = 'pane-name';
    const where = document.createElement('span'); where.className = 'pane-path';
    const state = document.createElement('span'); state.className = 'pane-state';
    head.append(dot, name, where, state);
    head.title = 'Doble clic para cambiar el nombre y el color de la pestaña';
    head.onclick = () => session.term?.focus();
    head.ondblclick = () => { if (typeof editSession === 'function') editSession(id); };
    session.pane.prepend(head);
    return head;
  }

  function paint() {
    for (const [id, session] of sessions) {
      if (!session.term || !session.pane) continue;
      const head = headerFor(id, session);
      head.hidden = !enabled;
      if (!enabled) continue;
      const tabDot = session.tab?.querySelector(':scope > .tab-dot');
      const stateName = tabDot?.dataset.state || 'idle';
      const text = labels[stateName] || '';
      const name = session.displayName || session.name || 'Terminal';
      const dot = head.querySelector('.pane-dot'), nameElement = head.querySelector('.pane-name'), where = head.querySelector('.pane-path'), state = head.querySelector('.pane-state');
      if (dot.dataset.state !== stateName) { dot.dataset.state = stateName; dot.setAttribute('aria-label', text || 'Sin actividad'); }
      if (nameElement.textContent !== name) nameElement.textContent = name;
      const path = session.remote ? (session.remote.host || session.folder) : session.folder;
      if (where.textContent !== shorten(path)) { where.textContent = shorten(path); where.title = String(path); }
      if (state.textContent !== text) state.textContent = text;
      head.style.setProperty('--session-color', session.color || 'transparent');
    }
  }

  apply();
  setInterval(paint, 700);
  new MutationObserver(paint).observe(document.getElementById('tabs'), { childList: true });
  window.paneHeaders = { isEnabled: () => enabled, toggle: () => setEnabled(!enabled), set: setEnabled, paint };
})();
