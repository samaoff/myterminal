const sidebarState = { compact: innerWidth < 1050, sections: { sessions: true, connections: true, recent: true } };
try {
  const saved = window.desktop.initialPreferences.sidebar || JSON.parse(uiStorage.getItem('samaapp.sidebar'));
  if (typeof saved?.compact === 'boolean') sidebarState.compact = saved.compact;
  for (const key of Object.keys(sidebarState.sections)) if (typeof saved?.sections?.[key] === 'boolean') sidebarState.sections[key] = saved.sections[key];
} catch {}
function renderSidebar() {
  $('#sidebar').classList.toggle('compact', sidebarState.compact);
  const label = sidebarState.compact ? 'Expandir barra lateral' : 'Reducir barra lateral';
  $('#sidebar-toggle').setAttribute('aria-label', label);
  $('#sidebar-toggle').title = label;
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!sidebarState.compact));
  $('#folder').title = 'Abrir proyecto'; $('#folder').setAttribute('aria-label', 'Abrir proyecto');
  for (const section of document.querySelectorAll('.sidebar-section')) {
    const open = !sidebarState.compact && sidebarState.sections[section.dataset.section];
    section.querySelector('.section-toggle').setAttribute('aria-expanded', String(open));
    section.querySelector('.section-content').hidden = !open;
  }
  try { uiStorage.setItem('samaapp.sidebar', JSON.stringify(sidebarState)); } catch {}
  window.desktop.savePreferences({sidebar:sidebarState}).catch(() => status('No se pudo guardar la barra lateral.'));
  scheduleTerminalFit();
}
$('#sidebar-toggle').onclick = () => { sidebarState.compact = !sidebarState.compact; renderSidebar(); };
for (const section of document.querySelectorAll('.sidebar-section')) section.querySelector('.section-toggle').onclick = () => {
  const key = section.dataset.section;
  if (sidebarState.compact) { sidebarState.compact = false; sidebarState.sections[key] = true; }
  else sidebarState.sections[key] = !sidebarState.sections[key];
  renderSidebar();
};
$('#appearance-icon').onclick = openConsoleSettings;
for (const [panel, icon] of [['skills', 'skills'], ['files', 'folder-tree'], ['changes', 'git']]) {
  document.querySelector('#fixed-tools [data-panel="' + panel + '"]').prepend(terminalIcon(icon));
}
renderSidebar();
