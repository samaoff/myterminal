// Pantalla de inicio: proyectos recientes y accesos rápidos en lugar de una terminal vacía.
(() => {
  const welcome = document.getElementById('welcome');
  const openButton = document.getElementById('welcome-open');
  const recents = document.createElement('section');
  recents.className = 'home-recents'; recents.setAttribute('aria-label', 'Proyectos recientes');
  const quick = document.createElement('section');
  quick.className = 'home-quick'; quick.setAttribute('aria-label', 'Abrir una terminal');
  openButton.after(recents, quick);

  const shells = [['codex', 'Codex'], ['claude', 'Claude Code'], ['powershell', 'PowerShell']];

  async function paint() {
    let list = [];
    try { list = (await window.desktop.projects()).slice(0, 4); } catch {}
    const title = document.createElement('h2'); title.textContent = 'Proyectos recientes';
    const grid = document.createElement('div'); grid.className = 'home-grid';
    for (const value of list) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'home-card'; card.title = value;
      const icon = terminalIcon('folder'); icon.classList.add('ic');
      const name = document.createElement('strong'); name.textContent = value.split(/[\\/]/).filter(Boolean).pop() || value;
      const where = document.createElement('small'); where.textContent = value;
      const text = document.createElement('span'); text.append(name, where);
      card.append(icon, text);
      card.onclick = () => chooseFolder(value);
      grid.append(card);
    }
    recents.replaceChildren(...(list.length ? [title, grid] : []));
    openButton.textContent = list.length ? 'Abrir otro proyecto' : 'Abrir mi primer proyecto';

    const heading = document.createElement('h2'); heading.textContent = typeof folder === 'string' && folder ? 'Empezar en ' + folder.split(/[\\/]/).filter(Boolean).pop() : '';
    const row = document.createElement('div'); row.className = 'home-shells';
    for (const [kind, label] of shells) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary';
      const icon = terminalIcon(kind); icon.classList.add('ic'); button.append(icon, document.createTextNode(' ' + label));
      button.onclick = () => launch(kind);
      row.append(button);
    }
    quick.replaceChildren(...(typeof folder === 'string' && folder ? [heading, row] : []));
  }

  // chooseFolder y refreshProjects ya refrescan la lista; se engancha para repintar la portada.
  const originalRefresh = refreshProjects;
  refreshProjects = async function () { const result = await originalRefresh.apply(this, arguments); paint(); return result; };
  paint();
})();
