const updateSection = node('section', undefined, 'update-section');
updateSection.setAttribute('aria-label', 'Actualizaciones');
const updateHeading = node('h3', 'Actualizaciones');
const updateMessage = node('p', 'Cargando…', 'update-message'); updateMessage.setAttribute('role','status');
const updateProgress = node('progress'); updateProgress.max = 100; updateProgress.hidden = true; updateProgress.setAttribute('aria-label','Progreso de descarga');
const updateButtons = node('div', undefined, 'update-buttons');
const updateCheck = node('button', 'Buscar actualizaciones', 'secondary'); updateCheck.id = 'update-check';
const updateDownload = node('button', 'Descargar actualización', 'primary'); updateDownload.id = 'update-download';
const updateInstall = node('button', 'Instalar y cerrar', 'primary'); updateInstall.id = 'update-install';
const updateCancel = node('button', 'Cancelar descarga', 'secondary');
const updateReleases = node('button', 'Ver versiones en GitHub ↗', 'secondary');
updateButtons.append(updateCheck, updateDownload, updateInstall, updateCancel, updateReleases);
const updateNotes = node('details'), updateNotesContent = node('pre'); updateNotes.append(node('summary','Novedades de la actualización'), updateNotesContent);
const updateSettings = node('details'); updateSettings.id = 'update-access';
updateSettings.append(node('summary', 'Preferencias de actualización'));
const updateHelp = node('p', 'Las versiones se descargan de GitHub sin iniciar sesión. Si GitHub limita las consultas, puedes guardar un token personal de GitHub (sin permisos). Se guarda cifrado para este usuario de Windows y solo se envía a la API de GitHub.', 'panel-note');
const updateTokenLabel = node('label', 'Token de GitHub (opcional)');
const updateToken = node('input'); updateToken.id = 'update-token'; updateToken.type = 'password'; updateToken.maxLength = 4096; updateToken.autocomplete = 'off'; updateToken.spellcheck = false;
updateToken.placeholder = 'Pegar token de GitHub'; updateTokenLabel.append(updateToken);
const updateTokenState = node('p', '', 'panel-note');
const updateAutoLabel = node('label', undefined, 'settings-check');
const updateAuto = node('input'); updateAuto.type = 'checkbox'; updateAuto.id = 'update-auto';
updateAutoLabel.append(updateAuto, document.createTextNode('Buscar actualizaciones al iniciar la versión instalada'));
const updateSave = node('button','Guardar preferencias','secondary'), updateForget = node('button','Quitar token','secondary');
const updateSettingsMessage = node('p','','panel-note'); updateSettingsMessage.setAttribute('role','status');
updateSettings.append(updateHelp, updateTokenLabel, updateTokenState, updateAutoLabel, updateSave, updateForget, updateSettingsMessage);
updateSection.append(updateHeading, updateMessage, updateProgress, updateButtons, updateNotes, updateSettings);
document.querySelector('.about-identity').after(updateSection);
const updateBadge = node('button', '↑ Nueva versión', 'update-badge'); updateBadge.hidden = true; updateBadge.id = 'update-badge';
$('#version-history-trigger').before(updateBadge); updateBadge.onclick = openVersionHistory;
let latestUpdateState;
function renderUpdateState(state) {
  latestUpdateState = state;
  const busy = ['checking','downloading'].includes(state.status);
  updateMessage.textContent = state.message;
  if (!state.canInstall) updateMessage.textContent += ' Estás ejecutando el código: la instalación integrada se habilita en la versión instalada.';
  updateCheck.disabled = busy;
  updateDownload.hidden = !state.availableVersion || state.status === 'downloaded'; updateDownload.disabled = busy;
  updateInstall.hidden = state.status !== 'downloaded'; updateInstall.disabled = !state.canInstall;
  updateCancel.hidden = state.status !== 'downloading';
  updateProgress.hidden = state.status !== 'downloading';
  if (state.progress === null) updateProgress.removeAttribute('value'); else updateProgress.value = state.progress;
  updateNotes.hidden = !state.availableVersion;
  updateNotesContent.textContent = state.notes || 'Sin notas de versión.';
  updateAuto.checked = state.autoCheck;
  updateSave.disabled = updateForget.disabled = updateToken.disabled = updateAuto.disabled = busy;
  updateForget.hidden = !state.hasToken;
  updateTokenState.textContent = state.hasToken ? 'Hay un token protegido guardado. Déjalo vacío para conservarlo.' : 'No hay ningún token guardado.';
  updateBadge.hidden = !state.availableVersion;
  updateBadge.textContent = state.availableVersion ? '↑ Versión ' + state.availableVersion + ' disponible' : '↑ Nueva versión';
}
async function runUpdateAction(action) {
  try { const state = await action(); if (state?.status) renderUpdateState(state); }
  catch (error) { updateMessage.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
}
updateCheck.onclick = () => runUpdateAction(() => window.desktop.checkUpdates());
updateDownload.onclick = () => runUpdateAction(() => window.desktop.downloadUpdate());
updateInstall.onclick = () => runUpdateAction(() => window.desktop.installUpdate());
updateCancel.onclick = () => runUpdateAction(() => window.desktop.cancelUpdate());
updateReleases.onclick = () => runUpdateAction(() => window.desktop.updateReleases());
updateSave.onclick = async () => {
  const options = {autoCheck:updateAuto.checked};
  if (updateToken.value.trim()) options.token = updateToken.value;
  updateSave.disabled = true; updateSettingsMessage.textContent = '';
  try { renderUpdateState(await window.desktop.updateSettings(options)); updateToken.value = ''; updateSettingsMessage.textContent = 'Preferencias guardadas.'; }
  catch { updateSettingsMessage.textContent = 'No se pudo guardar el acceso. Comprueba el token y vuelve a intentarlo.'; }
  finally { updateSave.disabled = false; }
};
updateForget.onclick = async () => {
  await runUpdateAction(() => window.desktop.updateSettings({forgetToken:true})); updateToken.value = '';
};
window.desktop.onUpdateState(renderUpdateState);
runUpdateAction(() => window.desktop.updateState());
