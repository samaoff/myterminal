# MyTerminal · versión 2.0.0

Aplicación de escritorio para Windows con terminal real (ConPTY), perfiles de usuario, temas y conexiones remotas. Abre Codex, Claude Code, PowerShell, PowerShell 7, Git Bash, WSL y herramientas propias; conecta por SSH y SFTP o controla un escritorio RDP dentro de una pestaña.

MyTerminal 2.0 es el rediseño de AI Terminal 1.2.0. Convive con la aplicación original: tiene su propio instalador, acceso directo y datos (`%APPDATA%/ai-terminal-pro`). Consulta [desarrollo.md](desarrollo.md) para ver todo lo que incluye, los comandos de desarrollo y los límites conocidos.

## Instalar

Descarga el instalador de la [última versión](https://github.com/samaoff/myterminal/releases/latest) (`MyTerminal-Setup-<versión>.exe`) y comprueba su suma SHA-256 con el archivo `.sha256` que lo acompaña.

La actualización integrada (pulsa la versión en la barra lateral) busca las versiones estables en GitHub Releases sin iniciar sesión, descarga el instalador, comprueba su SHA-256 y lo ejecuta cuando confirmas.

Las preferencias y los proyectos recientes se guardan fuera de la instalación, en `%APPDATA%/ai-terminal-pro`. Las cuentas y herramientas de Codex y Claude se configuran en cada PC.

## Perfiles de usuario

Pulsa el nombre del perfil en la parte superior de la barra lateral para crear perfiles, renombrarlos o entrar en otro. La configuración anterior se conserva en **Principal**; los perfiles nuevos empiezan vacíos.

Cada perfil guarda sus proyectos recientes, última carpeta, terminales propios, conexiones remotas, tema, colores personalizados, fuente de consola, barra lateral y visualización de cuota. Al volver a un perfil se carga su última carpeta sin iniciar procesos. Cierra las sesiones abiertas antes de cambiar de perfil.

Los datos se guardan en `%APPDATA%/ai-terminal/users/<id>`. Los archivos anteriores se conservan durante la migración. Son perfiles locales de configuración: las cuentas de Codex y Claude, los permisos y los archivos siguen siendo los del usuario de Windows.

## Conexiones remotas

El acceso SFTP abre un explorador con dos paneles, equipo local y servidor. Puedes escribir una ruta, subir a la carpeta superior y entrar en carpetas con doble clic. Marca varios archivos con sus casillas, usa la casilla de cabecera para seleccionarlos todos, Ctrl para alternar archivos, Mayús para seleccionar un rango o Ctrl+A dentro de la lista. **Subir seleccionados** y **Descargar seleccionados** transfieren la selección en orden y muestran el progreso de toda la cola. **Cancelar cola** interrumpe el archivo actual y evita iniciar los pendientes. Un error no impide transferir los demás: al terminar se muestra el número de archivos completados y un detalle desplegable de los errores; los archivos fallidos siguen seleccionados. Los archivos existentes se conservan. Se pueden seleccionar múltiples archivos, sin seguir enlaces ni copiar carpetas recursivamente. El botón **>_** conserva la consola SFTP de OpenSSH.

Al conectar puedes introducir usuario, contraseña o frase de la clave cifrada; no se guardan. Se resuelven los alias e identidades de la configuración de OpenSSH y se admite el agente SSH de Windows. Los accesos con ProxyJump o ProxyCommand deben usar la consola. Antes de aceptar un servidor nuevo, comprueba su huella SHA-256; la aceptación solo se recuerda durante la ejecución actual de la aplicación.

Las pestañas tienen **Opciones de pestaña** en la barra de trabajo, clic derecho o F2 para renombrarlas, elegir color y activar o desactivar avisos de esa sesión. Los nombres y colores duran lo que dura la pestaña. Un punto indica salida nueva sin leer; una marca inferior verde o roja indica finalización correcta o con error. Hay avisos del sistema al finalizar un proceso y al volver al prompt después de un comando de PowerShell de más de diez segundos, si estás en otra pestaña o ventana. Los avisos respetan la configuración de notificaciones de Windows; pulsarlos abre la pestaña. No se infiere que una tarea de IA haya terminado por quedarse sin salida.

En **Herramientas → Conexiones → Nueva conexión**, elige SSH, SFTP o Escritorio remoto, indica el servidor y guarda el acceso. Las conexiones se muestran en el panel derecho. Se guardan por perfil en `remote-connections.json`; se pueden editar y quitar sin cerrar las pestañas ya abiertas. No necesitas abrir un proyecto local para conectar.

- **SSH:** se abre en una pestaña usando el cliente OpenSSH de Windows. Puedes indicar usuario, puerto y la ruta de una clave privada, o utilizar un alias de tu configuración OpenSSH. La contraseña y la frase de la clave se introducen en el terminal.
- **SFTP:** se abre en una pestaña con un explorador local y remoto. La carpeta local elegida en el acceso es el destino inicial de las descargas; si se deja vacía, se usa el proyecto actual o la carpeta personal. El botón **>_** abre el cliente interactivo de OpenSSH: `get archivo` descarga, `put archivo` sube y `bye` cierra la conexión.
- **Escritorio remoto (RDP):** muestra el escritorio dentro de una pestaña de MyTerminal, mediante el control RDP de Microsoft. Introduce el usuario y la contraseña en el panel integrado y pulsa **Conectar en esta pestaña**. El teclado y el ratón actúan directamente sobre ese escritorio. **Ampliar** permite verlo a pantalla completa; **Desconectar** vuelve al formulario de conexión sin cerrar la pestaña. Se puede ajustar el escritorio al tamaño disponible.

La aplicación guarda los datos del acceso y la ruta de la clave, sin copiar su contenido ni guardar contraseñas. En RDP, la contraseña permanece en el componente nativo durante la conexión y no pasa por la interfaz web ni se escribe en disco. Para cambiar de perfil, cierra las pestañas remotas. Si falta SSH o SFTP, activa **Cliente OpenSSH** en las características opcionales de Windows.

El componente RDP se compila con `npm run build:rdp`, también ejecutado antes de `npm start` y `npm run dist`. Usa .NET Framework y el control `mstscax.dll` incluidos en Windows. El instalador incluye el ejecutable compilado. La composición de Chromium se configura para que el panel nativo sea visible dentro de la aplicación.

El intervalo de envío del ratón se configura a 16 ms para evitar la agrupación de eventos del ajuste heredado. Esto no elimina la latencia de la red o del servidor. Los ejecutables de desarrollo llevan una versión derivada del código para poder preparar una mejora sin sustituir el componente que utiliza una sesión abierta.

Referencia de los clientes: [ssh](https://man.openbsd.org/ssh), [sftp](https://man.openbsd.org/sftp) y [control RDP de Microsoft](https://learn.microsoft.com/en-us/windows/win32/termserv/msrdpclient9notsafeforscripting).

## Desarrollo

También puedes usar **Abrir MyTerminal.cmd** desde esta carpeta. Para preparar el proyecto desde cero: `npm install` y `node node_modules/electron/install.js`; después `npm start`.

1. Pulsa **Abrir proyecto** y elige una carpeta.
2. Pulsa **Codex**, **Claude Code** o **PowerShell**.
3. Utiliza el asistente como en su terminal habitual. Puedes abrir varias pestañas.

Copiar: Ctrl+Shift+C. Pegar: Ctrl+Shift+V. Ctrl+C se envía al programa para interrumpirlo. Al cerrar una pestaña con proceso o la ventana con sesiones abiertas, aparece un aviso que permite cancelar. Se avisa también si el proceso espera instrucciones: no se detecta si la IA está trabajando. Confirmar el cierre termina los procesos.

Utiliza las instalaciones y cuentas existentes de Codex y Claude Code. Si necesitan iniciar sesión, mostrarán sus instrucciones en la terminal. No introduce una API adicional ni guarda claves propias. La interfaz de los asistentes sigue siendo la de sus herramientas de consola.

## Skills, archivos y cambios

Los botones **Skills**, **Archivos** y **Cambios** abren el panel lateral. Puedes cerrarlo para recuperar el ancho de la terminal.

En Skills puedes buscar por nombre o descripción, filtrar por IA y ubicación y pulsar una tarjeta para leer su SKILL.md. Se muestran las carpetas del proyecto y sus superiores, las personales, las de sistema de Codex y las cachés locales de plugins. Una skill encontrada en disco no garantiza que esté activada: el panel no interpreta los ajustes de activación ni consulta skills remotas o integradas que no estén en esas carpetas. Pueden aparecer varias versiones de una skill de plugin.

Para añadir una skill, despliega **Añadir skill desde carpeta**, elige destino y pulsa **Seleccionar carpeta y previsualizar**. Selecciona la carpeta que contiene SKILL.md (no su carpeta superior ni un ZIP). Antes de guardar se muestran las instrucciones, archivos, destino y coincidencias de nombre. No se sobrescribe un destino existente. Si cambia el origen después de revisarlo, hay que previsualizarlo otra vez.

**Crear una skill** abre un formulario de nombre, cuándo usarla, instrucciones y destino. Previsualiza el SKILL.md generado y confirma para guardarlo. Las coincidencias de nombre en otras ubicaciones se muestran; solo el destino exacto ya existente bloquea el guardado.

Codex usa `.agents/skills` para la importación y Claude `.claude/skills`, en el proyecto o en tu carpeta personal según el destino. Se copian scripts y referencias sin ejecutarlos. Se rechazan enlaces simbólicos y paquetes de más de 25 MB o 1000 archivos. Abre una nueva sesión para comprobar su disponibilidad. No incluye todavía un catálogo online.

Archivos permite navegar y leer texto de hasta 1 MB, sin modificarlo. Se omiten `.git`, `node_modules`, `.venv` y `__pycache__`. En **Cambios**, pulsa un archivo para ver sus diferencias sin preparar, preparadas para commit o su contenido actual. Las diferencias incluyen números de línea, añadidos en verde y eliminados en rojo. Los nuevos archivos muestran su contenido y los eliminados conservan su diff. Pulsa **↻** para actualizar después de trabajar con la IA.

Referencias de formato y ubicaciones: [OpenAI](https://learn.chatgpt.com/docs/build-skills), [Claude Code](https://code.claude.com/docs/en/skills).

La aplicación conserva los proyectos recientes en `%APPDATA%/ai-terminal`, tanto desde el código como instalada. No restaura conversaciones ni pestañas al iniciar.

Validación: `npm run check`, `npm test`, `npm run test:updates` y ejecución de `smoke.js` con Electron. `smoke-app-updates.cjs` verifica el flujo de actualizaciones, el cifrado nativo del token y el cierre cancelable con una release y un instalador simulados; no ejecuta instaladores reales. `smoke-workspace-enhancements.cjs` prueba la división, la consulta de selecciones y la salida intensiva. Para generar el instalador: `npm run dist`. Configuración de empaquetado basada en la [documentación de electron-builder](https://www.electron.build/v26/docs/nsis/).

## Espacio de trabajo desde 0.10

Proyecto actual y recientes aparecen juntos bajo **Proyectos**. El proyecto actual se omite de la lista de recientes para no repetirlo. **Dividir** muestra una segunda sesión de terminal, elegible en la lista; **Orientación** alterna entre columnas y filas. Arrastra el separador o usa sus flechas de teclado para ajustar tamaños; **Maximizar** y **Restaurar** conservan la pareja. También puedes arrastrar una pestaña al espacio de trabajo. La división se aplica a terminales, no al escritorio RDP nativo.

Selecciona texto y pulsa **Consultar selección** para revisar hasta 20.000 caracteres, elegir qué preguntar y una sesión local de Codex o Claude. **Insertar en la sesión de IA** pega la consulta para que la revises antes de enviarla. No abre otra cuenta ni utiliza una API adicional. La salida del terminal se agrupa en intervalos cortos y se pausa su lectura si xterm acumula datos pendientes, reanudándola cuando los procesa.

## samaapp y apariencia

AI Terminal es una aplicación de samaapp. El selector Apariencia cambia la interfaz y todas las terminales abiertas entre Samaapp, Claro, Nord, Drácula y Ámbar. La elección se recuerda al volver a abrir la aplicación.

## AI Terminal 0.4 · Desarrollado por samaapp

Cada proyecto dispone de un ojo para navegar por su árbol y una carpeta para abrirlo en el Explorador. Las skills duplicadas se filtran y cada copia editable se puede enviar a la papelera tras confirmar su ubicación; las skills del sistema y de plugins se administran desde su instalación. Git muestra rama, remoto, commits y cambios, permite preparar y quitar archivos del índice, crear commits desde la raíz del repositorio, fetch, pull con fast-forward y push al remoto configurado. Las operaciones remotas usan las credenciales Git del equipo.

## AI Terminal 0.5 · Navegación y cuota de IA

El botón de menú reduce la barra lateral a iconos. Iniciar sesión, Herramientas y Proyectos recientes se pliegan por separado; se recuerdan ambas preferencias. Pulsar una categoría en la barra compacta la expande y abre esa sección.

Las pestañas de Codex y Claude muestran una franja de uso sobre el pie, ajustando el espacio de la terminal. Los porcentajes indican lo que queda. Codex consulta `account/rateLimits/read` mediante un app-server local por stdio, sin crear conversaciones; las consultas se comparten y se almacenan durante un minuto. Claude envía cuota y contexto a un lector de statusLine mediante ajustes temporales de la sesión; los ajustes globales no se editan y la barra de estado propia de Claude se sustituye solo en estas sesiones. El lector almacena exclusivamente modelo, identificador y cifras de uso en una carpeta temporal de la aplicación. Su proceso de PowerShell permite ejecutar el script distribuido sin cambiar la política global del equipo.

La cuota pertenece a la cuenta y se comparte con otras sesiones. El contexto es independiente. Si el proveedor, el plan o la versión no entrega porcentajes, se muestra que no hay datos; no se estima una cuota ni se asume un 100% después del reinicio. Claude puede no enviar cuota hasta su primera respuesta. Al reanudar otra conversación desde dentro de Claude, el identificador cambia y el lector deja de actualizar esta sesión; la franja identifica los datos anteriores por su hora. Los datos de uso de Claude se leen cada 15 segundos; el botón de actualización permite consultarlos manualmente.

Referencias oficiales: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude status line](https://code.claude.com/docs/en/statusline), [Claude CLI](https://code.claude.com/docs/en/cli-reference).

## AI Terminal 0.6 · Mac cristal y personalización

Mac cristal añade paneles translúcidos y un fondo con degradados. El botón Personalizar de la cabecera, o el icono Apariencia en la barra compacta, abre los ajustes de consola: fuente con alternativas locales, tamaño de 10 a 32 px, grosor, interlineado, separación de letras, forma y parpadeo del cursor, y colores de texto, fondo, selección y paleta. Los cambios se guardan localmente y se aplican a todas las sesiones, tanto abiertas como nuevas. Los colores personalizados se mantienen al cambiar de tema; Usar colores del tema los desactiva. Restablecer consola recupera los ajustes iniciales y conserva el tema de la aplicación. Ctrl + / − cambia el tamaño y Ctrl 0 lo devuelve a 14 px.

## AI Terminal 0.7 · Historial y creador

El pie de la barra lateral muestra la versión instalada desde package.json, el creador samaapp y el enlace https://samaapp.es. Al pulsar la versión se abre el historial de los cambios realizados desde 0.3.0. Cada versión permite desplegar sus novedades y la instalada está señalada. El acceso Acerca de también está disponible en la barra compacta. La web se abre en el navegador del sistema. El historial se mantiene en releases.json; al publicar una versión nueva, se actualizan ese archivo y la versión de package.json y package-lock.json.

### 0.7.1 · Inicio

La cabecera de la barra lateral muestra solo AI Terminal; el crédito de samaapp y la web permanecen en el pie. Los paneles de herramientas están cerrados al iniciar. El tema, los ajustes de consola y la barra lateral se guardan en `%APPDATA%/ai-terminal/ui-preferences.json` y se recuperan al abrir de nuevo la aplicación.

## Búsqueda e historial

En una pestaña de terminal, Ctrl+F abre la búsqueda en el texto conservado en pantalla. Enter avanza, Shift+Enter retrocede y Escape cierra. También puedes usar Buscar en la barra de herramientas. Cada pestaña tiene su propia búsqueda.

PowerShell incluye PSReadLine 2.3.6: sugerencias automáticas basadas en comandos anteriores, flecha derecha para aceptarlas, Tab para completar comandos y rutas, Ctrl+R para buscar en el historial y flechas arriba/abajo para filtrar por lo escrito. Los comandos se guardan en `powershell-history.txt` dentro del directorio de cada perfil. La configuración se aplica a los procesos de PowerShell iniciados con el acceso integrado; los shells personalizados y remotos conservan su propia configuración.

## AI Terminal 0.8 · Terminales propios

La sección Terminales incluye Codex, Claude Code, PowerShell y los accesos que añadas. Cada tipo muestra su icono en la lista y en las pestañas. Añadir terminal permite guardar nombre, programa o ruta, argumentos (uno por línea) e icono; después puedes editar o eliminar el acceso. Borrar un acceso conserva las pestañas ya abiertas.

Para usar un modelo de Ollama, elige Plantilla Ollama, añade su nombre en la segunda línea de Argumentos después de run y guarda el acceso. Puedes crear un acceso por modelo. La herramienta y sus modelos se gestionan desde Ollama; guardar un perfil no ejecuta comandos. Al lanzarlo se usa la carpeta del proyecto seleccionado y las opciones de consola guardadas. Los ejecutables se lanzan con sus argumentos separados; los scripts cmd, bat y ps1 se ejecutan mediante PowerShell. Los perfiles se guardan en `%APPDATA%/ai-terminal/custom-terminals.json`. La cuota de IA sigue disponible para las sesiones integradas de Codex y Claude; no se infiere para CLI propios.

Apariencia permanece fija en el pie, encima de la versión, mientras la lista de proyectos y terminales se desplaza. También está accesible en la barra compacta.

La versión 1.0.0 abre maximizada por defecto. En Apariencia puedes elegir ventana grande o pequeña y cuatro nuevas fuentes incluidas: JetBrains Mono, Fira Code, Source Code Pro y Atkinson Hyperlegible Mono. El tamaño se guarda por perfil.

Numeración: después de diez versiones menores se avanza a la siguiente versión mayor (0.10.0 → 1.0.0).
