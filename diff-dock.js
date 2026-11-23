// El visor de archivos y de cambios Git se acopla junto al terminal en vez de abrirse como ventana modal.
(() => {
  const viewer = document.getElementById('viewer');
  const area = document.getElementById('work-area');
  if (!viewer || !area) return;
  area.append(viewer);
  viewer.classList.add('docked');

  const refit = () => { if (typeof scheduleTerminalFit === 'function') scheduleTerminalFit(); };
  view = function (title, location, content) {
    document.getElementById('viewer-title').textContent = title;
    document.getElementById('viewer-path').textContent = location;
    document.getElementById('viewer-tools').replaceChildren();
    document.getElementById('viewer-content').textContent = content;
    if (!viewer.open) { viewer.show(); refit(); }
  };
  viewer.addEventListener('close', refit);
  // Un diálogo no modal no se cierra con Escape por sí solo.
  viewer.addEventListener('keydown', event => { if (event.key === 'Escape' && viewer.open) { event.stopPropagation(); viewer.close(); } });
})();
