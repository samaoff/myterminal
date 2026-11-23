// Workspace layout and explicit, reviewed selection sharing with existing AI CLIs.
let splitPeer = null, splitDirection = 'columns', splitRatio = 50, splitMaximized = false;
const workspaceBar = node('div', undefined, 'workspace-toolbar');
const splitHandle = node('div', undefined, 'terminal-divider');
splitHandle.tabIndex = 0; splitHandle.setAttribute('role', 'separator');
splitHandle.setAttribute('aria-label', 'Tamaño de los terminales');
$('#workspace').append(splitHandle);
$('main > header').after(workspaceBar);
const splitChoice = node('select'); splitChoice.setAttribute('aria-label', 'Segunda sesión visible');
const splitToggle = node('button', '⇄ Dividir');
const splitRotate = node('button', '↕ Orientación');
const splitMax = node('button', '□ Maximizar');
const selectionAction = node('button', '✦ Consultar selección');
workspaceBar.append(splitToggle, splitChoice, splitRotate, splitMax, selectionAction);
function renderWorkspaceLayout() {
  const primary = sessions.get(active);
  if (!primary?.term || !sessions.get(splitPeer)?.term || splitPeer === active) splitPeer = null;
  const divided = Boolean(splitPeer) && !splitMaximized;
  $('#workspace').classList.toggle('workspace-split', divided);
  $('#workspace').dataset.direction = splitDirection;
  $('#workspace').style.setProperty('--split-ratio', splitRatio + '%');
  for (const [id, session] of sessions) {
    session.pane.hidden = id !== active && !(divided && id === splitPeer);
    session.pane.classList.toggle('split-secondary', id === splitPeer);
    session.pane.classList.toggle('split-primary', id === active);
  }
  splitHandle.hidden = !divided;
  splitHandle.setAttribute('aria-orientation', splitDirection === 'columns' ? 'vertical' : 'horizontal');
  splitHandle.setAttribute('aria-valuemin', '20'); splitHandle.setAttribute('aria-valuemax', '80');
  splitHandle.setAttribute('aria-valuenow', String(splitRatio));
  splitChoice.replaceChildren(node('option', 'Elegir segunda sesión'));
  splitChoice.firstChild.value = '';
  for (const [id, session] of sessions) if (id !== active && session.term) {
    const option = node('option', session.name + ' · ' + session.folder); option.value = id; splitChoice.append(option);
  }
  splitChoice.value = splitPeer || '';
  splitToggle.textContent = splitPeer ? '× Quitar división' : '⇄ Dividir';
  splitMax.textContent = splitMaximized ? '▣ Restaurar' : '□ Maximizar';
  splitMax.disabled = splitRotate.disabled = !splitPeer;
  splitToggle.disabled = !primary?.term;
  selectionAction.disabled = !primary?.term;
  scheduleTerminalFit();
}
const originalActivate = activate;
activate = function(id) {
  if (id === splitPeer) splitPeer = active;
  originalActivate(id); renderWorkspaceLayout();
};
const originalClose = close;
close = async function(id) { await originalClose(id); renderWorkspaceLayout(); };
splitChoice.onchange = () => { splitPeer = splitChoice.value || null; splitMaximized = false; renderWorkspaceLayout(); };
splitToggle.onclick = () => {
  if (splitPeer) splitPeer = null;
  else splitPeer = [...sessions].find(([id, s]) => id !== active && s.term)?.[0] || null;
  if (!splitPeer && sessions.size < 2) status('Abre otra sesión y elígela para dividir el espacio.');
  splitMaximized = false; renderWorkspaceLayout();
};
splitRotate.onclick = () => { splitDirection = splitDirection === 'columns' ? 'rows' : 'columns'; renderWorkspaceLayout(); };
splitMax.onclick = () => { splitMaximized = !splitMaximized; renderWorkspaceLayout(); };
// Drag a tab onto the workspace to place that session beside the current one.
new MutationObserver(() => {
  for (const [id, session] of sessions) {
    if (!session.term || session.tab.draggable) continue;
    session.tab.draggable = true;
    session.tab.ondragstart = event => event.dataTransfer.setData('application/x-ai-terminal-session', id);
    session.tab.ondblclick = () => {
      const other = [...sessions].find(([key, s]) => key !== id && s.term)?.[0];
      if (other) { activate(id); splitPeer = other; splitMaximized = false; renderWorkspaceLayout(); }
    };
  }
}).observe($('#tabs'), {childList:true});
$('#workspace').addEventListener('dragover', event => {
  if ([...event.dataTransfer.types].includes('application/x-ai-terminal-session')) event.preventDefault();
});
$('#workspace').addEventListener('drop', event => {
  const id = event.dataTransfer.getData('application/x-ai-terminal-session');
  if (!sessions.get(id)?.term || !sessions.get(active)?.term || id === active) return;
  event.preventDefault(); splitPeer = id; splitMaximized = false; renderWorkspaceLayout();
});
function adjustSplit(value) { splitRatio = Math.max(20, Math.min(80, value)); $('#workspace').style.setProperty('--split-ratio', splitRatio + '%'); splitHandle.setAttribute('aria-valuenow', String(Math.round(splitRatio))); scheduleTerminalFit(); }
splitHandle.onpointerdown = event => { splitHandle.setPointerCapture(event.pointerId); };
splitHandle.onpointermove = event => {
  if (!splitHandle.hasPointerCapture(event.pointerId)) return;
  const bounds = $('#workspace').getBoundingClientRect();
  adjustSplit(splitDirection === 'columns' ? (event.clientX - bounds.left) / bounds.width * 100 : (event.clientY - bounds.top) / bounds.height * 100);
};
splitHandle.onpointerup = event => splitHandle.releasePointerCapture(event.pointerId);
splitHandle.onkeydown = event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); adjustSplit(splitRatio + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -5 : 5)); } };

const aiReview = node('dialog'); aiReview.id = 'selection-review';
const aiHeading = node('div', undefined, 'panel-heading'), aiTitle = node('strong', 'Consultar selección con IA'), aiClose = node('button', 'Cerrar ×');
aiHeading.append(aiTitle, aiClose); aiReview.append(aiHeading);
const aiBody = node('div', undefined, 'form-body');
const aiTarget = node('select'); aiTarget.setAttribute('aria-label', 'Sesión de IA de destino');
const aiIntent = node('select'); aiIntent.setAttribute('aria-label', 'Qué quieres consultar');
for (const text of ['Explica este texto y, si contiene un error, su causa probable.', 'Propón una solución y los comandos necesarios. No ejecutes nada.']) { const option = node('option', text); aiIntent.append(option); }
const aiText = node('textarea'); aiText.rows = 12; aiText.maxLength = 20000; aiText.setAttribute('aria-label', 'Texto que se compartirá');
const aiSend = node('button', 'Insertar en la sesión de IA', 'primary');
const aiNote = node('p', 'Revisa el texto y elimina datos privados. Se insertará en la sesión elegida para que puedas revisarlo antes de enviarlo.', 'panel-note');
aiBody.append(aiNote, aiTarget, aiIntent, aiText, aiSend); aiReview.append(aiBody); document.body.append(aiReview);
aiClose.onclick = () => aiReview.close();
selectionAction.onclick = () => {
  const source = [...sessions.values()].find(s => !s.pane.hidden && s.term?.hasSelection()), text = source?.term?.getSelection();
  if (!text) { status('Selecciona texto en el terminal antes de consultarlo.'); return; }
  if (text.length > 20000) { status('Selecciona menos de 20.000 caracteres para revisar la consulta.'); return; }
  aiText.value = text; aiTarget.replaceChildren();
  for (const [id, session] of sessions) if (['codex', 'claude'].includes(session.kind) && !session.ended && !session.remote) {
    const option = node('option', session.name + ' · ' + session.folder); option.value = id; aiTarget.append(option);
  }
  aiSend.disabled = !aiTarget.options.length;
  if (aiSend.disabled) aiNote.textContent = 'Abre una sesión local de Codex o Claude para recibir la consulta. Puedes cerrar esta ventana y conservar tu selección.';
  else aiNote.textContent = 'Revisa el texto y elimina datos privados. Se insertará en la sesión elegida para revisarlo antes de enviarlo.';
  aiReview.showModal();
};
aiSend.onclick = () => {
  const target = sessions.get(aiTarget.value);
  if (!target || target.ended || target.remote) { status('La sesión de destino ya no está disponible.'); return; }
  // Remove terminal control characters; never synthesize Enter or execute a command.
  const text = aiText.value.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
  target.term.paste(aiIntent.value + '\n\n' + text);
  aiReview.close(); activate(aiTarget.value); status('Consulta insertada. Revísala en la sesión de IA antes de enviarla.');
};

// Keep the current project and recent projects together, above terminal launchers.
const recentSection = $('[data-section="recent"]');
recentSection.querySelector('.section-title').textContent = 'PROYECTOS';
recentSection.querySelector('.section-content').prepend($('.sidebar-project'));
$('#folder').after(recentSection);
const connectionsSection = $('[data-section="connections"]');
connectionsSection.classList.remove('sidebar-section');
connectionsSection.querySelector('.section-toggle').remove();
connectionsSection.id = 'connections-panel'; connectionsSection.hidden = true;
$('#inspector').append(connectionsSection);
$('#section-connections').hidden = false;
const connectionTool = node('button'); connectionTool.dataset.panel = 'connections';
connectionTool.title = 'Conexiones'; connectionTool.setAttribute('aria-label', 'Abrir conexiones');
connectionTool.append(terminalIcon('network'), node('span', 'Conexiones', 'tool-label'));
$('#fixed-tools .tool-buttons').append(connectionTool);
connectionTool.onclick = () => showPanel('connections');
const originalShowPanel = showPanel;
showPanel = function(value) {
  connectionsSection.hidden = value !== 'connections';
  $('#panel-content').hidden = value === 'connections';
  return originalShowPanel(value);
};
const originalRefreshPanel = refreshPanel;
refreshPanel = async function() {
  if (panel !== 'connections') return originalRefreshPanel();
  panelVersion++; $('#panel-title').textContent = 'Conexiones';
  $('#panel-context').textContent = 'SSH · SFTP · Escritorio remoto';
  $('#panel-message').textContent = '';
  try { await refreshRemoteConnections(); } catch (error) { $('#panel-message').textContent = error.message; }
};
renderWorkspaceLayout();
