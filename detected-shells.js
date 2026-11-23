// Shells detectados (PowerShell 7, cmd, Git Bash y WSL) como accesos en la sección Terminales.
(async () => {
  const list = document.getElementById('custom-terminals');
  if (!list || typeof window.desktop.detectedShells !== 'function') return;
  let shells = [];
  try { shells = await window.desktop.detectedShells(); } catch { return; }
  if (!Array.isArray(shells) || !shells.length) return;

  const group = document.createElement('div');
  group.id = 'detected-shells'; group.className = 'detected-shells';
  const title = document.createElement('div');
  title.className = 'detected-title'; title.textContent = 'Shells detectados';
  group.append(title);
  for (const shell of shells) {
    const start = document.createElement('button');
    start.type = 'button'; start.className = 'launch'; start.dataset.profile = shell.id; start.disabled = !folder;
    const label = document.createElement('span'); label.className = 'terminal-label'; label.textContent = shell.name;
    start.append(terminalIcon(shell.icon), label);
    start.title = shell.name + ' · ' + shell.command;
    start.onclick = () => launch(shell.id);
    group.append(start);
  }
  list.after(group);
  window.detectedShellList = shells;
})();
