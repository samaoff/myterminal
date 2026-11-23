let skillPreviewToken = null;
function showSkillPreview(preview) {
  skillPreviewToken = preview.token;
  $('#preview-title').textContent = `Revisar: ${preview.name}`;
  $('#preview-destination').textContent = `Destino: ${preview.destination}`;
  $('#preview-files').textContent = preview.files.join('\n') + `\n\n${preview.bytes.toLocaleString()} bytes`;
  $('#preview-content').textContent = preview.content;
  $('#preview-duplicates').textContent = preview.duplicates.length ? `Este nombre ya aparece en ${preview.duplicates.length} ubicaciones:\n` + preview.duplicates.map(s => `${s.agent} · ${s.scope}\n${s.file}`).join('\n') : 'No se han encontrado otras skills con este nombre.';
  $('#preview-error').textContent = preview.exists ? 'Ya existe en este destino. Elige otro nombre o destino; no se sobrescribirá.' : '';
  $('#preview-save').disabled = preview.exists; $('#skill-preview').showModal();
}
$('#preview-close').onclick = () => $('#skill-preview').close();
$('#skill-import').textContent = 'Seleccionar carpeta y previsualizar';
$('#skill-import').onclick = async () => {
  const button = $('#skill-import'); button.disabled = true;
  try { const preview = await window.desktop.previewImport({ folder, target: $('#skill-target').value }); if (preview) showSkillPreview(preview); }
  catch (error) { $('#panel-message').textContent = error.message; status(error.message); }
  finally { button.disabled = false; }
};
$('#skill-new').onclick = () => { $('#editor-error').textContent = ''; $('#skill-editor').showModal(); };
$('#editor-close').onclick = () => $('#skill-editor').close();
$('#skill-form').onsubmit = async event => {
  event.preventDefault(); const button = $('#skill-form button[type="submit"]'); button.disabled = true;
  try {
    const preview = await window.desktop.previewCreate({ folder, target: $('#new-skill-target').value, name: $('#new-skill-name').value.trim(), description: $('#new-skill-description').value, instructions: $('#new-skill-instructions').value });
    showSkillPreview(preview);
  } catch (error) { $('#editor-error').textContent = error.message; }
  finally { button.disabled = false; }
};
$('#preview-save').onclick = async () => {
  const button = $('#preview-save'); button.disabled = true;
  try {
    const result = await window.desktop.commitSkill(skillPreviewToken);
    $('#skill-preview').close(); $('#skill-editor').close(); $('#skill-form').reset();
    await refreshPanel(); status(`Skill ${result.name} guardada. Abre una sesión nueva para comprobarla.`);
    view('Skill guardada', result.destination, `${result.name}\n\n${result.files} archivos guardados. Abre una nueva sesión de la IA correspondiente para comprobar su disponibilidad.`);
  } catch (error) { $('#preview-error').textContent = error.message; }
  finally { button.disabled = false; }
};
function renderDiff(text) {
  const container = $('#viewer-content'); container.replaceChildren();
  if (!text) { container.textContent = 'No hay diferencias en esta sección.'; return; }
  const table = node('table', undefined, 'diff-table'); let oldLine = 0, newLine = 0, inHunk = false;
  for (const line of text.split('\n')) {
    const row = node('tr'), hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    let old = '', fresh = '';
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true; row.className = 'diff-hunk'; }
    else if (line.startsWith('diff ') || (!inHunk && (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')))) { row.className = 'diff-meta'; if (line.startsWith('diff ')) inHunk = false; }
    else if (line.startsWith('+')) { fresh = newLine++; row.className = 'diff-add'; }
    else if (line.startsWith('-')) { old = oldLine++; row.className = 'diff-remove'; }
    else if (line.startsWith(' ')) { old = oldLine++; fresh = newLine++; }
    row.append(node('td', String(old)), node('td', String(fresh)), node('td', line)); table.append(row);
  }
  container.append(table);
}
async function openFileChange(project, relative) {
  try {
    const change = await window.desktop.fileChange(project, relative);
    view(relative, `${project} · ${change.state}`, '');
    const options = [ ['Sin preparar', () => renderDiff(change.working)], ['Preparados', () => renderDiff(change.staged)], ['Contenido actual', () => { $('#viewer-content').textContent = change.readError || change.content; }] ];
    for (const [label, action] of options) { const button = node('button', label, 'secondary'); button.onclick = () => { $('#viewer-tools').querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button)); action(); }; $('#viewer-tools').append(button); }
    $('#viewer-tools').children[change.working ? 0 : change.staged ? 1 : 2].click();
  } catch (error) { status(error.message); }
}
