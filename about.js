let aboutInfoRequest;
async function loadAboutInfo() {
  if (!aboutInfoRequest) aboutInfoRequest = window.desktop.appInfo().then(info => {
    document.getElementById('current-version').textContent = 'Versión ' + info.version;
    document.getElementById('about-version').textContent = 'Versión instalada ' + info.version;
    document.getElementById('version-history-trigger').title = 'Ver historial de versiones · ' + info.version;
    document.getElementById('release-list').replaceChildren();
    for (const release of info.releases) {
      const current = release.version === info.version;
      const entry = node('details', undefined, 'release-entry' + (current ? ' current-release' : ''));
      entry.open = current;
      const summary = node('summary');
      summary.append(node('strong', release.version), node('span', release.title, 'release-title'));
      if (current) summary.append(node('span', 'Instalada', 'release-current'));
      const list = node('ul');
      for (const change of release.changes) list.append(node('li', change));
      entry.append(summary, list); document.getElementById('release-list').append(entry);
    }
    return info;
  }).catch(error => { aboutInfoRequest = null; throw error; });
  return aboutInfoRequest;
}
function openVersionHistory() {
  const dialog = document.getElementById('about-dialog');
  if (!dialog.open) dialog.showModal();
  loadAboutInfo().catch(() => { document.getElementById('release-list').textContent = 'No se pudo cargar el historial. Cierra y vuelve a abrir este panel para intentarlo de nuevo.'; });
}
document.getElementById('version-history-trigger').onclick = openVersionHistory;
document.getElementById('about-compact').onclick = openVersionHistory;
document.getElementById('about-close').onclick = () => document.getElementById('about-dialog').close();
for (const link of document.querySelectorAll('.creator-website')) link.onclick = async event => {
  event.preventDefault();
  try { await window.desktop.openCreatorWebsite(); }
  catch { status('No se pudo abrir samaapp.es en el navegador.'); }
};
loadAboutInfo().catch(() => {});
