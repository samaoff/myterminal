let usageRequestVersion = 0;
let usageDisplay = null;
const usageDefaults = { size: 'normal', model: true, folder: true, updated: false, details: true, context: true, indicator: 'bar', font: 'system', textSize: 12, barHeight: 8, layout: 'row', color: '#78cbaa', customColor: false, alerts: true };
const usageFonts = { system: 'system-ui, sans-serif', mono: '"Cascadia Code", Consolas, monospace', consolas: 'Consolas, monospace', serif: 'Georgia, serif' };
let usagePreferences = { ...usageDefaults };
try {
  const saved = window.desktop.initialPreferences.usage || JSON.parse(uiStorage.getItem('samaapp.usage'));
  if (['compact', 'normal', 'large'].includes(saved?.size)) usagePreferences.size = saved.size;
  for (const key of ['model', 'folder', 'updated', 'details', 'context']) if (typeof saved?.[key] === 'boolean') usagePreferences[key] = saved[key];
  for (const [key, values] of Object.entries({ indicator: ['bar','segments','ring','number'], font: Object.keys(usageFonts), layout: ['row','cards','stack'] })) if (values.includes(saved?.[key])) usagePreferences[key] = saved[key];
  for (const [key, min, max] of [['textSize',10,24],['barHeight',3,20]]) if (Number.isFinite(saved?.[key])) usagePreferences[key] = Math.min(max, Math.max(min, saved[key]));
  if (/^#[0-9a-f]{6}$/i.test(saved?.color)) usagePreferences.color = saved.color;
  for (const key of ['customColor','alerts']) if (typeof saved?.[key] === 'boolean') usagePreferences[key] = saved[key];
} catch {}
let usageLastPaint;
const usageSettings = node('dialog'); usageSettings.id = 'usage-settings';
usageSettings.setAttribute('aria-labelledby', 'usage-settings-title');
const usageSettingsHeading = node('div', undefined, 'panel-heading');
const usageSettingsTitle = node('strong', 'Visualización de cuota'); usageSettingsTitle.id = 'usage-settings-title';
const usageSettingsClose = node('button', 'Cerrar ×'); usageSettingsClose.setAttribute('aria-label', 'Cerrar visualización de cuota');
usageSettingsHeading.append(usageSettingsTitle, usageSettingsClose);
const usageSettingsBody = node('div', undefined, 'form-body');
usageSettingsBody.append(node('p', 'Elige el tamaño y los datos que quieres ver. Los cambios se guardan automáticamente.'));
const usageSizeLabel = node('label', 'Tamaño del panel'); const usageSize = node('select'); usageSize.id = 'usage-size';
for (const [value, label] of [['compact', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande']]) {
  const option = node('option', label); option.value = value; usageSize.append(option);
}
usageSize.value = usagePreferences.size; usageSizeLabel.append(usageSize); usageSettingsBody.append(usageSizeLabel);
function saveUsageDisplay() {
  try { uiStorage.setItem('samaapp.usage', JSON.stringify(usagePreferences)); } catch {}
  window.desktop.savePreferences({ usage: usagePreferences }).catch(() => status('No se pudo guardar la visualización de cuota.'));
  if (usageLastPaint) paintUsage(usageLastPaint.data, usageLastPaint.session);
}
usageSize.onchange = () => { usagePreferences.size = usageSize.value; saveUsageDisplay(); };
const visualControls = {};
function usageSelect(key, title, options) {
  const label = node('label', title), select = node('select'); select.id = 'usage-' + key;
  for (const [value, text] of options) { const option = node('option', text); option.value = value; select.append(option); }
  select.value = usagePreferences[key]; select.onchange = () => { usagePreferences[key] = select.value; saveUsageDisplay(); };
  label.append(select); usageSettingsBody.append(label); visualControls[key] = select;
}
usageSelect('indicator', 'Estilo de los indicadores', [['bar','Barras suaves'],['segments','Barras segmentadas'],['ring','Anillos'],['number','Solo porcentajes']]);
usageSelect('layout', 'Distribución', [['row','En fila'],['cards','Tarjetas'],['stack','En columna']]);
usageSelect('font', 'Fuente del panel', [['system','Sistema'],['mono','Cascadia Code'],['consolas','Consolas'],['serif','Georgia']]);
for (const [key, title, min, max, unit] of [['textSize','Tamaño del texto',10,24,' px'],['barHeight','Grosor de las barras',3,20,' px']]) {
  const label = node('label', title), input = node('input'), output = node('output', usagePreferences[key] + unit);
  input.id = 'usage-' + key; input.type = 'range'; input.min = min; input.max = max; input.value = usagePreferences[key];
  input.oninput = () => { usagePreferences[key] = Number(input.value); output.textContent = input.value + unit; saveUsageDisplay(); };
  label.append(input, output); usageSettingsBody.append(label); visualControls[key] = input;
}
const usageColorLabel = node('label', 'Color de los indicadores'), usageColor = node('input');
usageColor.type = 'color'; usageColor.id = 'usage-color'; usageColor.value = usagePreferences.color;
usageColor.oninput = () => { usagePreferences.color = usageColor.value; saveUsageDisplay(); };
usageColorLabel.append(usageColor); usageSettingsBody.append(usageColorLabel); visualControls.color = usageColor;
for (const [key, text] of [['customColor','Usar mi color en lugar del color del tema'],['alerts','Avisos de color al quedar poca cuota']]) {
  const label = node('label', undefined, 'settings-check'), input = node('input'); input.type = 'checkbox'; input.checked = usagePreferences[key];
  input.onchange = () => { usagePreferences[key] = input.checked; saveUsageDisplay(); };
  label.append(input, document.createTextNode(text)); usageSettingsBody.append(label); visualControls[key] = input;
}
// Refleja usagePreferences en los controles del diálogo; también lo usa la galería de diseños.
function syncUsageControls() {
  for (const [key, input] of Object.entries(visualControls)) {
    if (input.type === 'checkbox') input.checked = usagePreferences[key]; else input.value = usagePreferences[key];
    if (input.type === 'range') input.nextElementSibling.textContent = usagePreferences[key] + ' px';
  }
  usageSize.value = usagePreferences.size;
  for (const input of usageSettings.querySelectorAll('[data-usage-field]')) input.checked = usagePreferences[input.dataset.usageField];
}
const usagePresetRow = node('div', undefined, 'usage-presets');
for (const [title, preset] of [['Minimalista',{indicator:'number',layout:'row',font:'system',textSize:12,details:false}],['Panel técnico',{indicator:'segments',layout:'cards',font:'mono',textSize:13,details:true}],['Lectura cómoda',{indicator:'bar',layout:'stack',font:'system',textSize:18,barHeight:12,details:true}],['Restablecer',usageDefaults]]) {
  const button = node('button', title); button.type = 'button';
  button.onclick = () => { Object.assign(usagePreferences, preset); syncUsageControls(); saveUsageDisplay(); };
  usagePresetRow.append(button);
}
usageSettingsBody.append(usagePresetRow);
const usagePreview = node('div'); usagePreview.id = 'usage-live-preview'; usagePreview.setAttribute('aria-label','Vista previa de la apariencia');
usageSettingsBody.prepend(node('p', 'Vista previa · datos de ejemplo'), usagePreview);
for (const [key, text] of [['model', 'Modelo de IA'], ['folder', 'Carpeta del proyecto'], ['updated', 'Hora de la última actualización'], ['details', 'Detalles de cuota y fecha de reinicio'], ['context', 'Contexto disponible de la sesión']]) {
  const label = node('label', undefined, 'settings-check'); const input = node('input');
  input.type = 'checkbox'; input.checked = usagePreferences[key]; input.dataset.usageField = key;
  input.onchange = () => { usagePreferences[key] = input.checked; saveUsageDisplay(); };
  label.append(input, document.createTextNode(text)); usageSettingsBody.append(label);
}
usageSettingsBody.append(node('p', 'El modelo y el contexto aparecen cuando la herramienta los facilita. La carpeta corresponde al proyecto con el que abriste la sesión.'));
usageSettings.append(usageSettingsHeading, usageSettingsBody); document.body.append(usageSettings);
const usageCustomize = node('button', '⚙'); usageCustomize.id = 'usage-customize';
usageCustomize.title = 'Personalizar visualización de cuota'; usageCustomize.setAttribute('aria-label', usageCustomize.title);
$('#usage-refresh').before(usageCustomize);
usageCustomize.onclick = () => { if (!usageSettings.open) usageSettings.showModal(); updateUsagePreview(); };
usageSettingsClose.onclick = () => usageSettings.close();
usageSettings.addEventListener('close', () => { if (!$('#ai-usage').hidden) usageCustomize.focus(); });
const usageMetadata = node('div', undefined, 'usage-metadata'); usageMetadata.id = 'usage-metadata';
$('#usage-meters').before(usageMetadata);
function styleUsage(target) {
  for (const key of ['indicator','layout']) target.dataset[key] = usagePreferences[key];
  target.style.setProperty('--usage-font', usageFonts[usagePreferences.font]);
  target.style.setProperty('--usage-text', usagePreferences.textSize + 'px');
  target.style.setProperty('--usage-height', usagePreferences.barHeight + 'px');
  target.style.setProperty('--usage-color', usagePreferences.customColor ? usagePreferences.color : 'var(--accent)');
  target.dataset.alerts = String(usagePreferences.alerts);
}
function updateUsagePreview() {
  if (!usageSettings.open) return;
  styleUsage(usagePreview); usagePreview.replaceChildren();
  const meters = node('div', undefined, 'usage-preview-meters');
  for (const [label, value] of [['5 h',72],['7 días',18]]) meters.append(createUsageMeter({label, remainingPercent:value,scope:'account',resetAt:null}));
  usagePreview.append(meters);
}
function createUsageMeter(meter) {
  const row = node('div', undefined, 'usage-meter' + (meter.remainingPercent <= 10 ? ' low' : meter.remainingPercent <= 25 ? ' warning' : ''));
  row.style.setProperty('--usage-percent', meter.remainingPercent + '%');
  const progress = node('progress'); progress.max = 100; progress.value = meter.remainingPercent;
  progress.setAttribute('aria-label', meter.label + ': ' + meter.remainingPercent + '% restante');
  const ring = node('span', undefined, 'usage-ring'); ring.setAttribute('aria-hidden','true');
  row.append(node('span', meter.label), node('strong', meter.remainingPercent.toLocaleString('es-ES') + '% restante'), progress, ring);
  let detail = meter.scope === 'context' ? 'Contexto disponible · no es la cuota del plan' : 'Cuota compartida por la cuenta';
  if (meter.resetAt) detail += ' · Reinicia ' + new Date(meter.resetAt).toLocaleString('es-ES', { day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' });
  if (usagePreferences.details) row.append(node('small', detail));
  return row;
}
function paintUsage(data, session) {
  usageLastPaint = { data, session };
  const strip = $('#ai-usage'); strip.hidden = false;
  strip.dataset.size = usagePreferences.size;
  styleUsage(strip); updateUsagePreview();
  $('#usage-agent').textContent = session.name;
  usageMetadata.replaceChildren();
  if (usagePreferences.model) usageMetadata.append(node('span', 'Modelo: ' + (data.model || 'No facilitado por la herramienta')));
  if (usagePreferences.folder) { const location = node('span', 'Carpeta: ' + session.folder); location.title = session.folder; usageMetadata.append(location); }
  if (usagePreferences.updated) usageMetadata.append(node('span', 'Actualizado: ' + (Number.isFinite(data.updatedAt) ? new Date(data.updatedAt).toLocaleTimeString('es-ES') : 'Sin datos')));
  usageMetadata.hidden = !usageMetadata.children.length;
  $('#usage-note').textContent = session.ended ? 'Sesión finalizada · último dato' : data.note || '';
  const date = Number.isFinite(data.updatedAt) ? new Date(data.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  $('#usage-note').title = (data.note || '') + (date ? ' · Último dato: ' + date : '');
  $('#usage-meters').replaceChildren();
  let shown = 0;
  for (const meter of data.meters || []) {
    if (meter.scope === 'context' && !usagePreferences.context) continue;
    if (meter.resetAt !== null && meter.resetAt <= Date.now()) continue;
    if (typeof meter.remainingPercent !== 'number' || !Number.isFinite(meter.remainingPercent) || meter.remainingPercent < 0 || meter.remainingPercent > 100) continue;
    $('#usage-meters').append(createUsageMeter(meter)); shown++;
  }
  if (!shown) $('#usage-meters').append(node('p', 'Sin datos de cuota disponibles', 'usage-unavailable'));
  if (data.stale || (data.updatedAt && Date.now() - data.updatedAt > 180000)) $('#usage-note').textContent += date ? ' · Último dato ' + date : '';
  $('#usage-refresh').disabled = Boolean(session.ended);
  scheduleTerminalFit();
}
async function refreshUsage(force = false) {
  const version = ++usageRequestVersion, id = active, session = sessions.get(id);
  if (!session || !['codex', 'claude'].includes(session.kind)) { $('#ai-usage').hidden = true; usageDisplay = null; scheduleTerminalFit(); return; }
  if (session.ended) { if (usageDisplay?.id === id) paintUsage(usageDisplay.data, session); else paintUsage({ meters: [], note: 'Sesión finalizada' }, session); return; }
  if (usageDisplay?.id !== id) { usageDisplay = null; paintUsage({ meters: [], note: 'Consultando uso…' }, session); }
  $('#usage-refresh').disabled = true;
  try {
    const data = await window.desktop.usage(id, force);
    if (version !== usageRequestVersion || active !== id || !sessions.has(id)) return;
    usageDisplay = { id, data }; paintUsage(data, session);
  } catch {
    if (version === usageRequestVersion && active === id) paintUsage({ meters: [], note: 'No se pudieron consultar los datos de uso' }, session);
  } finally { if (version === usageRequestVersion && active === id) $('#usage-refresh').disabled = Boolean(session.ended); }
}
$('#usage-refresh').onclick = () => refreshUsage(true);
const usageRefreshTimer = setInterval(() => refreshUsage(), 15000);
refreshUsage();
