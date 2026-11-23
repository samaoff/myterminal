// Modo pantalla externa: lleva el terminal a otro monitor (por ejemplo el iPad con «Al lado») en pantalla completa y permite volver.
(() => {
  const storeKey = 'samaapp.external';
  const fontBoost = 3;
  let options = { bigFont: true, hideSidebar: true };
  try { options = { ...options, ...JSON.parse(uiStorage.getItem(storeKey)) }; } catch {}
  let state = { displays: [], active: false, displayId: null, alLado: false };
  let originalFont = null;

  const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const saveOptions = () => { try { uiStorage.setItem(storeKey, JSON.stringify(options)); } catch {} };

  // Diálogo
  const dialog = el('dialog'); dialog.id = 'external-dialog'; dialog.setAttribute('aria-labelledby', 'external-title');
  const closeButton = el('button', '', 'Cerrar ×'); closeButton.type = 'button'; closeButton.id = 'external-close';
  const heading = el('div', 'panel-heading'); const title = el('strong', '', 'Pantalla externa'); title.id = 'external-title'; heading.append(title, closeButton);
  const intro = el('p', 'external-intro', 'Lleva el terminal a otro monitor en pantalla completa, con la letra más grande y sin la barra lateral. Con «Al lado» puedes usar el iPad como segunda pantalla de Windows.');
  const list = el('div', 'external-list');
  const options1 = el('label', 'external-option'); const bigInput = el('input'); bigInput.type = 'checkbox'; bigInput.id = 'external-big'; options1.append(bigInput, document.createTextNode(' Letra más grande (+' + fontBoost + ')'));
  const options2 = el('label', 'external-option'); const sidebarInput = el('input'); sidebarInput.type = 'checkbox'; sidebarInput.id = 'external-sidebar'; options2.append(sidebarInput, document.createTextNode(' Ocultar la barra lateral'));
  const alLadoBox = el('div', 'external-allado');
  const message = el('p', 'external-message'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const body = el('div', 'external-body'); body.append(intro, list, options1, options2, alLadoBox, message);
  dialog.append(heading, body);
  document.body.append(dialog);

  // Botón de salida visible solo en este modo
  const actions = document.querySelector('main > header .header-actions');
  const exitButton = el('button', 'secondary external-exit', 'Salir de la pantalla externa'); exitButton.type = 'button'; exitButton.id = 'external-exit';
  exitButton.title = 'Volver el terminal a la pantalla anterior';
  if (actions) actions.prepend(exitButton);

  const refit = () => { if (typeof scheduleTerminalFit === 'function') scheduleTerminalFit(); };
  function applyLayout() {
    const body = document.body;
    body.classList.toggle('external-mode', state.active);
    body.classList.toggle('external-hide-sidebar', state.active && options.hideSidebar);
    exitButton.hidden = !state.active;
    // La letra crece mientras dura el modo y vuelve a su valor original al salir; no se guarda en las preferencias.
    if (state.active && options.bigFont && originalFont === null) {
      originalFont = terminalPreferences.fontSize;
      terminalPreferences.fontSize = Math.min(32, originalFont + fontBoost);
      applyTerminalPreferences();
    } else if ((!state.active || !options.bigFont) && originalFont !== null) {
      if (terminalPreferences.fontSize === Math.min(32, originalFont + fontBoost)) terminalPreferences.fontSize = originalFont;
      originalFont = null;
      applyTerminalPreferences();
    }
    refit();
  }

  function paint() {
    bigInput.checked = options.bigFont; sidebarInput.checked = options.hideSidebar;
    const rows = state.displays.map(display => {
      const row = el('div', 'external-row'); row.dataset.display = String(display.id);
      const info = el('div', 'external-info');
      const name = el('strong', '', display.name);
      const detail = el('small', '', display.width + ' × ' + display.height);
      info.append(name, detail);
      const tags = el('div', 'external-tags');
      if (display.primary) tags.append(el('span', 'tag', 'Principal'));
      if (display.virtual) tags.append(el('span', 'tag virtual', 'Virtual · Al lado'));
      if (display.current) tags.append(el('span', 'tag current', 'Terminal aquí'));
      const go = el('button', display.current && state.active ? 'secondary' : 'primary', display.current && state.active ? 'Volver a la pantalla anterior' : display.current ? 'Pantalla completa aquí' : 'Enviar el terminal aquí');
      go.type = 'button'; go.className += ' external-go';
      go.onclick = () => (display.current && state.active ? leave() : enter(display.id));
      row.append(info, tags, go);
      return row;
    });
    const others = state.displays.filter(display => !display.current);
    list.replaceChildren(...rows);
    if (!others.length) list.append(el('p', 'external-empty', 'No hay otra pantalla conectada. Abre «Al lado», crea el monitor virtual y conecta el iPad; después pulsa «Actualizar».'));
    alLadoBox.replaceChildren();
    const status = el('p', 'external-allado-status', state.alLado ? 'Al lado está instalado en este equipo.' : 'No encuentro Al lado. Si ya lo tienes instalado, indica su ruta.');
    const open = el('button', 'secondary', 'Abrir Al lado'); open.type = 'button'; open.id = 'external-launch'; open.disabled = !state.alLado; open.onclick = launch;
    const pick = el('button', 'secondary', 'Elegir Al lado.exe…'); pick.type = 'button'; pick.id = 'external-pick'; pick.onclick = choose;
    const refresh = el('button', 'secondary', 'Actualizar'); refresh.type = 'button'; refresh.id = 'external-refresh'; refresh.onclick = () => load(true);
    const row = el('div', 'external-buttons'); row.append(open, pick, refresh);
    alLadoBox.append(status, row);
  }

  async function load(announce) {
    try { state = await window.desktop.externalState(); } catch (error) { message.textContent = error.message; return; }
    applyLayout(); paint();
    if (announce) message.textContent = state.displays.length + (state.displays.length === 1 ? ' pantalla detectada.' : ' pantallas detectadas.');
  }
  async function enter(displayId) {
    message.textContent = 'Moviendo el terminal…';
    try {
      state = await window.desktop.externalEnter(displayId);
      applyLayout(); paint();
      dialog.close();
      status('Terminal en la pantalla externa. Pulsa «Salir de la pantalla externa» o Ctrl+Mayús+X para volver.');
    } catch (error) { message.textContent = error.message; }
  }
  async function leave() {
    try { state = await window.desktop.externalExit(); applyLayout(); paint(); status('Terminal de vuelta en la pantalla anterior.'); }
    catch (error) { status(error.message); }
  }
  async function launch() {
    const result = await window.desktop.externalLaunch();
    message.textContent = result.ok ? 'Abriendo Al lado… Crea o selecciona el monitor virtual y conecta el iPad; después pulsa «Actualizar».' : 'No se encontró Al lado.';
  }
  async function choose() {
    const result = await window.desktop.externalPick();
    if (result.ok) { await load(false); message.textContent = 'Ruta de Al lado guardada.'; }
  }
  async function open() { await load(false); message.textContent = ''; if (!dialog.open) dialog.showModal(); }
  // Atajo: con una sola pantalla extra la usa directamente; si hay varias o ninguna, abre el diálogo.
  async function toggle() {
    await load(false);
    if (state.active) { await leave(); return; }
    const others = state.displays.filter(display => !display.current);
    if (others.length === 1) await enter(others[0].id); else await open();
  }

  bigInput.onchange = () => { options.bigFont = bigInput.checked; saveOptions(); applyLayout(); };
  sidebarInput.onchange = () => { options.hideSidebar = sidebarInput.checked; saveOptions(); applyLayout(); };
  closeButton.onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  exitButton.onclick = leave;
  window.desktop.onExternalMode(next => { state = next; applyLayout(); paint(); if (!next.active) status('Terminal de vuelta en la pantalla anterior.'); });

  window.externalDisplay = { open, toggle, enter, leave, isActive: () => state.active, refresh: () => load(false) };
  load(false);
})();
