// Pestañas con estado, barra de estado inferior y color de la barra de título.
(() => {
  const agentKinds = new Set(['codex', 'claude']);
  const seen = new Map();
  const entry = id => { if (!seen.has(id)) seen.set(id, { last: 0, exit: null }); return seen.get(id); };
  window.desktop.onData(({ id }) => { entry(id).last = Date.now(); });
  window.desktop.onExit(({ id, exitCode }) => { entry(id).exit = exitCode; });
  const labels = { work: 'Trabajando', wait: 'Esperando tu respuesta', done: 'Terminado', error: 'Terminó con error', idle: '' };

  // Estados deducidos de la salida: trabaja mientras llega texto; un agente sin salida espera al usuario.
  function stateOf(id, session) {
    const info = seen.get(id);
    if (session.ended || (info && info.exit !== null)) return info && info.exit ? 'error' : 'done';
    if (!info || !info.last) return 'idle';
    if (Date.now() - info.last < 1500) return 'work';
    return agentKinds.has(session.kind) ? 'wait' : 'idle';
  }

  // La cuota de IA vive en la barra lateral, encima de las herramientas.
  const usagePanel = document.getElementById('ai-usage');
  const sidebarFixed = document.querySelector('#sidebar .sidebar-fixed');
  if (usagePanel && sidebarFixed) sidebarFixed.prepend(usagePanel);

  const footer = document.querySelector('footer');
  const hint = footer.children[1];
  if (hint) hint.classList.add('sb-hint');
  const segment = (id, icon) => {
    const element = document.createElement('span');
    element.className = 'sb-seg'; element.id = id; element.hidden = true;
    if (icon) { const svg = terminalIcon(icon); svg.classList.add('ic'); element.append(svg); }
    const text = document.createElement('span'); element.append(text);
    return { element, text };
  };
  const branch = segment('sb-branch', 'git'), project = segment('sb-project', 'folder'), agents = segment('sb-agents'), font = segment('sb-font');
  footer.querySelector('#status').after(branch.element, project.element, agents.element, font.element);

  const fontNames = { jetbrains: 'JetBrains Mono', fira: 'Fira Code', 'source-code': 'Source Code Pro', atkinson: 'Atkinson Mono', cascadia: 'Cascadia Code', 'cascadia-mono': 'Cascadia Mono', consolas: 'Consolas', courier: 'Courier New', lucida: 'Lucida Console', system: 'Sistema' };
  function paintFont() {
    font.text.textContent = (fontNames[terminalPreferences.fontFamily] || terminalPreferences.fontFamily) + ' ' + terminalPreferences.fontSize;
    font.element.hidden = false;
  }

  let lastFolder = null, branchPending = false;
  async function paintBranch() {
    if (branchPending) return;
    const current = typeof folder === 'string' ? folder : null;
    project.element.hidden = !current;
    if (current) project.text.textContent = current.split(/[\\/]/).filter(Boolean).pop();
    if (!current) { branch.element.hidden = true; lastFolder = null; return; }
    branchPending = true;
    try {
      const git = await window.desktop.gitInfo(current);
      if (git && git.available) {
        const sync = (git.ahead ? ' ↑' + git.ahead : '') + (git.behind ? ' ↓' + git.behind : '');
        branch.text.textContent = git.branch + sync;
        branch.element.title = git.upstream ? 'Rama ' + git.branch + ' · remoto ' + git.upstream : 'Rama ' + git.branch + ' · sin remoto';
        branch.element.hidden = false;
      } else branch.element.hidden = true;
    } catch { branch.element.hidden = true; }
    branchPending = false; lastFolder = current;
  }

  function agentSummary(working, waiting) {
    const items = [];
    if (working) items.push(['work', working + (working === 1 ? ' trabajando' : ' trabajando')]);
    if (waiting) items.push(['wait', waiting + (waiting === 1 ? ' espera respuesta' : ' esperan respuesta')]);
    agents.text.replaceChildren(...items.map(([state, label]) => {
      const dot = document.createElement('span'); dot.className = 'tab-dot'; dot.dataset.state = state;
      const wrap = document.createElement('span'); wrap.className = 'sb-seg'; wrap.append(dot, document.createTextNode(label));
      return wrap;
    }));
    agents.element.hidden = !items.length;
  }

  // Número de sesiones abiertas por proyecto, junto al nombre del proyecto en la barra lateral.
  function badge(host, count) {
    let element = host.querySelector(':scope > .count');
    if (!count) { element?.remove(); return; }
    if (!element) { element = document.createElement('span'); element.className = 'count'; host.append(element); }
    if (element.textContent !== String(count)) element.textContent = String(count);
  }
  function paintCounts() {
    const per = new Map();
    for (const session of sessions.values()) if (session.folder) per.set(session.folder, (per.get(session.folder) || 0) + 1);
    const current = document.querySelector('#sidebar .sidebar-project #current');
    if (current && typeof folder === 'string') badge(current.parentElement, per.get(folder) || 0);
    for (const button of document.querySelectorAll('#recent .recent')) badge(button, per.get(button.title) || 0);
  }

  function paintTabs() {
    let working = 0, waiting = 0;
    for (const [id, session] of sessions) {
      if (!session.tab) continue;
      let dot = session.tab.querySelector(':scope > .tab-dot');
      if (!dot) {
        dot = document.createElement('span'); dot.className = 'tab-dot'; dot.setAttribute('role', 'img');
        const icon = session.tab.querySelector(':scope > .terminal-icon');
        if (icon) icon.after(dot); else session.tab.prepend(dot);
      }
      const state = stateOf(id, session);
      if (dot.dataset.state !== state) { dot.dataset.state = state; dot.title = labels[state]; dot.setAttribute('aria-label', labels[state]); }
      if (state === 'work') working++; else if (state === 'wait') waiting++;
    }
    agentSummary(working, waiting);
    paintCounts();
    if (typeof folder === 'string' && folder !== lastFolder) paintBranch();
    paintFont();
  }

  let timer = 0;
  function syncTitleBar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const style = getComputedStyle(document.documentElement);
      window.desktop.setTitleBar?.({ color: style.getPropertyValue('--panel').trim(), symbolColor: style.getPropertyValue('--text').trim() })?.catch(() => {});
    }, 60);
  }
  new MutationObserver(syncTitleBar).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  syncTitleBar();

  setInterval(paintTabs, 600);
  setInterval(paintBranch, 10000);
  paintTabs(); paintBranch();
})();
