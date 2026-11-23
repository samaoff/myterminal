# MyTerminal

MyTerminal es la evolución de AI Terminal 1.2.0, con el rediseño y las funciones nuevas. Vive en la rama `pro`, guarda sus datos en
`%APPDATA%\ai-terminal-pro` y tiene su propio identificador, de modo que puede convivir con la aplicación original.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | Abre la aplicación desde el código. |
| `npm run verify` | Comprueba la sintaxis, pasa ESLint sin avisos y ejecuta las pruebas unitarias. |
| `npm run smoke` | Arranca la aplicación de verdad y ejecuta las comprobaciones de interfaz (usa carpetas de datos temporales). |
| `npm run dist` | Genera el instalador en `dist-pro`. No está firmado. |
| `node scripts/publish-github.cjs <versión>` | Publica el instalador y su SHA-256 en GitHub Releases (necesita `gh` con sesión). |

Las pruebas antiguas `smoke-themes`, `smoke-layout`, `smoke-custom-terminals` y `smoke-user-profiles` se corrigieron y forman parte de la revisión.
`smoke-sidebar` y `smoke-fixed-tools` fallan igual en el original y no se han tocado.
Nunca ejecutes un `smoke-*.cjs` sin `--user-data-dir=<carpeta temporal>`: usaría los datos reales de la aplicación.

## Qué incluye respecto al original

- **Diseño**: tokens comunes (`design-system.css`), aspecto Pro (`design-pro.css`), iconos SVG, IBM Plex Sans y JetBrains Mono incluidas.
- **Galería de diseños** (`design-gallery.js`): ocho diseños más Medianoche Pro y Papel Pro, diseños propios, exportar e importar.
- **Ventana** (`design-shell.css`, `shell-status.js`): barra de título con pestañas, pestañas con estado, barra de estado, cabecera de panel (`pane-header.js`).
- **Cuota** (`quota-card.js`): franja bajo el terminal con la IA de la pestaña activa, respetando todos los ajustes de cuota.
- **Terminal**: bloques de comando con resultado y duración (`command-blocks.js`), visor de cambios acoplado (`diff-dock.js`), render con GPU (`gpu-render.js`).
- **Shells** (`shell-detect.cjs`): PowerShell 7, cmd, Git Bash y WSL detectados.
- **Productividad**: paleta de comandos (`command-palette.js`), atajos configurables (`shortcuts.js`), restaurar la sesión anterior (`session-restore.js`),
  mantener los terminales en la bandeja al cerrar la ventana (`background-mode.js` y `main.js`).
- **Pantalla externa** (`external-display.cjs`, `external-display.js`): lleva el terminal a otro monitor en pantalla completa, con letra más grande y sin barra lateral
  (Ctrl+Mayús+X o la paleta). Detecta los monitores virtuales de «Al lado», que convierte un iPad en segunda pantalla, y puede abrirla. Si la pantalla desaparece, el terminal vuelve solo.
- **Segunda pantalla** (`second-screen/`, `second-screen-ui.js`): envía el terminal (o una pantalla) a una tableta, un móvil u otro PC (iPad, Android, Chrome, Edge, Safari…) por la red local, sin instalar nada: QR o código de 6 cifras, solo redes privadas, un dispositivo a la vez, vídeo WebRTC cifrado. Incluye pausa de privacidad, ajuste de imagen y, con el controlador de pantalla virtual (MIT, opcional, pide permisos de administrador), cambio de resolución «Ajustar al iPad». Paleta: «Segunda pantalla (iPad)…».
- **Seguridad** (`security.cjs`): los canales IPC solo responden a la página de la aplicación, permisos del navegador denegados salvo el portapapeles,
  sin ventanas nuevas ni navegación.

## Límites conocidos

- Los procesos no se reanudan al restaurar la sesión: se abren terminales nuevos en las mismas carpetas.
- Los bloques de comando solo funcionan en PowerShell.
- Las ligaduras de la fuente no están: el addon necesita acceso a Node, que la ventana (con `sandbox`) no tiene.
- Las sesiones sobreviven a cerrar la ventana, pero no a cerrar la aplicación, actualizarla o un fallo.
- El instalador no está firmado: hace falta un certificado de editor.
- La integración continua (`.github/workflows/ci.yml`) solo pasa `npm run verify`; las pruebas de interfaz se ejecutan en local.
