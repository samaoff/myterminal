module.exports = {
  appId: 'local.ai-terminal-pro.desktop', productName: 'MyTerminal',
  directories: { output: 'dist-pro', buildResources: 'build' },
  files: ['main.js', 'preload.js', 'renderer.js', 'themes.js', 'terminal-icons.js', 'terminal-profiles.js', 'custom-terminals.js', 'about.js', 'releases.json', 'terminal-settings.js', 'sidebar.js', 'usage-ui.js', 'ai-usage.js', 'usage-statusline.ps1', 'panels.js', 'features.js', 'project-tools.js', 'index.html', '*.css', 'build/icon.ico', 'package.json', 'README.md'],
  asarUnpack: ['node_modules/node-pty/**'],
  extraResources: [{from:require('./build-rdp-host.cjs').buildRdpHost(),to:'rdp-host.exe'}],
  npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.ico', signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'MyTerminal', installerLanguages: ['es_ES'], runAfterFinish: false, artifactName: 'MyTerminal-Setup-${version}.${ext}' }
};
module.exports.files.push('recent-projects.cjs');
module.exports.files.push('user-profiles.cjs', 'user-profiles-ui.js');
module.exports.files.push('remote-connections.cjs', 'remote-connections-ui.js');
module.exports.files.push('rdp-sessions.cjs','rdp-ui.js');
module.exports.files.push('workspace-enhancements.js');
module.exports.files.push('app-updates.cjs', 'updates-ui.js');

module.exports.files.push('fonts/**');
module.exports.files.push('sftp-browser.cjs', 'sftp-browser-ui.js', 'session-tools.js');
module.exports.files.push('terminal-search.js', 'shell-history.ps1');
module.exports.extraResources.push({ from: 'vendor/PSReadLine', to: 'vendor/PSReadLine' });
module.exports.files.push('design-gallery.js');
module.exports.files.push('shell-status.js');
module.exports.files.push('welcome-home.js');
module.exports.files.push('command-blocks.js');
module.exports.files.push('diff-dock.js');
module.exports.files.push('sidebar-groups.js');
module.exports.files.push('quota-card.js');
module.exports.files.push('shell-detect.cjs', 'detected-shells.js');
module.exports.files.push('command-palette.js');
module.exports.files.push('shortcuts.js');
module.exports.files.push('session-restore.js');
module.exports.files.push('pane-header.js');
module.exports.files.push('session-list.js', 'header-actions.js');
module.exports.files.push('security.cjs');
module.exports.files.push('gpu-render.js');
module.exports.files.push('background-mode.js');
module.exports.files.push('external-display.cjs', 'external-display.js');
// Segunda pantalla: la página del iPad, la captura y el servicio van en la aplicación; el controlador va fuera del asar.
module.exports.files.push('second-screen/**', '!second-screen/driver/**', '!second-screen/*.test.cjs', 'second-screen-ui.js');
module.exports.asarUnpack.push('second-screen/set-resolution.ps1');
module.exports.extraResources.push({ from: 'second-screen/driver', to: 'driver' });
