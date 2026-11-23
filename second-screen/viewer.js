// Página del dispositivo: se empareja con el PC, recibe el vídeo por WebRTC y mantiene la conexión con espera larga.
(() => {
  const $ = selector => document.querySelector(selector);
  const status = text => { $('#status').textContent = text; };
  const savedKey = 'pro-screen-token';
  let token = location.hash.slice(1);
  try { if (token) sessionStorage.setItem(savedKey, token); else token = sessionStorage.getItem(savedKey) || ''; } catch {}
  history.replaceState(null, '', location.pathname);
  const client = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  let running = false, peer = null, pending = [], controller = null, wakeLock = null, lastDevice = '', resizeTimer = 0;
  $('#pair').hidden = Boolean(token);

  async function api(message, signal) {
    const response = await fetch('/api/signals', {
      method: message ? 'POST' : 'GET', signal,
      headers: { Authorization: 'Bearer ' + token, 'X-Client-Id': client, ...(message ? { 'Content-Type': 'application/json' } : {}) },
      body: message ? JSON.stringify(message) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'No se pudo conectar'); error.status = response.status; throw error; }
    return data;
  }

  async function reportDevice() {
    const message = { type: 'device', width: Math.round(innerWidth), height: Math.round(innerHeight), dpr: Math.max(1, Math.min(4, devicePixelRatio || 1)) };
    const key = JSON.stringify(message);
    if (key === lastDevice) return;
    await api(message);
    lastDevice = key;
  }
  const scheduleReport = () => { clearTimeout(resizeTimer); if (running) resizeTimer = setTimeout(() => reportDevice().catch(error => status(error.message)), 800); };
  addEventListener('resize', scheduleReport);
  addEventListener('orientationchange', scheduleReport);

  // La pantalla del dispositivo no se apaga mientras se ve el terminal (si el navegador lo permite).
  async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.body.classList.contains('playing')) keepAwake(); });

  function reset() {
    if (peer) { peer.close(); peer = null; }
    pending = [];
    $('#video').srcObject = null;
    $('#paused').hidden = true;
    document.body.classList.remove('playing');
    $('#disconnect').hidden = true;
    try { wakeLock?.release(); } catch {}
    wakeLock = null;
  }

  async function handle(message) {
    if (message.type === 'fit') document.body.classList.toggle('fill', message.value === 'cover');
    if (message.type === 'paused') $('#paused').hidden = !message.value;
    if (message.type === 'stopped') { reset(); status('Transmisión detenida en el PC. Puedes iniciarla de nuevo allí.'); }
    if (message.type === 'offer') {
      const early = pending;
      reset(); pending = early;
      peer = new RTCPeerConnection({ iceServers: [] });
      const current = peer;
      peer.onicecandidate = event => { if (event.candidate) api({ type: 'ice', candidate: event.candidate.toJSON() }).catch(error => status(error.message)); };
      peer.ontrack = event => {
        $('#video').srcObject = event.streams[0];
        $('#video').play().then(() => { document.body.classList.add('playing'); $('#disconnect').hidden = false; keepAwake(); }).catch(() => status('Pulsa Conectar para reproducir'));
      };
      peer.onconnectionstatechange = () => {
        if (current !== peer) return;
        if (['failed', 'disconnected'].includes(peer.connectionState)) { document.body.classList.remove('playing'); status('Se ha perdido la conexión. Pulsa Conectar para reintentar.'); }
      };
      await peer.setRemoteDescription(message.description);
      for (const candidate of pending) await peer.addIceCandidate(candidate);
      pending = [];
      await peer.setLocalDescription(await peer.createAnswer());
      await api({ type: 'answer', description: peer.localDescription.toJSON() });
    }
    if (message.type === 'ice') { if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate); else pending.push(message.candidate); }
  }

  // Espera larga: el PC contesta en cuanto hay algo que contar o a los 25 segundos.
  async function poll() {
    let failures = 0;
    while (running) {
      controller = new AbortController();
      try {
        const messages = await api(null, controller.signal);
        failures = 0;
        for (const message of messages) await handle(message);
      } catch (error) {
        if (!running) return;
        if (error.status === 401 || error.status === 409) { running = false; reset(); if (error.status === 401) { token = ''; try { sessionStorage.removeItem(savedKey); } catch {} $('#pair').hidden = false; } status(error.message); return; }
        failures++;
        if (failures > 20) { running = false; reset(); status('No se puede contactar con el PC. Comprueba que la aplicación sigue abierta y pulsa Conectar.'); return; }
        status('Reconectando…');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  $('#connect').onclick = async () => {
    running = false; controller?.abort(); reset();
    try {
      if (!token) {
        const response = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('#pin').value.trim() }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo conectar');
        token = data.token;
        try { sessionStorage.setItem(savedKey, token); } catch {}
        $('#pair').hidden = true;
      }
      lastDevice = '';
      await reportDevice();
      await api({ type: 'ready' });
      running = true;
      status('Esperando la transmisión del PC…');
      poll();
    } catch (error) {
      if (error.message.includes('Enlace no válido')) { token = ''; $('#pair').hidden = false; try { sessionStorage.removeItem(savedKey); } catch {} }
      status(error.message);
    }
  };
  $('#disconnect').onclick = () => { running = false; controller?.abort(); api({ type: 'bye' }).catch(() => {}); reset(); status('Desconectado'); };
  $('#fullscreen').onclick = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) element.requestFullscreen().catch(() => status('Añade esta página a la pantalla de inicio para verla completa.'));
    else status('En Safari, usa Compartir → Añadir a pantalla de inicio para ocultar las barras.');
  };
  // Con un enlace con código (QR) se conecta solo.
  if (token) $('#connect').click();
})();
