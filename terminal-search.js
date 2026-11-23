function attachTerminalSearch(term, pane) {
  const addon = new SearchAddon.SearchAddon(); term.loadAddon(addon);
  const bar = document.createElement('div'); bar.className = 'terminal-search'; bar.hidden = true;
  bar.setAttribute('role', 'search'); bar.setAttribute('aria-label', 'Buscar en esta terminal');
  const input = document.createElement('input'); input.placeholder = 'Buscar en esta terminal…'; input.setAttribute('aria-label', 'Texto que buscar');
  const result = document.createElement('span'); result.setAttribute('role', 'status');
  const options = { decorations: { matchBackground: '#665225', matchOverviewRuler: '#e3bd65', activeMatchBackground: '#346794', activeMatchColorOverviewRuler: '#70a5eb' } };
  function find(previous = false, incremental = false) {
    if (!input.value) { addon.clearDecorations(); term.clearSelection(); result.textContent = ''; return; }
    const found = addon[previous ? 'findPrevious' : 'findNext'](input.value, { ...options, incremental });
    if (!found) result.textContent = 'Sin resultados';
  }
  addon.onDidChangeResults(({ resultIndex, resultCount }) => {
    result.textContent = resultCount ? (resultIndex < 0 ? 'Muchas coincidencias' : `${resultIndex + 1} de ${resultCount}`) : 'Sin resultados';
  });
  function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = action; return b; }
  function hide() { bar.hidden = true; addon.clearDecorations(); term.clearSelection(); term.focus(); }
  bar.append(input, result, button('Anterior', () => find(true)), button('Siguiente', () => find()), button('Cerrar', hide));
  pane.append(bar);
  input.oninput = () => find(false, true);
  bar.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
    if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey); }
  };
  return { open() { bar.hidden = false; const selected = term.getSelection(); if (selected && !selected.includes('\n')) input.value = selected; input.focus(); input.select(); find(false, true); } };
}
