// Render del terminal con la GPU (WebGL). Si el equipo no lo admite o se pierde el contexto, esa pestaña vuelve al render normal.
(() => {
  const storeKey = 'samaapp.gpu';
  let enabled = true;
  try { enabled = uiStorage.getItem(storeKey) !== '0'; } catch {}
  if (typeof WebglAddon === 'undefined') { window.gpuRender = { available: false, isEnabled: () => false, toggle: () => false, count: () => 0 }; return; }

  function attach(session) {
    if (session.gpu || session.gpuFailed || !session.term?.element) return;
    try {
      const addon = new WebglAddon.WebglAddon();
      addon.onContextLoss(() => { try { addon.dispose(); } catch {} if (session.gpu === addon) session.gpu = null; session.gpuFailed = true; });
      session.term.loadAddon(addon);
      session.gpu = addon;
    } catch { session.gpu = null; session.gpuFailed = true; }
  }
  function detach(session) {
    if (!session.gpu) return;
    try { session.gpu.dispose(); } catch {}
    session.gpu = null;
  }
  function scan() {
    for (const session of sessions.values()) {
      if (!session.term) continue;
      if (enabled) attach(session); else detach(session);
    }
  }
  function set(value) {
    enabled = Boolean(value);
    try { uiStorage.setItem(storeKey, enabled ? '1' : '0'); } catch {}
    if (enabled) for (const session of sessions.values()) session.gpuFailed = false;
    scan();
    if (typeof scheduleTerminalFit === 'function') scheduleTerminalFit();
    return enabled;
  }
  new MutationObserver(scan).observe(document.getElementById('tabs'), { childList: true });
  scan();
  window.gpuRender = { available: true, isEnabled: () => enabled, toggle: () => set(!enabled), set, count: () => [...sessions.values()].filter(s => s.gpu).length };
})();
