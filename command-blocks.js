// Bloques de comando en PowerShell: franja de color a la izquierda, fondo tenue y resultado con duración.
// Se apoya en la marca OSC 133;D que el prompt de MyTerminal ya emite al terminar cada comando.
(() => {
  const tabs = document.getElementById('tabs');
  const minColumns = 50;

  function formatDuration(ms) {
    if (ms < 1000) return Math.max(1, Math.round(ms)) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
    return Math.floor(ms / 60000) + ' min ' + Math.round((ms % 60000) / 1000) + ' s';
  }
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function attach(session) {
    const term = session.term;
    let startMarker = term.registerMarker(0);
    let enteredAt = 0;
    term.onData(data => { if (data.includes('\r')) enteredAt = Date.now(); });

    // Se registra después que el aviso de tareas largas; devuelve false para que ese manejador siga funcionando.
    term.parser.registerOscHandler(133, value => {
      const match = /^D;([0-9]+)$/.exec(value);
      if (!match) return false;
      const failed = Number(match[1]) !== 0;
      const buffer = term.buffer.active;
      const endLine = buffer.baseY + buffer.cursorY;
      const ran = enteredAt > 0 && startMarker && !startMarker.isDisposed && endLine > startMarker.line;
      if (ran) {
        const color = failed ? cssVar('--red') : cssVar('--accent');
        const height = endLine - startMarker.line;
        const duration = formatDuration(Date.now() - enteredAt);
        const stripe = term.registerDecoration({ marker: startMarker, x: 0, width: term.cols, height, layer: 'bottom' });
        stripe?.onRender(element => {
          element.style.pointerEvents = 'none';
          element.style.width = '100%';
          element.style.borderLeft = '2px solid ' + color;
          element.style.background = 'color-mix(in srgb, ' + color + ' 7%, transparent)';
        });
        if (term.cols >= minColumns) {
          const label = term.registerDecoration({ marker: startMarker, x: 0, width: term.cols, layer: 'top' });
          label?.onRender(element => {
            element.textContent = (failed ? '✗ ' : '✓ ') + duration;
            element.style.cssText += ';pointer-events:none;width:100%;box-sizing:border-box;padding-right:14px;text-align:right;font-size:11px;color:' + color + ';opacity:.85;white-space:nowrap';
          });
        }
      }
      enteredAt = 0;
      startMarker = term.registerMarker(0);
      return false;
    });
  }

  function scan() {
    for (const session of sessions.values()) {
      if (session.kind !== 'powershell' || !session.term || session.commandBlocks) continue;
      session.commandBlocks = true;
      attach(session);
    }
  }
  new MutationObserver(scan).observe(tabs, { childList: true });
  scan();
})();
