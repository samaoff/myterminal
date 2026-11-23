// Cuota bajo el terminal, según la IA de la pestaña activa (Claude o Codex).
// Los datos siguen viniendo de usage-ui.js; aquí se guardan por agente (último dato conocido) y se dibujan
// respetando todos los ajustes de «Visualización de cuota».
(() => {
  const agents = { claude: 'Claude', codex: 'Codex' };
  const storeKey = 'samaapp.quota';
  let store = {};
  try { store = JSON.parse(uiStorage.getItem(storeKey)) || {}; } catch {}
  const fonts = { system: 'system-ui, sans-serif', mono: '"Cascadia Code", Consolas, monospace', consolas: 'Consolas, monospace', serif: 'Georgia, serif' };

  const mainArea = document.querySelector('main'), footerBar = document.querySelector('main > footer');
  if (!mainArea || !footerBar) return;
  const card = document.createElement('section');
  card.id = 'quota-card'; card.setAttribute('aria-label', 'Cuota de la IA');
  const head = document.createElement('div'); head.className = 'qc-head';
  const title = document.createElement('span'); title.textContent = 'Cuota';
  const gear = document.createElement('button'); gear.type = 'button'; gear.className = 'qc-gear';
  gear.title = 'Ajustes de la cuota'; gear.setAttribute('aria-label', 'Ajustes de la cuota');
  const gearIcon = terminalIcon('settings'); gearIcon.classList.add('ic'); gear.append(gearIcon);
  gear.onclick = () => document.getElementById('usage-customize')?.click();
  head.append(title, gear);
  const body = document.createElement('div'); body.className = 'qc-body';
  card.append(head, body);
  // Franja fija entre el terminal y la barra de estado.
  mainArea.insertBefore(card, footerBar);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (typeof scheduleTerminalFit === 'function') scheduleTerminalFit(); }).observe(card);

  const validMeter = meter => meter && typeof meter.remainingPercent === 'number' && Number.isFinite(meter.remainingPercent) && meter.remainingPercent >= 0 && meter.remainingPercent <= 100;
  function remember(kind, data) {
    const meters = (data.meters || []).filter(validMeter).map(m => ({ label: String(m.label || ''), remainingPercent: m.remainingPercent, resetAt: Number.isFinite(m.resetAt) ? m.resetAt : null, scope: m.scope === 'context' ? 'context' : 'account' }));
    if (!meters.length) return;
    store[kind] = { updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now(), model: typeof data.model === 'string' ? data.model.slice(0, 40) : '', meters };
    try { uiStorage.setItem(storeKey, JSON.stringify(store)); } catch {}
  }

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function until(timestamp) {
    const diff = timestamp - Date.now();
    if (diff <= 0) return '';
    const minutes = Math.floor(diff / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
    if (days) return days + ' d ' + (hours % 24) + ' h';
    if (hours) return hours + ' h ' + (minutes % 60) + ' min';
    return Math.max(1, minutes) + ' min';
  }
  function ago(timestamp) {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return 'hace ' + minutes + ' min';
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? 'hace ' + hours + ' h' : 'hace ' + plural(Math.floor(hours / 24), 'día', 'días');
  }
  const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };

  function indicator(kind, percent) {
    if (kind === 'segments') {
      const wrap = el('div', 'qc-seg');
      for (let i = 0; i < 10; i++) wrap.append(el('i', i < Math.round(percent / 10) ? 'on' : ''));
      return wrap;
    }
    if (kind === 'ring') { const ring = el('div', 'qc-ring'); ring.style.setProperty('--p', percent); return ring; }
    if (kind === 'number') return null;
    const bar = el('div', 'qc-bar'), fill = el('i'); fill.style.width = percent + '%'; bar.append(fill);
    return bar;
  }

  // La IA que se muestra es la de la pestaña activa; en otras pestañas, la última que se usó.
  let lastKind = typeof store.last === 'string' && agents[store.last] ? store.last : null;
  function currentKind() {
    const session = typeof active === 'string' ? sessions.get(active) : null;
    if (session && agents[session.kind]) {
      if (lastKind !== session.kind) { lastKind = session.kind; store.last = lastKind; try { uiStorage.setItem(storeKey, JSON.stringify(store)); } catch {} }
      return { kind: session.kind, session, current: true };
    }
    if (lastKind) return { kind: lastKind, session: null, current: false };
    const newest = Object.keys(agents).filter(kind => store[kind]).sort((a, b) => store[b].updatedAt - store[a].updatedAt)[0];
    return newest ? { kind: newest, session: null, current: false } : null;
  }

  function render() {
    const prefs = typeof usagePreferences === 'object' ? usagePreferences : {};
    card.dataset.layout = prefs.layout || 'row';
    card.dataset.size = prefs.size || 'normal';
    card.style.setProperty('--qc-height', (prefs.barHeight || 6) + 'px');
    card.style.setProperty('--qc-text', (prefs.textSize || 12) + 'px');
    card.style.setProperty('--qc-font', fonts[prefs.font] || fonts.system);
    card.style.setProperty('--qc-accent', prefs.customColor && prefs.color ? prefs.color : 'var(--accent)');
    const choice = currentKind();
    if (!choice) { body.replaceChildren(el('p', 'qc-empty', 'Abre una sesión de Claude o Codex para ver tu cuota.')); return; }
    const { kind, session, current } = choice, name = agents[kind], saved = store[kind];
    const live = [...sessions.values()].some(s => s.kind === kind && !s.ended);

    const line = el('div', 'qc-line');
    line.append(el('strong', '', name));
    if (prefs.model !== false && saved?.model) line.append(el('span', 'qc-model', saved.model));
    if (prefs.folder !== false && session?.folder) line.append(el('span', 'qc-folder', String(session.folder).split(/[\\/]/).filter(Boolean).pop()));
    const stateText = live && current ? 'en vivo' : saved ? (current ? ago(saved.updatedAt) : 'último dato ' + ago(saved.updatedAt)) : '';
    line.append(el('span', 'qc-state' + (live && current ? ' live' : ''), stateText));
    if (prefs.updated && saved) line.append(el('span', 'qc-updated', 'actualizado ' + new Date(saved.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })));

    const rows = [];
    const meters = (saved?.meters || []).filter(m => (m.resetAt === null || m.resetAt > Date.now()) && (m.scope !== 'context' || prefs.context !== false));
    if (!meters.length) rows.push(el('p', 'qc-empty', saved ? 'Sin datos vigentes.' : 'Todavía no hay datos. Abre una sesión de ' + name + '.'));
    for (const meter of meters) {
      const percent = meter.remainingPercent;
      const level = prefs.alerts === false ? '' : percent <= 10 ? 'low' : percent <= 25 ? 'warning' : '';
      const row = el('div', 'qc-row' + (level ? ' ' + level : ''));
      row.setAttribute('role', 'img'); row.setAttribute('aria-label', name + ' ' + meter.label + ': ' + percent + '% restante');
      const top = el('div', 'qc-top');
      top.append(el('span', 'qc-label', meter.label), el('span', 'qc-value', percent.toLocaleString('es-ES') + ' %'));
      row.append(top);
      const mark = indicator(prefs.indicator, percent);
      if (mark) row.append(mark);
      if (prefs.details !== false && meter.resetAt) row.append(el('small', '', 'se reinicia en ' + until(meter.resetAt)));
      rows.push(row);
    }
    const group = el('div', 'qc-agent' + (current ? '' : ' idle'));
    group.append(line, ...rows);
    body.replaceChildren(group);
  }

  const originalPaint = paintUsage;
  paintUsage = function (data, session) {
    const result = originalPaint.apply(this, arguments);
    if (data && session && agents[session.kind]) remember(session.kind, data);
    render();
    return result;
  };
  // Cualquier cambio en los ajustes de cuota se refleja al momento en la franja.
  const originalSave = saveUsageDisplay;
  saveUsageDisplay = function () { const result = originalSave.apply(this, arguments); render(); return result; };
  // Al cambiar de pestaña se muestra la cuota de su IA sin esperar al siguiente refresco.
  const originalActivate = activate;
  activate = function (id) { const result = originalActivate.apply(this, arguments); render(); return result; };
  setInterval(render, 30000);
  new MutationObserver(render).observe(document.getElementById('tabs'), { childList: true });
  render();
  window.renderQuotaCard = render;
  window.rememberQuota = remember;
})();
