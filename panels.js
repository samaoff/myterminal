let panel = null, catalog = [], panelVersion = 0;
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function view(title, location, content) { $('#viewer-title').textContent = title; $('#viewer-path').textContent = location; $('#viewer-tools').replaceChildren(); $('#viewer-content').textContent = content; if (!$('#viewer').open) $('#viewer').showModal(); }
$('#viewer-close').onclick = () => $('#viewer').close();
function showPanel(value) {
  panel = value; $('#inspector').hidden = false; scheduleTerminalFit();
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('selected', b.dataset.panel === value));
  $('#panel-title').textContent = { skills: 'Skills', files: 'Archivos', changes: 'Control de Git' }[value];
  $('#skills-controls').hidden = value !== 'skills'; return refreshPanel();
}
$('#panel-close').onclick = () => { panel = null; panelVersion++; $('#inspector').hidden = true; scheduleTerminalFit(); document.querySelectorAll('[data-panel]').forEach(b => b.classList.remove('selected')); };
$('#panel-refresh').onclick = () => refreshPanel();
document.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => showPanel(b.dataset.panel));
function renderSkills() {
  const query = $('#skill-search').value.toLowerCase(), agent = $('#skill-agent').value, scope = $('#skill-scope').value;
  const matching = catalog.filter(s => (!$('#duplicates-only').checked || catalog.filter(other=>other.agent===s.agent && other.name===s.name).length>1) && (!agent || s.agent === agent) && (!query || `${s.name} ${s.description}`.toLowerCase().includes(query)) && (!scope || (scope === 'project' ? /Proyecto|superior/.test(s.scope) : scope === 'plugin' ? s.scope.includes('plugin') : s.scope.startsWith('Personal'))));
  $('#panel-content').replaceChildren(); $('#panel-message').textContent = `${matching.length} skills · ${catalog.length} encontradas`;
  for (const skill of matching) {
    const card = node('button', undefined, 'skill-card');
    card.append(node('strong', skill.name), node('span', `${skill.agent} · ${skill.scope}`, 'skill-label'), node('p', skill.description)); card.title = skill.file;
    const copies = catalog.filter(s => s.agent === skill.agent && s.name === skill.name).length;
    if (copies > 1) card.append(node('span', `${copies} ubicaciones/versiones con este nombre`, 'duplicate-label'));
    card.onclick = async () => { try { view(skill.name, skill.file, await window.desktop.readSkill(skill.file)); } catch (error) { status(error.message); } };
    const wrap=node('div',undefined,'skill-item'); wrap.append(card);
    if(copies>1) {
      const remove=node('button','Eliminar esta copia','secondary delete-skill');
      const protectedSkill=/plugin|sistema/i.test(skill.scope)||skill.file.split(/[\\/]/).includes('.system');
      remove.disabled=protectedSkill;remove.title=protectedSkill?'Gestiona esta copia desde la instalación del sistema o plugin':'Mover la carpeta de esta copia a la papelera';
      remove.onclick=async()=>{remove.disabled=true;try{if(await window.desktop.deleteSkill(folder,skill.file)){await refreshPanel();status('Copia movida a la papelera.');}}catch(error){status(error.message);}finally{remove.disabled=protectedSkill;}};
      wrap.append(node('div',skill.file,'skill-location'),remove);
    }
    $('#panel-content').append(wrap);
  }
  if (!matching.length) $('#panel-content').append(node('p', 'No hay skills para estos filtros. Puedes importar una desde una carpeta.', 'empty-note'));
}
for (const selector of ['#skill-search', '#skill-agent', '#skill-scope', '#duplicates-only']) $(selector).addEventListener('input', renderSkills);
async function directory(relative = '', container = $('#panel-content'), project = folder) {
  const entries = await window.desktop.files(project, relative);
  for (const entry of entries) {
    const row = node('div', undefined, 'file-entry'), button = node('button', `${entry.directory ? '▸' : '·'} ${entry.name}`, 'file-button'); button.title = entry.relative; row.append(button);
    button.onclick = async () => {
      try {
        if (entry.directory) {
          if (row.childElementCount > 1) { row.lastElementChild.remove(); button.textContent = `▸ ${entry.name}`; }
          else { const children = node('div', undefined, 'file-children'); await directory(entry.relative, children, project); row.append(children); button.textContent = `▾ ${entry.name}`; }
        } else view(entry.name, `${project}\\${entry.relative}`, await window.desktop.readFile(project, entry.relative));
      } catch (error) { status(error.message); }
    }; container.append(row);
  }
  if (!entries.length) container.append(node('p', 'Carpeta vacía', 'empty-note'));
}
function diffBlock(title, content) {
  const block = node('details', undefined, 'diff-block'); block.open = true; block.append(node('summary', title)); const pre = node('pre');
  for (const line of content.split('\n')) pre.append(node('span', line + '\n', line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : ''));
  block.append(pre); $('#panel-content').append(block);
}
async function refreshPanel() {
  if (!panel) return;
  const version = ++panelVersion, project = folder, selected = panel;
  $('#panel-context').textContent = project || 'Skills personales · Abre un proyecto para ver las suyas'; $('#panel-context').title = project || '';
  $('#panel-content').replaceChildren(); $('#panel-message').textContent = 'Cargando…';
  try {
    if (selected === 'skills') {
      const result = await window.desktop.skills(project); if (version !== panelVersion) return;
      catalog = result.skills; renderSkills();
      if (result.warnings.length) { $('#panel-message').append(node('p', `${result.warnings.length} ubicaciones no se pudieron leer.`, 'empty-note')); $('#panel-message').title = result.warnings.join('\n'); }
    } else {
      if (!project) { $('#panel-message').textContent = 'Abre un proyecto para ver este panel.'; return; }
      if (selected === 'files') {
        const temporary = node('div'); await directory('', temporary, project); if (version !== panelVersion) return;
        $('#panel-content').append(...temporary.childNodes); $('#panel-message').textContent = 'Pulsa un archivo para leerlo · Solo lectura';
      } else {
        const info=await window.desktop.gitInfo(project); if(version!==panelVersion)return;
        if(!info.available){$('#panel-message').textContent='Este proyecto no tiene repositorio Git.';return;}
        const result=await window.desktop.changes(project);if(version!==panelVersion)return;
        $('#panel-message').textContent=info.branch+' · '+(info.upstream||'Sin rama remota')+' · ↑ '+info.ahead+' ↓ '+info.behind;
        const controls=node('div',undefined,'git-controls');
        const action=async(kind,relative,message)=>{try{controls.querySelectorAll('button').forEach(b=>b.disabled=true);const outcome=await window.desktop.gitAction(project,kind,relative,message);if(!outcome.canceled){status(outcome.output);if(version===panelVersion)await refreshPanel();}}catch(error){status(error.message);if(version===panelVersion)$('#panel-message').textContent=error.message;}finally{controls.querySelectorAll('button').forEach(b=>b.disabled=false);}};
        for(const [kind,label] of [['fetch','Fetch'],['pull','Pull'],['push','Push']]){const button=node('button',label,'secondary');button.onclick=()=>action(kind);controls.append(button);}
        const message=node('input');message.placeholder='Mensaje del commit';message.setAttribute('aria-label','Mensaje del commit');message.maxLength=2000;
        const commit=node('button','Crear commit con los preparados','secondary');commit.disabled=!result.entries.some(e=>e.state[0]!==' '&&e.state!=='??');commit.onclick=()=>action('commit',null,message.value);
        controls.append(message,commit);$('#panel-content').append(controls);
        $('#panel-content').append(node('p','Preparar añade al próximo commit. Quitar de preparados conserva los cambios en disco.','panel-note'));
        if(!result.entries.length)$('#panel-content').append(node('p','Repositorio sin cambios.','empty-note'));
        for(const entry of result.entries){
          const row=node('div',undefined,'git-entry'),open=node('button',undefined,'change-file');open.append(node('span',entry.state,'change-state'),node('span',entry.relative));open.onclick=()=>openFileChange(project,entry.relative);row.append(open);
          for(const [kind,label,enabled] of [['stage','Preparar',entry.state==='??'||entry.state[1]!==' '],['unstage','Quitar de preparados',entry.state!=='??'&&entry.state[0]!==' ']])if(enabled){const b=node('button',label,'secondary');b.onclick=async()=>{b.disabled=true;await action(kind,entry.relative);b.disabled=false;};row.append(b);}
          $('#panel-content').append(row);
        }
        const history=node('details');history.append(node('summary','Últimos commits'),node('pre',info.history||'Todavía no hay commits.'));$('#panel-content').append(history);
      }
    }
  } catch (error) { if (version === panelVersion) $('#panel-message').textContent = error.message; }
}
