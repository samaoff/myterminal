// Ajuste «Mantener los terminales al cerrar la ventana» (la aplicación sigue en la bandeja del sistema).
(() => {
  let enabled = Boolean(window.desktop.initialPreferences.keepRunning);
  async function set(value) {
    const previous = enabled;
    enabled = Boolean(value);
    try { await window.desktop.savePreferences({ keepRunning: enabled }); } catch { enabled = previous; status('No se pudo guardar el ajuste.'); }
    return enabled;
  }
  window.backgroundMode = { isEnabled: () => enabled, set, toggle: () => set(!enabled) };
})();
