// Shared application and xterm palettes.
const uiStorage = {
  key(key) { return 'profile.' + (window.desktop.initialPreferences.profileId || 'default') + '.' + key; },
  getItem(key) {
    const value = localStorage.getItem(this.key(key));
    return value === null && window.desktop.initialPreferences.profileId === 'default' ? localStorage.getItem(key) : value;
  },
  setItem(key, value) { localStorage.setItem(this.key(key), value); }
};
const appThemes = {
  "mac-glass": ["Cristal líquido", "#0b1533", "#10204a", "#1a2d5e", "#2e4680", "#eef4ff", "#b6c8e8", "#5cc8ff", "#04152a", "#173866", "#ff7f90", "#ffd27a", "#86b6ff", "#e8a0ff", "#62e3f0"],
  "samapp": [
    "Grafito",
    "#10131a",
    "#171b24",
    "#242b37",
    "#354155",
    "#e4e8ef",
    "#a8b5c9",
    "#a2ebc4",
    "#142a20",
    "#273d36",
    "#f39595",
    "#e7ce91",
    "#88b7ef",
    "#c2a2ed",
    "#8ad5d2"
  ],
  "midnight": ["Medianoche", "#101827", "#172235", "#223149", "#435875", "#e2eaf5", "#a3b5cf", "#82b4ff", "#10223d", "#293f60", "#ff929b", "#efcf88", "#82b4ff", "#c7a5f5", "#83d8df"],
  "forest": ["Bosque", "#12201b", "#1a2b24", "#263c32", "#4d6b5b", "#e2efe7", "#a8c2b2", "#91d5a6", "#14291b", "#304d3b", "#ef9792", "#e5cf8c", "#97bde7", "#c8a5dc", "#83cfc5"],
  "ocean": ["Océano", "#10232d", "#17313e", "#224352", "#466c7c", "#e0f1f6", "#a3c3cf", "#6fd6dc", "#103237", "#28505d", "#ff9694", "#eed38e", "#8cbcf5", "#c5a9ed", "#6fd6dc"],
  "plum": ["Ciruela", "#231927", "#302236", "#43304a", "#765780", "#f2e7f5", "#c6aecd", "#d8a1ed", "#351a40", "#52345e", "#f69caa", "#e9cf94", "#a3b8f0", "#d8a1ed", "#8fd5d0"],
  "rose": ["Rosa nocturna", "#261b21", "#34252d", "#48333e", "#7b596b", "#f5e8ef", "#cdb0c0", "#f1a3bd", "#3c1d2a", "#583745", "#ff9b98", "#e9d194", "#9dbcef", "#c9acf0", "#97d5cb"],
  "volcano": ["Volcán", "#231b18", "#30251f", "#44342b", "#785e4d", "#f5eae0", "#ccb7a5", "#f4ad78", "#392414", "#553c2a", "#ff9c8c", "#f0d18c", "#99bbeb", "#c9a6e8", "#8fd2c7"],
  "arctic": ["Ártico", "#edf5f8", "#f8fcfd", "#ddeaf0", "#adbfcb", "#203946", "#4f6b7a", "#196779", "#ffffff", "#cee4ec", "#ae3548", "#80600d", "#285fa6", "#80509a", "#146d76"],
  "sand": ["Arena", "#f5efe3", "#fffaf1", "#e9dfcd", "#c7b89d", "#3c3326", "#73634e", "#7c5422", "#ffffff", "#e8d7b7", "#a7363e", "#7c600c", "#346492", "#805187", "#226d69"],
  "lavender": ["Lavanda", "#f1eef9", "#fcfaff", "#e5dff1", "#bfb1d2", "#372b49", "#6d5c80", "#72509e", "#ffffff", "#e1d5f0", "#ac354e", "#806015", "#3e61a6", "#88519a", "#216f79"],
  "paper": ["Papel", "#f4f4f2", "#ffffff", "#e5e5e1", "#bcbdb6", "#2d332f", "#606b63", "#336b52", "#ffffff", "#d6e5db", "#ac3647", "#7c600f", "#315faa", "#80529c", "#216d77"],
  "light": [
    "Claro",
    "#f6f8fc",
    "#ffffff",
    "#e6ecf4",
    "#b9c7d7",
    "#202c3e",
    "#52647b",
    "#176345",
    "#ffffff",
    "#dbeee3",
    "#a92f40",
    "#806000",
    "#245eb0",
    "#7748a3",
    "#146b73"
  ],
  "nord": [
    "Nord",
    "#2e3440",
    "#3b4252",
    "#434c5e",
    "#66758c",
    "#eceff4",
    "#c0cadb",
    "#88c0d0",
    "#202d39",
    "#405765",
    "#e9919b",
    "#ebcb8b",
    "#81a1c1",
    "#b48ead",
    "#8fbcbb"
  ],
  "dracula": [
    "Drácula",
    "#282a36",
    "#21222c",
    "#343746",
    "#6272a4",
    "#f8f8f2",
    "#b8bdd5",
    "#bd93f9",
    "#211a30",
    "#453650",
    "#ff8585",
    "#f1fa8c",
    "#9daeff",
    "#ff79c6",
    "#8be9fd"
  ],
  "amber": [
    "Ámbar",
    "#19150f",
    "#231d14",
    "#342a1c",
    "#685238",
    "#f5e7ce",
    "#c4ae8c",
    "#f3bd62",
    "#30200b",
    "#49371d",
    "#f19483",
    "#f3d48a",
    "#99bce0",
    "#cfaae4",
    "#94cabe"
  ],
  "pro": ["Medianoche Pro", "#0f141b", "#151c25", "#1b2430", "#27323f", "#d8e2ea", "#7f92a3", "#4cc9e0", "#06222a", "#12303a", "#f2877f", "#e8b95f", "#7aa7ff", "#c2a2ed", "#56d4c7"],
  "pro-light": ["Papel Pro", "#fbfcfd", "#eef2f5", "#e2e8ed", "#cfd8df", "#18242e", "#5e707e", "#0a7f8f", "#ffffff", "#d9f0f3", "#b3362f", "#9a6700", "#2458c7", "#80509a", "#0e7a80"],
  "carbon": ["Carbón Pro", "#0b0b0c", "#0e0e10", "#17171a", "#26262b", "#ececef", "#9a9aa3", "#5fd4e8", "#05181c", "#12282d", "#f0848a", "#f0b46a", "#8cb8ff", "#c3a8f5", "#5fd4e8"],
  "contrast": ["Alto contraste", "#000000", "#0a0a0a", "#161616", "#8a8a8a", "#ffffff", "#d0d0d0", "#ffd400", "#000000", "#3a3200", "#ff6b6b", "#ffd400", "#6cb6ff", "#e0a0ff", "#3dff7a"]
};
let selectedTheme;
let themeSavePromise = Promise.resolve();
function applyTheme(id) {
  if (!Object.hasOwn(appThemes, id)) id = 'samapp';
  selectedTheme = id;
  const p = appThemes[id];
  ['bg','panel','surface','border','text','muted','accent','on-accent','accent-soft','red','yellow','blue','magenta','cyan'].forEach((key,i) => document.documentElement.style.setProperty('--'+key,p[i+1]));
  document.documentElement.style.colorScheme = ['light', 'arctic', 'sand', 'lavender', 'paper', 'pro-light'].includes(id) ? 'light' : 'dark';
  document.documentElement.dataset.theme = id;
  syncNativeWindow(id, p);
  if (typeof sessions !== 'undefined') for (const session of sessions.values()) if(session.term){session.term.options.theme = terminalTheme(); session.term.options.minimumContrastRatio = terminalContrast();}
  if (typeof syncTerminalSettings === 'function') syncTerminalSettings();
  try { uiStorage.setItem('samapp.theme',id); } catch {}
  themeSavePromise = window.desktop.savePreferences({theme:id}).catch(() => { if (typeof status === 'function') status('No se pudo guardar el tema en las preferencias.'); });
}
// La barra de título nativa (botones de Windows) toma el color del tema; en el cristal es transparente.
function syncNativeWindow(id, p) {
  const glass = id === 'mac-glass';
  Promise.resolve(window.desktop?.setTitleBar?.({ color: glass ? '#00000000' : p[2], symbolColor: p[5], background: p[1] })).catch(() => {});
}
// En el cristal el fondo es translúcido y el texto atenuado (gris, dim) se perdía: xterm lo aclara hasta este contraste.
function terminalContrast() { return selectedTheme === 'mac-glass' ? 4.5 : 1; }
function terminalTheme() {
  const p=appThemes[selectedTheme];
  const base = {background:selectedTheme === 'mac-glass' ? '#0e1c4200' : p[1],foreground:p[5],cursor:p[7],selectionBackground:p[9],black:p[4],red:p[10],green:p[7],yellow:p[11],blue:p[12],magenta:p[13],cyan:p[14],white:p[5],brightBlack:p[6],brightRed:p[10],brightGreen:p[7],brightYellow:p[11],brightBlue:p[12],brightMagenta:p[13],brightCyan:p[14],brightWhite:p[5]};
  if (selectedTheme === 'carbon') { base.green = base.brightGreen = '#7ad192'; base.black = '#26262b'; }
  if (selectedTheme === 'mac-glass') { base.selectionBackground = '#3d7fd0'; base.selectionForeground = '#ffffff'; base.selectionInactiveBackground = '#2c5a96'; base.black = '#8193bb'; }
  if (typeof terminalPreferences !== 'undefined' && terminalPreferences.customColors) {
    Object.assign(base, terminalPreferences.colors);
    for (const key of ['red','green','yellow','blue','magenta','cyan']) if (terminalPreferences.colors[key]) base['bright'+key[0].toUpperCase()+key.slice(1)] = terminalPreferences.colors[key];
  }
  return base;
}
