// Barra lateral agrupada: quita las flechas de texto de los recientes y separa «Remoto» de «Herramientas».
(() => {
  const recent = document.getElementById('recent');
  if (recent) {
    const clean = () => {
      for (const button of recent.querySelectorAll('.recent')) {
        if (button.textContent.startsWith('▸ ')) button.textContent = button.textContent.slice(2);
      }
    };
    new MutationObserver(clean).observe(recent, { childList: true, subtree: true });
    clean();
  }

  // El acceso a conexiones deja de ser una herramienta más y forma el grupo «Remoto».
  const connections = [...document.querySelectorAll('#fixed-tools .tool-buttons button')].find(button => /conexiones/i.test(button.textContent));
  const scroll = document.querySelector('#sidebar .sidebar-scroll');
  if (connections && scroll) {
    const group = document.createElement('section');
    group.className = 'sidebar-group';
    const title = document.createElement('div');
    title.className = 'fixed-tools-title'; title.textContent = 'Remoto';
    const buttons = document.createElement('div');
    buttons.className = 'tool-buttons';
    const list = document.createElement('div');
    list.className = 'remote-list'; list.setAttribute('aria-label', 'Conexiones guardadas');
    buttons.append(connections);
    group.append(title, list, buttons);
    scroll.append(group);

    // Las conexiones guardadas aparecen como filas con su tipo (SSH, SFTP o RDP).
    const paint = () => {
      const saved = typeof savedRemoteConnections !== 'undefined' ? savedRemoteConnections : [];
      list.replaceChildren(...saved.slice(0, 6).map(entry => {
        const kind = ['ssh', 'sftp', 'rdp'].includes(entry.protocol) ? entry.protocol : 'ssh';
        const row = document.createElement('button'); row.type = 'button'; row.className = 'remote-item'; row.title = entry.host || '';
        const name = document.createElement('span'); name.className = 'remote-name'; name.textContent = entry.name || entry.host;
        const label = document.createElement('span'); label.className = 'remote-kind'; label.textContent = kind.toUpperCase();
        row.append(terminalIcon(kind), name, label);
        row.onclick = () => connectRemote(entry);
        return row;
      }));
    };
    window.paintRemoteGroup = paint;
    if (typeof refreshRemoteConnections === 'function') {
      const original = refreshRemoteConnections;
      refreshRemoteConnections = async function () { const result = await original.apply(this, arguments); paint(); return result; };
    }
    paint();
  }
})();
