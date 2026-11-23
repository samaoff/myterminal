// Ventana oculta que captura la pantalla o la ventana elegida y la envía al dispositivo por WebRTC.
(() => {
  let stream = null, peer = null, ready = false, pendingIce = [], fit = 'contain', paused = false, capture = null;
  const send = message => hostApp.send(message);
  const signal = message => send({ type: 'signal', message });
  const report = (state, detail = {}) => send({ type: 'status', state, ...detail });

  function applyPause() { if (stream) for (const track of stream.getTracks()) track.enabled = !paused; }

  async function offer() {
    if (!stream || !ready) return;
    if (peer) peer.close();
    pendingIce = [];
    peer = new RTCPeerConnection({ iceServers: [] });
    const current = peer;
    for (const track of stream.getTracks()) { track.contentHint = 'detail'; peer.addTrack(track, stream); }
    for (const sender of peer.getSenders()) {
      if (sender.track?.kind === 'video') {
        const parameters = sender.getParameters();
        parameters.degradationPreference = 'maintain-resolution';
        if (parameters.encodings?.length) parameters.encodings[0].maxBitrate = 12000000;
        await sender.setParameters(parameters);
      }
    }
    peer.onicecandidate = event => { if (event.candidate) signal({ type: 'ice', candidate: event.candidate.toJSON() }); };
    peer.onconnectionstatechange = () => {
      if (current !== peer) return;
      const settings = stream?.getVideoTracks()[0]?.getSettings();
      report('peer', { connection: peer.connectionState, width: settings?.width || 0, height: settings?.height || 0 });
    };
    await peer.setLocalDescription(await peer.createOffer());
    signal({ type: 'offer', description: peer.localDescription.toJSON() });
    signal({ type: 'fit', value: fit });
    if (paused) signal({ type: 'paused', value: true });
    report('connecting');
  }

  async function startCapture(command) {
    stopCapture(false);
    capture = { width: command.width, height: command.height };
    stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { width: { max: command.width }, height: { max: command.height }, frameRate: { max: 30 } } });
    for (const track of stream.getVideoTracks()) track.onended = () => { stopCapture(true); send({ type: 'ended' }); };
    applyPause();
    const settings = stream.getVideoTracks()[0]?.getSettings();
    report('capturing', { width: settings?.width || 0, height: settings?.height || 0 });
    await offer();
  }

  function stopCapture(notifyViewer) {
    if (stream) { for (const track of stream.getTracks()) { track.onended = null; track.stop(); } }
    stream = null;
    if (peer) { peer.close(); peer = null; }
    pendingIce = [];
    if (notifyViewer) signal({ type: 'stopped' });
    report('stopped');
  }

  async function handleViewer(message) {
    if (message.type === 'ready') { ready = true; await offer(); }
    if (message.type === 'answer' && peer) {
      await peer.setRemoteDescription(message.description);
      for (const candidate of pendingIce) await peer.addIceCandidate(candidate);
      pendingIce = [];
    }
    if (message.type === 'ice' && peer) { if (peer.remoteDescription) await peer.addIceCandidate(message.candidate); else pendingIce.push(message.candidate); }
    if (message.type === 'bye') { ready = false; if (peer) { peer.close(); peer = null; } report('viewer-left'); }
  }

  hostApp.onCommand(async command => {
    try {
      if (command.type === 'start') await startCapture(command);
      else if (command.type === 'restart' && capture) await startCapture(capture);
      else if (command.type === 'signal') await handleViewer(command.message);
      else if (command.type === 'stop') stopCapture(true);
      else if (command.type === 'fit') { fit = command.value === 'cover' ? 'cover' : 'contain'; signal({ type: 'fit', value: fit }); }
      else if (command.type === 'pause') { paused = Boolean(command.value); applyPause(); signal({ type: 'paused', value: paused }); report('paused', { paused }); }
    } catch (error) { send({ type: 'error', message: error.message }); }
  });
  send({ type: 'host-ready' });
})();
