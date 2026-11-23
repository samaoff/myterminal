// Dos grupos: el proceso principal (Node) y los scripts de la ventana (navegador, globales compartidas entre archivos).
const js = require('@eslint/js');
const globals = require('globals');

const nodeFiles = ['main.js', 'preload.js', 'project-tools.js', 'ai-usage.js', 'terminal-profiles.js', 'smoke*.js', '*.test.js', '**/*.cjs', 'scripts/**/*.cjs', 'build-icon.ps1'].filter(file => !file.endsWith('.ps1'));
const rendererFiles = ['renderer.js', 'panels.js', 'features.js', 'themes.js', 'sidebar.js', 'usage-ui.js', 'terminal-settings.js', 'about.js', 'terminal-icons.js', 'custom-terminals.js',
  'user-profiles-ui.js', 'remote-connections-ui.js', 'rdp-ui.js', 'terminal-search.js', 'workspace-enhancements.js', 'updates-ui.js', 'sftp-browser-ui.js', 'session-tools.js',
  'design-gallery.js', 'shell-status.js', 'welcome-home.js', 'command-blocks.js', 'diff-dock.js', 'sidebar-groups.js', 'quota-card.js', 'detected-shells.js', 'command-palette.js',
  'shortcuts.js', 'session-restore.js', 'pane-header.js', 'gpu-render.js', 'background-mode.js', 'external-display.js', 'second-screen-ui.js', 'session-list.js', 'header-actions.js', 'second-screen/viewer.js', 'second-screen/host.js'];

module.exports = [
  { ignores: ['node_modules/**', 'dist*/**', 'vendor/**', 'native/**', 'fonts/**', 'build/**'] },
  js.configs.recommended,
  {
    files: nodeFiles,
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }], 'no-control-regex': 'off' }
  },
  {
    // Los scripts de la ventana comparten globales declaradas en otros archivos (sessions, folder, launch…): no-undef no aporta aquí.
    files: rendererFiles,
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }], 'no-control-regex': 'off', 'no-redeclare': 'off', 'no-func-assign': 'off', 'no-global-assign': 'off' }
  }
];
