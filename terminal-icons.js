// Small local SVG identifiers; no remote assets or font dependency.
const terminalIconPaths = {
  codex: ['M12 2 21 7v10l-9 5-9-5V7z', 'm8 9 3 3-3 3m5 0h4'],
  claude: ['M12 2v20M2 12h20M5 5l14 14M5 19 19 5M8 3l8 18M3 8l18 8M3 16l18-8M8 21l8-18'],
  powershell: ['M5 5h16l-3 14H2z', 'm8 9 4 3-5 3m6 1h4'],
  ollama: ['M7 10 6 3q1-2 3 0l2 6h2l2-6q2-2 3 0l-1 7q3 2 3 5c0 4-3 6-8 6s-8-2-8-6q0-3 3-5Z', 'M8 14h.01M16 14h.01M10 17q2 2 4 0'],
  terminal: ['M3 5h18v14H3z', 'm7 9 3 3-3 3m5 0h5'],
  code: ['m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18'],
  spark: ['m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z'],
  skills: ['M9 3h6v4h3a3 3 0 0 1 0 6h-3v4H9v-3a3 3 0 0 0-6 0v3H2V7h7z', 'M9 17v5h11v-5'],
  'folder-tree': ['M3 9V4h6l2 2h10v5H9', 'M5 12v8m0-5h6m-6 5h6', 'M12 13h9v4h-9zm0 5h9v4h-9z'],
  git: ['M12 2 22 12 12 22 2 12Z', 'M8 6v8m0-5h5l3 3', 'M8 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z', 'M15 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z'],
  ssh: ['M3 4h18v16H3z','m7 9 3 3-3 3m6 0h4'],
  sftp: ['M3 6h7l2 2h9v13H3z','M8 16v-5m-2 2 2-2 2 2m6-1v5m-2-2 2 2 2-2'],
  rdp: ['M2 3h20v14H2z','M12 17v4m-5 0h10','m9 7-3 3 3 3m6-6 3 3-3 3'],
  network: ['M8 2h8v6H8zM2 16h8v6H2zm12 0h8v6h-8z','M12 8v4M6 16v-4h12v4']
};
function terminalIcon(kind) {
  const key = Object.hasOwn(terminalIconPaths, kind) ? kind : 'terminal';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': key === 'claude' ? '1.7' : '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'terminal-icon', 'data-icon': key })) svg.setAttribute(name, value);
  for (const value of terminalIconPaths[key]) { const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', value); svg.append(shape); }
  return svg;
}

// Iconos de interfaz (sustituyen a los caracteres Unicode, que cambian con la fuente del sistema).
Object.assign(terminalIconPaths, {
  menu: ['M4 6h16M4 12h16M4 18h16'],
  plus: ['M12 5v14M5 12h14'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  'folder-open': ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1', 'M3 10h18l-2 9H5z'],
  chevron: ['m6 9 6 6 6-6'],
  external: ['M7 17 17 7', 'M8 7h9v9'],
  palette: ['M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a3 3 0 0 0 3-3c0-5-4-9-8-9z', 'M7.5 11h.01M10 7.5h.01M14 7.5h.01'],
  settings: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.6-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 8h.01'],
  refresh: ['M20 11a8 8 0 0 0-14-4L4 9', 'M4 4v5h5', 'M4 13a8 8 0 0 0 14 4l2-2', 'M20 20v-5h-5'],
  gallery: ['M3 3h8v8H3z', 'M13 3h8v5h-8z', 'M13 10h8v11h-8z', 'M3 13h8v8H3z'],
  close: ['m6 6 12 12M18 6 6 18'],
  edit: ['M4 20h4L19 9l-4-4L4 16z'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  screen: ['M2 5h14v10H2z', 'M18 8h4v11h-4z', 'M6 19h6'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4-4']
});
function hydrateIcons(root = document) {
  for (const holder of root.querySelectorAll('[data-ui-icon]')) {
    if (holder.dataset.uiIconDone) continue;
    const svg = terminalIcon(holder.dataset.uiIcon);
    svg.classList.add('ic');
    holder.replaceChildren(svg);
    holder.dataset.uiIconDone = '1';
  }
}
hydrateIcons();
