const sftpLogin = node('dialog'); sftpLogin.setAttribute('aria-label', 'Conectar SFTP');
const sftpForm = node('form'), sftpTitle = node('h3', 'Explorador SFTP');
function sftpCredential(title, type) { const label = node('label', title), input = node('input'); input.type = type; input.autocomplete = 'off'; label.append(input); sftpForm.append(label); return input; }
sftpForm.append(sftpTitle);
const sftpUser = sftpCredential('Usuario (vacío para usar configuración SSH)', 'text');
const sftpPassword = sftpCredential('Contraseña (opcional si usas clave o agente)', 'password');
const sftpPassphrase = sftpCredential('Frase de la clave (si está cifrada)', 'password');
const sftpLoginError = node('p'); sftpLoginError.setAttribute('role', 'status');
const sftpConnect = node('button', 'Conectar', 'primary'), sftpDismiss = node('button', 'Cerrar', 'secondary'); sftpDismiss.type = 'button';
sftpForm.append(node('p', 'Las credenciales se usan para esta conexión y no se guardan.'), sftpLoginError, sftpConnect, sftpDismiss);
sftpForm.className = 'form-body'; sftpLogin.append(sftpForm); document.body.append(sftpLogin);
let sftpEntry, sftpConnecting = false;
function openSftpLogin(entry) { if (sftpConnecting) return; sftpEntry = entry; sftpForm.reset(); sftpUser.value = entry.username; sftpTitle.textContent = 'SFTP · ' + entry.name; sftpLoginError.textContent = ''; sftpLogin.showModal(); sftpUser.focus(); }
sftpDismiss.onclick = () => sftpLogin.close();
sftpLogin.addEventListener('close', () => { sftpPassword.value = sftpPassphrase.value = ''; });
sftpLogin.addEventListener('cancel', event => { if (sftpConnecting) event.preventDefault(); });
sftpForm.onsubmit = async event => {
  event.preventDefault(); if (sftpConnecting) return;
  sftpConnecting = true; sftpConnect.disabled = sftpDismiss.disabled = true; sftpLoginError.textContent = 'Conectando…';
  const entry = sftpEntry;
  try {
    const opened = await window.desktop.sftpOpen(entry.id, { username: sftpUser.value, password: sftpPassword.value, passphrase: sftpPassphrase.value }, folder);
    sftpLogin.close(); await createSftpTab(entry, opened);
  } catch (error) { sftpLoginError.textContent = error.message; }
  finally { sftpPassword.value = sftpPassphrase.value = ''; sftpConnecting = false; sftpConnect.disabled = sftpDismiss.disabled = false; }
};
async function createSftpTab(entry, opened) {
  const { id } = opened, pane = node('div', undefined, 'terminal-pane sftp-pane'), tab = node('button', undefined, 'tab');
  const label = node('span', entry.name + ' · SFTP'), cross = node('span', '×', 'close');
  tab.append(terminalIcon('sftp'), label, cross); tab.title = entry.host;
  cross.onclick = event => { event.stopPropagation(); close(id); }; tab.onclick = () => activate(id);
  const hero = node('div', undefined, 'sftp-heading'), identity = node('div', undefined, 'sftp-identity'), heroText = node('div'), connectionBadge = node('span', '● Conectado', 'sftp-connection-state');
  heroText.append(node('strong', 'Explorador de archivos'), node('small', entry.name + ' · ' + entry.host)); identity.append(terminalIcon('sftp'), heroText); hero.append(identity, connectionBadge);
  const toolbar = node('div', undefined, 'sftp-toolbar'), message = node('span', 'Selecciona archivos para transferirlos.'), progress = node('progress'), cancel = node('button', 'Cancelar cola');
  message.setAttribute('role', 'status'); progress.max = 100; progress.value = 0; cancel.disabled = true;
  toolbar.append(message, progress, cancel);
  const errorDetails = node('details', undefined, 'sftp-errors'), errorSummary = node('summary', 'Detalle de errores'), errorList = node('div'); errorDetails.hidden = true; errorDetails.append(errorSummary, errorList); toolbar.append(errorDetails);
  progress.setAttribute('aria-label', 'Progreso total de la cola');
  const columns = node('div', undefined, 'sftp-columns'); pane.append(hero, columns, toolbar);
  const session = { id, pane, tab, name: entry.name, kind: 'sftp-browser', folder: opened.local, remote: { ...entry }, busy: false, message, progress, connectionBadge };
  sessions.set(id, session); $('#workspace').append(pane); $('#tabs').append(tab); $('#welcome').style.display = 'none';
  const sides = {};
  for (const side of ['local', 'remote']) {
    const column = node('section', undefined, 'sftp-column'); column.dataset.side = side;
    const heading = node('div', undefined, 'sftp-column-heading'), headingText = node('div'), count = node('small', 'Leyendo archivos…');
    headingText.append(node('strong', side === 'local' ? 'Mi equipo' : 'Servidor remoto'), count); heading.append(terminalIcon(side === 'local' ? 'terminal' : 'network'), headingText);
    const navigation = node('form', undefined, 'sftp-navigation'), up = node('button', '↑'), address = node('input'), refresh = node('button', '↻'), listing = node('div', undefined, 'sftp-list');
    const actions = node('div', undefined, 'sftp-selection-actions'), selectedCount = node('span', 'Ningún archivo seleccionado'), transfer = node('button', side === 'local' ? 'Subir seleccionados →' : '← Descargar seleccionados', 'sftp-transfer-selected'); transfer.disabled = true;
    actions.append(selectedCount, transfer);
    const tableHeader = node('div', undefined, 'sftp-table-heading'), all = node('input'), allLabel = node('label', undefined, 'sftp-check'); all.type = 'checkbox'; all.setAttribute('aria-label', side === 'local' ? 'Seleccionar todos los archivos locales' : 'Seleccionar todos los archivos remotos'); allLabel.append(all); tableHeader.append(allLabel, node('span', 'Nombre'), node('span', 'Tamaño'));
    address.setAttribute('aria-label', side === 'local' ? 'Ruta local' : 'Ruta remota'); up.type = 'button'; up.setAttribute('aria-label', 'Carpeta superior'); refresh.setAttribute('aria-label', 'Actualizar carpeta');
    navigation.append(up, address, refresh); column.append(heading, navigation, actions, tableHeader, listing); columns.append(column);
    listing.tabIndex = 0; listing.setAttribute('aria-label', side === 'local' ? 'Archivos locales' : 'Archivos remotos');
    const view = sides[side] = { address, listing, selected: new Set(), entries: [], rows: [], version: 0, anchor: null };
    function paintSelection() {
      const files = view.entries.filter(item => item.file), total = files.filter(item => view.selected.has(item.name)).reduce((bytes, item) => bytes + item.size, 0);
      for (const { item, row, checkbox } of view.rows) { const checked = view.selected.has(item.name); checkbox.checked = checked; row.classList.toggle('selected', checked); }
      all.checked = files.length > 0 && view.selected.size === files.length; all.indeterminate = view.selected.size > 0 && view.selected.size < files.length;
      all.disabled = !files.length || view.loading || session.busy || session.ended;
      selectedCount.textContent = view.selected.size ? view.selected.size + (view.selected.size === 1 ? ' seleccionado · ' : ' seleccionados · ') + formatSftpBytes(total) : 'Ningún archivo seleccionado';
      transfer.disabled = !view.selected.size || session.busy || session.ended || Object.values(sides).some(v => v.loading);
    }
    view.paint = paintSelection;
    all.onchange = () => { view.selected = new Set(all.checked ? view.entries.filter(item => item.file).map(item => item.name) : []); paintSelection(); };
    listing.onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); if (session.busy || session.ended || view.loading) return; view.selected = new Set(view.entries.filter(item => item.file).map(item => item.name)); paintSelection(); } };
    transfer.onclick = () => move(side, view.entries.filter(item => item.file && view.selected.has(item.name)));
    async function load(target) {
      if (session.busy || session.ended || view.loading) return;
      view.loading = true;
      const version = ++view.version; message.textContent = 'Leyendo carpeta…'; listing.setAttribute('aria-busy', 'true');
      for (const current of Object.values(sides)) current.paint();
      try {
        const result = await window.desktop.sftpList(id, side, target);
        if (version !== view.version || !sessions.has(id)) return;
        const sameFolder = address.value === result.path;
        view.selected = new Set(sameFolder ? result.entries.filter(item => item.file && view.selected.has(item.name)).map(item => item.name) : []);
        address.value = result.path; view.entries = result.entries; view.rows = []; view.anchor = null; listing.replaceChildren();
        count.textContent = result.entries.length + (result.entries.length === 1 ? ' elemento' : ' elementos');
        for (const [index, item] of result.entries.entries()) {
          const row = node('div', undefined, 'sftp-file-row'), select = node('button', undefined, 'sftp-file-name'), size = node('span', item.directory ? 'Carpeta' : item.file ? formatSftpBytes(item.size) : 'Enlace', 'sftp-file-size');
          const checkbox = node('input'), checkLabel = node('label', undefined, 'sftp-check'); checkbox.type = 'checkbox'; checkbox.disabled = !item.file; checkbox.setAttribute('aria-label', 'Seleccionar ' + item.name); checkLabel.append(checkbox);
          const icon = terminalIcon(item.directory ? 'sftp' : 'code'); icon.classList.add(item.directory ? 'sftp-folder-icon' : 'sftp-document-icon'); select.append(icon, node('span', item.name));
          function selectItem(event, toggle) {
            if (!item.file || session.busy || session.ended || view.loading) return;
            if (event.shiftKey && view.anchor != null) { if (!event.ctrlKey && !event.metaKey) view.selected.clear(); for (let i = Math.min(index, view.anchor); i <= Math.max(index, view.anchor); i++) if (view.entries[i].file) view.selected.add(view.entries[i].name); }
            else { if (!toggle && !event.ctrlKey && !event.metaKey) view.selected.clear(); if (view.selected.has(item.name)) view.selected.delete(item.name); else view.selected.add(item.name); view.anchor = index; }
            paintSelection();
          }
          checkbox.onclick = event => selectItem(event, true);
          select.title = item.name; select.onclick = event => selectItem(event, false);
          select.ondblclick = () => { if (item.directory) load(result.path.replace(/[\\/]$/, '') + (side === 'local' ? '\\' : '/') + item.name); };
          row.append(checkLabel, select, size); listing.append(row); view.rows.push({ item, row, checkbox });
        }
        if (!result.entries.length) listing.append(node('div', 'Esta carpeta está vacía', 'sftp-empty'));
        message.textContent = 'Marca varios archivos o usa Ctrl y Mayús para seleccionar. Los archivos existentes se conservan.';
      } catch (error) { if (version === view.version) message.textContent = error.message; }
      finally { view.loading = false; listing.setAttribute('aria-busy', 'false'); for (const current of Object.values(sides)) current.paint(); }
    }
    view.load = load;
    navigation.onsubmit = event => { event.preventDefault(); load(address.value); };
    up.onclick = () => load(address.value.replace(/[\\/]?[^\\/]+[\\/]?$/, '') || (side === 'local' ? address.value : '/'));
  }
  async function move(side, items) {
    if (!items.length || session.busy || session.ended || Object.values(sides).some(v => v.loading)) return;
    session.busy = true; session.cancelQueue = false; cancel.disabled = false; pane.classList.add('sftp-busy'); progress.value = 0; errorDetails.hidden = true; errorDetails.open = false; message.title = '';
    const batch = session.batch = { count: items.length, index: 0, completedBytes: 0, total: items.reduce((sum, item) => sum + item.size, 0), currentSize: 0 }, errors = [];
    let completed = 0;
    for (const view of Object.values(sides)) view.paint();
    try {
      for (const [index, item] of items.entries()) {
        if (session.cancelQueue || session.ended || !sessions.has(id)) break;
        batch.index = index + 1; batch.currentSize = item.size;
        message.textContent = batch.index + ' de ' + batch.count + ' · ' + (side === 'local' ? 'Subiendo ' : 'Descargando ') + item.name;
        try { await window.desktop.sftpTransfer(id, side === 'local' ? 'upload' : 'download', item.name); completed++; sides[side].selected.delete(item.name); }
        catch (error) { if (session.cancelQueue || session.ended) break; errors.push(item.name + ': ' + error.message); }
        batch.completedBytes += item.size;
        progress.value = batch.total ? batch.completedBytes / batch.total * 100 : batch.index / batch.count * 100;
      }
    } finally {
      const cancelled = session.cancelQueue || session.ended;
      session.busy = false; session.batch = null; cancel.disabled = true; pane.classList.remove('sftp-busy');
      if (sessions.has(id) && !session.ended) { const destination = sides[side === 'local' ? 'remote' : 'local']; await destination.load(destination.address.value); }
      for (const view of Object.values(sides)) view.paint();
      if (sessions.has(id)) { message.textContent = (cancelled ? 'Cola cancelada' : errors.length ? 'Cola terminada' : 'Transferencia completada') + ' · ' + completed + ' de ' + items.length + ' archivos' + (errors.length ? ' · ' + errors.length + ' con error' : ''); message.title = errors.join('\n'); errorDetails.hidden = !errors.length; errorList.replaceChildren(...errors.map(text => node('p', text))); }
    }
  }
  cancel.onclick = () => { session.cancelQueue = true; cancel.disabled = true; message.textContent = 'Cancelando cola…'; window.desktop.sftpCancel(id).catch(error => { if (!session.ended) message.textContent = error.message; }); };
  activate(id); await Promise.all([sides.local.load(opened.local), sides.remote.load(opened.remote)]);
}
function formatSftpBytes(bytes) { return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GB' : bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B'; }
window.desktop.onSftpProgress(value => { const session = sessions.get(value.id); if (!session || !session.batch) return; const batch = session.batch; session.progress.value = batch.total ? (batch.completedBytes + Math.min(value.bytes, batch.currentSize)) / batch.total * 100 : (batch.index - (value.done ? 0 : 1)) / batch.count * 100; if (!session.cancelQueue) session.message.textContent = batch.index + ' de ' + batch.count + ' · ' + value.name + ' · ' + formatSftpBytes(value.bytes) + ' / ' + formatSftpBytes(value.total); });
window.desktop.onSftpClosed(id => { const session = sessions.get(id); if (!session) return; session.ended = true; session.cancelQueue = true; session.message.textContent = 'Conexión cerrada. Abre de nuevo la conexión para continuar.'; session.connectionBadge.textContent = '● Desconectado'; session.pane.classList.add('sftp-ended'); session.pane.querySelectorAll('input, button').forEach(control => { control.disabled = true; }); });
