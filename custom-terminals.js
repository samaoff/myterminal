let customTerminalProfiles = [];
let editingTerminalId = null;
async function refreshCustomTerminals() {
  customTerminalProfiles = await window.desktop.terminalProfiles();
  const list = $('#custom-terminals'); list.replaceChildren();
  for (const profile of customTerminalProfiles) {
    const row = node('div', undefined, 'custom-terminal-row');
    const start = node('button', undefined, 'launch'); start.dataset.profile = profile.id; start.disabled = !folder;
    start.append(terminalIcon(profile.icon), node('span', profile.name, 'terminal-label'), node('span', '↗', 'arrow'));
    start.title = profile.name + ' · ' + profile.command; start.onclick = () => launch(profile.id);
    const edit = node('button', '✎', 'profile-action'); edit.title = 'Editar ' + profile.name; edit.setAttribute('aria-label', edit.title); edit.onclick = () => openTerminalEditor(profile);
    const remove = node('button', '×', 'profile-action'); remove.title = 'Eliminar acceso ' + profile.name; remove.setAttribute('aria-label', remove.title);
    remove.onclick = async () => { remove.disabled = true; try { if (await window.desktop.removeTerminal(profile.id)) { await refreshCustomTerminals(); status('Acceso eliminado. Las pestañas abiertas continúan funcionando.'); } } catch (error) { status(error.message); } finally { remove.disabled = false; } };
    row.append(start, edit, remove); list.append(row);
  }
}
function openTerminalEditor(profile) {
  editingTerminalId = profile?.id || null; $('#terminal-form').reset();
  $('#terminal-editor-title').textContent = profile ? 'Editar terminal' : 'Añadir terminal';
  $('#terminal-name').value = profile?.name || ''; $('#terminal-command').value = profile?.command || '';
  $('#terminal-args').value = profile?.args.join('\n') || ''; $('#terminal-icon').value = profile?.icon || 'terminal';
  $('#terminal-editor-error').textContent = ''; $('#terminal-editor').showModal();
}
$('#add-terminal').onclick = () => openTerminalEditor();
$('#terminal-editor-close').onclick = () => $('#terminal-editor').close();
$('#terminal-preset-ollama').onclick = () => {
  $('#terminal-name').value = 'Ollama'; $('#terminal-command').value = 'ollama'; $('#terminal-args').value = 'run\n'; $('#terminal-icon').value = 'ollama';
  $('#terminal-editor-error').textContent = 'Escribe el nombre de tu modelo en la segunda línea de Argumentos.'; $('#terminal-args').focus();
};
$('#terminal-form').onsubmit = async event => {
  event.preventDefault(); const button = $('#terminal-save'); button.disabled = true;
  try {
    const command = $('#terminal-command').value.trim();
    const args = $('#terminal-args').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (/(^|[\\/])ollama(?:\.exe)?$/i.test(command) && args[0] === 'run' && args.length < 2) throw new Error('Añade el nombre del modelo de Ollama en la segunda línea de Argumentos.');
    await window.desktop.saveTerminal({ id: editingTerminalId, name: $('#terminal-name').value, command, args, icon: $('#terminal-icon').value });
    await refreshCustomTerminals(); $('#terminal-editor').close(); status('Terminal guardado. Ábrelo desde la lista de Terminales.');
  } catch (error) { $('#terminal-editor-error').textContent = error.message; }
  finally { button.disabled = false; }
};
refreshCustomTerminals().catch(error => status(error.message));
