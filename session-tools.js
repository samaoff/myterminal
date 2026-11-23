const sessionEditor = node('dialog'); sessionEditor.setAttribute('aria-label', 'Opciones de pestaña');
const sessionEditorBody = node('form', undefined, 'session-editor-body');
const sessionNameLabel = node('label', 'Nombre de la pestaña'), sessionNameInput = node('input'); sessionNameInput.maxLength = 80; sessionNameInput.required = true; sessionNameLabel.append(sessionNameInput);
const sessionColorLabel = node('label', 'Color de la pestaña'), sessionColorInput = node('select');
for (const [value, label] of [['','Sin color'],['#70a5eb','Azul'],['#65ba95','Verde'],['#e3bd65','Ámbar'],['#ed7272','Rojo'],['#bd93f9','Violeta']]) { const option = node('option', label); option.value = value; sessionColorInput.append(option); }
sessionColorLabel.append(sessionColorInput);
const sessionNotifyLabel = node('label', 'Avisos de esta sesión'), sessionNotifyInput = node('input'); sessionNotifyInput.type = 'checkbox'; sessionNotifyInput.checked = true; sessionNotifyLabel.append(sessionNotifyInput);
const sessionActions = node('div', undefined, 'session-editor-actions'), sessionSave = node('button', 'Guardar', 'primary'), sessionCancel = node('button', 'Cancelar', 'secondary'); sessionCancel.type = 'button'; sessionActions.append(sessionSave, sessionCancel);
sessionEditorBody.append(node('strong', 'Opciones de pestaña'), sessionNameLabel, sessionColorLabel, sessionNotifyLabel, node('p', 'Avisos para procesos que terminan y comandos de PowerShell de más de 10 segundos cuando estás en otra pestaña o ventana.'), sessionActions); sessionEditor.append(sessionEditorBody); document.body.append(sessionEditor);
let editingSessionId, sessionEditorFocus;
function editSession(id) {
  const s = sessions.get(id); if (!s) return;
  editingSessionId = id; sessionEditorFocus = document.activeElement; sessionNameInput.value = s.displayName || s.name; sessionColorInput.value = s.color || ''; sessionNotifyInput.checked = s.notify !== false; sessionEditor.showModal(); sessionNameInput.focus();
}
sessionCancel.onclick = () => sessionEditor.close();
sessionEditor.addEventListener('close', () => sessionEditorFocus?.isConnected && sessionEditorFocus.focus());
sessionEditorBody.onsubmit = event => {
  event.preventDefault(); const s = sessions.get(editingSessionId); if (!s) { sessionEditor.close(); return; }
  const value = sessionNameInput.value.trim(); if (!value) return;
  s.displayName = value; s.color = sessionColorInput.value; s.notify = sessionNotifyInput.checked;
  s.tab.style.setProperty('--session-color', s.color || 'transparent');
  s.tab.querySelector('span:not(.close):not(.tab-dot)').textContent = value; s.tab.setAttribute('aria-label', value + ' · Opciones con clic derecho');
  sessionEditor.close();
};
const sessionOptions = node('button', 'Opciones de pestaña'); sessionOptions.onclick = () => { if (active) editSession(active); }; workspaceBar.append(sessionOptions);
const terminalSearchButton = node('button', 'Buscar · Ctrl+F');
terminalSearchButton.onclick = () => { const s = sessions.get(active); if (s?.search) s.search.open(); else status('Abre una pestaña de terminal para buscar en su pantalla.'); };
workspaceBar.append(terminalSearchButton);
function notifyFinished(id, code, description) {
  const s = sessions.get(id); if (!s || s.closing) return;
  s.tab.classList.toggle('session-error', code !== 0); s.tab.classList.toggle('session-done', code === 0);
  s.tab.title = (s.remote ? remoteSessionLocation(s.remote) : s.folder) + ' · ' + description;
  if (s.notify !== false && (active !== id || !document.hasFocus())) window.desktop.notifyTask(id, s.displayName || s.name, description).catch(error => status(error.message));
}
function attachSessionTools() {
  for (const [id, s] of sessions) {
    if (s.toolsAttached) continue; s.toolsAttached = true;
    s.tab.addEventListener('contextmenu', event => { event.preventDefault(); editSession(id); });
    s.tab.addEventListener('keydown', event => { if (event.key === 'F2' || event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); editSession(id); } });
    if (s.kind === 'powershell' && s.term) {
      s.term.onData(data => { if (data.includes('\r')) s.commandStarted = Date.now(); });
      s.term.parser.registerOscHandler(133, value => {
        if (!/^D;[0-9]+$/.test(value)) return false;
        const started = s.commandStarted; s.commandStarted = null;
        if (started && Date.now() - started >= 10000) { const code = Number(value.slice(2)); notifyFinished(id, code, code === 0 ? 'Comando terminado' : 'Comando terminado con error (' + code + ')'); }
        return true;
      });
    }
  }
}
new MutationObserver(attachSessionTools).observe($('#tabs'), { childList: true });
window.desktop.onData(({id}) => { const s = sessions.get(id); if (s && (active !== id && s.pane.hidden || !document.hasFocus())) s.tab.classList.add('session-unread'); });
window.desktop.onExit(({id, exitCode}) => notifyFinished(id, exitCode, exitCode === 0 ? 'Proceso finalizado' : 'Proceso finalizado con error (' + exitCode + ')'));
const activateWithSessionTools = activate;
activate = function(id) { sessions.get(id)?.tab.classList.remove('session-unread'); activateWithSessionTools(id); };
window.addEventListener('focus', () => { sessions.get(active)?.tab.classList.remove('session-unread'); });
attachSessionTools();
window.desktop.onTaskNoticeOpen(id => { if (sessions.has(id)) activate(id); });
