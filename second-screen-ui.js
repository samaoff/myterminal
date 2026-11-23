// Segunda pantalla (iPad): diálogo de control, indicador en la cabecera y atajos desde la paleta.
(() => {
  const api = window.desktop.secondScreen;
  let state = { running: false, starting: false, urls: [], pin: '', viewer: false, connection: '', device: null, error: '', notice: '', paused: false, fit: 'contain', autoFit: false, virtual: false, sourceId: null };
  let sources = [], selected = null, driverState = 'unknown', busy = false;

  const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const button = (label, className, onclick) => { const b = el('button', className, label); b.type = 'button'; if (onclick) b.onclick = onclick; return b; };

  const dialog = el('dialog'); dialog.id = 'second-screen-dialog'; dialog.setAttribute('aria-labelledby', 'ss-title');
  const heading = el('div', 'panel-heading'); const title = el('strong', '', 'Segunda pantalla'); title.id = 'ss-title';
  const closeButton = button('Cerrar ×', '', () => dialog.close()); closeButton.id = 'ss-close';
  heading.append(title, closeButton);
  const body = el('div', 'ss-body');
  dialog.append(heading, body);
  document.body.append(dialog);

  // Indicador en la cabecera mientras se transmite
  const actions = document.querySelector('main > header .header-actions');
  const indicator = el('button', 'secondary ss-indicator'); indicator.type = 'button'; indicator.id = 'ss-indicator'; indicator.hidden = true;
  indicator.setAttribute('aria-label', 'Segunda pantalla activa. Abrir los controles.');
  const dot = el('i', 'ss-dot'); const indicatorText = el('span', '', 'Pantalla'); indicator.append(dot, indicatorText);
  if (actions) actions.prepend(indicator);
  indicator.onclick = () => open();
  const toolButton = document.getElementById('second-screen-open');
  if (toolButton) toolButton.onclick = () => open();

  const sizeText = device => device ? device.width + ' × ' + device.height + ' · ' + (device.width >= device.height ? 'Horizontal' : 'Vertical') : '';
  const chosen = () => sources.find(source => source.id === selected) || null;

  async function run(action, fallbackMessage) {
    if (busy) return;
    busy = true; paint();
    try { await action(); } catch (error) { state = { ...state, error: error.message || fallbackMessage }; }
    busy = false; paint(); paintIndicator();
  }

  // Un solo paso: prepara la pantalla virtual, la envía al dispositivo y, al conectarse, pasa el terminal a pantalla completa en ella.
  let moveOnConnect = false;
  async function createVirtual() {
    if (driverState !== 'ready') driverState = await api.driverInstall();
    if (driverState !== 'ready') throw new Error('La pantalla virtual no se ha activado. Si Windows lo pide, reinicia el equipo y vuelve a intentarlo.');
    let virtual = null;
    for (let attempt = 0; attempt < 15 && !virtual; attempt++) {
      sources = await api.sources();
      virtual = sources.find(source => source.virtual || source.labelVirtual);
      if (!virtual) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!virtual) throw new Error('Windows todavía no muestra la pantalla virtual. Abre «Configurar pantallas de Windows», elige «Extender estas pantallas» y pulsa de nuevo.');
    selected = virtual.id;
    await api.autoFit(true);
    state = await api.start(virtual.id);
    moveOnConnect = true;
    state = { ...state, notice: 'Pantalla virtual lista. Conecta el dispositivo con el QR: el terminal pasará a pantalla completa en ella en cuanto se conecte.' };
  }
  async function moveTerminalToVirtual() {
    moveOnConnect = false;
    const list = await api.sources();
    const display = list.find(source => source.id === state.sourceId) || list.find(source => source.virtual || source.labelVirtual);
    if (display?.displayId != null && window.externalDisplay) { if (dialog.open) dialog.close(); await window.externalDisplay.enter(display.displayId); }
  }

  function paintIndicator() {
    indicator.hidden = !state.running;
    dot.className = 'ss-dot' + (state.viewer ? ' live' : '') + (state.paused ? ' paused' : '');
    indicatorText.textContent = state.paused ? 'Pantalla · en pausa' : state.viewer ? 'Pantalla conectada' : 'Pantalla: esperando';
  }

  function sourceCard(source) {
    const card = el('button', 'ss-source' + (source.id === selected ? ' selected' : '')); card.type = 'button'; card.dataset.source = source.id;
    card.setAttribute('aria-pressed', String(source.id === selected));
    card.disabled = state.running;
    const image = el('img'); image.src = source.thumbnail; image.alt = '';
    const label = el('span', 'ss-source-name', source.name);
    const meta = el('small', '', source.size + (source.kind === 'window' ? ' · solo el terminal' : ''));
    const tags = el('span', 'ss-tags');
    if (source.virtual || source.labelVirtual) tags.append(el('span', 'tag virtual', 'Virtual'));
    if (source.primary) tags.append(el('span', 'tag', 'Principal'));
    card.append(image, label, meta, tags);
    card.onclick = () => { selected = source.id; paint(); };
    return card;
  }

  function paint() {
    const running = state.running;
    const current = chosen();
    const section = (heading2, ...children) => { const wrap = el('section', 'ss-section'); wrap.append(el('h3', '', heading2), ...children); return wrap; };

    const intro = el('p', 'ss-intro', 'Convierte una tableta, un móvil u otro PC en una pantalla para el terminal. Por la red local se envía la imagen de la ventana de MyTerminal o de una pantalla de Windows, y el dispositivo la muestra en su navegador. Sin cuentas ni servicios externos.');

    const grid = el('div', 'ss-sources'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Qué enviar al dispositivo');
    for (const source of sources) grid.append(sourceCard(source));
    const refresh = button('Actualizar', 'secondary', () => load()); refresh.id = 'ss-refresh'; refresh.disabled = busy;
    const sourceSection = section('1. Qué enviar', grid, refresh);
    if (sources.length < 2) sourceSection.append(el('p', 'ss-hint', 'Solo hay una pantalla. Con la pantalla virtual puedes ampliar el escritorio al dispositivo.'));

    const quick = button(running ? 'Pantalla virtual activa' : driverState === 'ready' ? 'Crear pantalla virtual y enviar el terminal' : 'Instalar pantalla virtual y enviar el terminal', 'primary', () => run(createVirtual, 'No se pudo crear la pantalla virtual.'));
    quick.id = 'ss-create-virtual'; quick.disabled = busy || running;
    const quickBox = el('div', 'ss-quick'); quickBox.append(quick, el('p', 'ss-hint', 'Crea un monitor virtual (Windows pedirá permisos de administrador solo la primera vez), lo conecta al dispositivo y lleva el terminal a pantalla completa en él. Después puedes arrastrar también otras ventanas.'));
    // Pantalla virtual
    const driverBox = el('div', 'ss-driver');
    const driverText = el('p', 'ss-hint', driverState === 'ready' ? 'Pantalla virtual instalada. En Windows elige «Extender» y coloca el monitor adicional junto a los tuyos.' : driverState === 'disabled' ? 'La pantalla virtual está instalada pero desactivada. Pulsa «Preparar pantalla virtual» para activarla.' : driverState === 'missing' ? 'Sin pantalla virtual todavía. Puedes enviar esta ventana al dispositivo sin instalar nada, o preparar una pantalla virtual (Windows pedirá permisos de administrador).' : 'Comprobando la pantalla virtual…');
    const prepare = button(driverState === 'ready' ? 'Comprobar pantalla virtual' : 'Preparar pantalla virtual', 'secondary', () => run(async () => { driverState = await api.driverInstall(); await load(); }, 'No se pudo preparar la pantalla virtual.'));
    prepare.id = 'ss-driver'; prepare.disabled = busy || running;
    const settings = button('Configurar pantallas de Windows', 'secondary', () => window.desktop.openDisplaySettings?.()); settings.id = 'ss-settings'; settings.hidden = driverState !== 'ready' || !window.desktop.openDisplaySettings;
    const remove = button('Quitar pantalla virtual', 'secondary', () => { if (confirm('Se quitará la pantalla virtual que instaló MyTerminal. Windows pedirá permisos de administrador. ¿Continuar?')) run(async () => { driverState = await api.driverUninstall(); await load(); }, 'No se pudo quitar la pantalla virtual.'); });
    remove.id = 'ss-driver-remove'; remove.hidden = driverState === 'missing' || driverState === 'unknown'; remove.disabled = busy;
    driverBox.append(driverText, prepare, settings, remove);
    sourceSection.append(driverBox);

    // Conexión
    const connect = section('2. Conecta el dispositivo');
    if (running && state.urls.length) {
      connect.append(el('p', 'ss-hint', 'Escanea el QR con la cámara del dispositivo (iPad, tableta, móvil u otro PC) y abre el enlace en su navegador. Los dos deben estar en el mismo router.'));
      state.urls.forEach((entry, index) => {
        const block = el('div', 'ss-connection' + (index ? ' secondary' : ''));
        const qr = el('img'); qr.src = entry.qr; qr.alt = 'Código QR para conectar el dispositivo'; qr.width = 160; qr.height = 160;
        const info = el('div', 'ss-connection-info');
        info.append(el('p', '', 'O escribe esta dirección en Safari:'), el('strong', 'ss-url', entry.url), el('p', '', 'Código:'), el('strong', 'ss-pin', state.pin));
        block.append(qr, info); connect.append(block);
      });
    } else connect.append(el('p', 'ss-hint', running ? 'No se detecta ninguna red local. Conecta el PC al router.' : 'Al iniciar aparecerá el código QR, la dirección y un código de seis cifras.'));

    // Estado y controles
    const live = el('p', 'ss-status'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    live.textContent = state.error || state.notice || (running ? (state.viewer ? 'Pantalla conectada' + (state.connection ? ' · ' + state.connection : '') + (state.width ? ' · ' + state.width + ' × ' + state.height : '') : 'Transmitiendo. Abre el enlace en el dispositivo.') : state.starting ? 'Preparando…' : 'Listo para empezar');
    if (state.error) live.classList.add('error');
    const device = el('p', 'ss-device', state.device ? 'Dispositivo: ' + sizeText(state.device) : '');
    const start = button(running ? 'Detener la transmisión' : 'Iniciar la transmisión', running ? 'secondary' : 'primary', () => run(async () => { state = running ? await api.stop() : await api.start(selected); if (!running) { sources = await api.sources(); } }, 'No se pudo iniciar.'));
    start.id = 'ss-start'; start.disabled = busy || (!running && !current);
    const pause = button(state.paused ? 'Reanudar la imagen' : 'Pausar la imagen', 'secondary', () => run(async () => { state = await api.pause(!state.paused); }, 'No se pudo cambiar.')); pause.id = 'ss-pause'; pause.disabled = busy || !running;

    const fitLabel = el('label', 'ss-field'); fitLabel.append('Imagen en el dispositivo ');
    const fit = el('select'); fit.id = 'ss-fit';
    for (const [value, text] of [['contain', 'Mostrar todo sin deformar'], ['cover', 'Rellenar recortando los bordes']]) { const option = el('option', '', text); option.value = value; fit.append(option); }
    fit.value = state.fit; fit.onchange = () => run(async () => { state = await api.fit(fit.value); }, 'No se pudo cambiar.'); fitLabel.append(fit);

    const controls = section('3. Transmitir', live, device, el('div', 'ss-buttons'), fitLabel);
    controls.querySelector('.ss-buttons').append(start, pause);

    // Resolución (solo pantallas virtuales)
    const target = running ? { virtual: state.virtual, modes: (sources.find(source => source.id === state.sourceId) || {}).modes || [], width: 0, height: 0 } : current;
    const resolution = el('div', 'ss-resolution');
    if (target?.virtual) {
      resolution.append(el('h4', '', 'Tamaño de la pantalla virtual'));
      const select = el('select'); select.id = 'ss-resolution'; select.setAttribute('aria-label', 'Resolución de la pantalla virtual');
      const currentSource = sources.find(source => source.id === (running ? state.sourceId : selected));
      for (const mode of currentSource?.modes || []) { const option = el('option', '', mode.width + ' × ' + mode.height); option.value = mode.width + 'x' + mode.height; option.selected = currentSource.width === mode.width && currentSource.height === mode.height; select.append(option); }
      select.disabled = busy;
      const apply = button('Aplicar', 'secondary', () => run(async () => { const [w, h] = select.value.split('x').map(Number); state = await api.resolution(w, h); sources = await api.sources(); }, 'No se pudo ajustar.')); apply.id = 'ss-apply'; apply.disabled = busy || !running;
      const fitDevice = button('Ajustar al dispositivo', 'secondary', () => run(async () => { state = await api.fitDevice(); sources = await api.sources(); }, 'No se pudo ajustar.')); fitDevice.id = 'ss-fit-device'; fitDevice.disabled = busy || !running || !state.device;
      const auto = el('label', 'ss-check'); const autoInput = el('input'); autoInput.type = 'checkbox'; autoInput.id = 'ss-auto'; autoInput.checked = state.autoFit; autoInput.onchange = () => run(async () => { state = await api.autoFit(autoInput.checked); sources = await api.sources(); }, 'No se pudo cambiar.'); auto.append(autoInput, document.createTextNode(' Ajustar automáticamente al conectar o girar el dispositivo'));
      resolution.append(select, apply, fitDevice, auto);
      const external = button('Enviar el terminal a esta pantalla', 'secondary', async () => { const display = sources.find(source => source.id === (running ? state.sourceId : selected)); if (display?.displayId != null && window.externalDisplay) { dialog.close(); await window.externalDisplay.enter(display.displayId); } }); external.id = 'ss-external';
      resolution.append(external);
    }
    controls.append(resolution);

    const warning = el('p', 'ss-warning', 'Lo que se vea en la ventana o pantalla elegida lo verá el dispositivo conectado, incluidos datos sensibles del terminal. Usa «Pausar la imagen» cuando lo necesites. La página y el emparejado usan solo redes privadas; el vídeo va cifrado.');
    body.replaceChildren(intro, quickBox, sourceSection, connect, controls, warning);
  }

  async function load() {
    try {
      state = await api.state();
      sources = await api.sources();
      if (!selected || !sources.some(source => source.id === selected)) selected = state.sourceId || sources[0]?.id || null;
    } catch (error) { state = { ...state, error: error.message }; }
    try { driverState = await api.driverStatus(); } catch { driverState = 'unknown'; }
    paint(); paintIndicator();
  }
  async function open() { await load(); if (!dialog.open) dialog.showModal(); }

  closeButton.onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  api.onEvent(next => { const joined = next.viewer && !state.viewer; state = next; if (joined && moveOnConnect) moveTerminalToVirtual().catch(() => {}); paintIndicator(); if (dialog.open) paint(); });
  api.state().then(next => { state = next; paintIndicator(); }).catch(() => {});

  window.secondScreen = { open, isRunning: () => state.running, stop: () => api.stop().then(next => { state = next; paintIndicator(); }), togglePause: () => api.pause(!state.paused).then(next => { state = next; paintIndicator(); }), state: () => state };
})();
