const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-profile-smoke-'));
const project = path.join(fixture, 'project'); fs.mkdirSync(project);
const setPath = app.setPath.bind(app);
app.setPath = (name,value) => setPath(name, name === 'userData' ? fixture : value);
dialog.showOpenDialog = async () => ({canceled:false,filePaths:[project]});
let closeResponse = 1;
dialog.showMessageBox = async () => ({response:closeResponse});
const pty = require('node-pty');
pty.spawn = () => {
  let onExit;
  return { onData() {}, onExit(fn) { onExit = fn; }, write() {}, resize() {}, kill() { onExit?.({exitCode:0}); } };
};
require('./main'); app.setPath = setPath;
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const js = code => win.webContents.executeJavaScript(code);
  const check = (value,message) => { if (!value) throw new Error(message); };
  async function reload() {
    const loaded = new Promise(resolve => win.webContents.once('did-finish-load',resolve)); win.webContents.reload(); await loaded;
    await js('Promise.resolve()');
  }
  async function clickSwitch(name) {
    const switched = new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('El botón Entrar no recarga el perfil: ' + name)), 5000);
      win.webContents.once('did-finish-load', () => {clearTimeout(timer);resolve();});
    });
    await js(`(async()=>{profileButton.click();await renderUserProfiles();[...profileList.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')===${JSON.stringify('Entrar en el perfil ' + name)}).click();})()`);
    await switched;
  }
  try {
    if (win.webContents.isLoading()) await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    const errors=[]; win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
    check(await js("window.desktop.initialPreferences.profileId === 'default'"),'Initial profile');
    await js("profileButton.click()"); check(await js('profileDialog.open'),'Profile modal');
    await js("profileNameInput.value='Prueba';profileForm.requestSubmit()");
    const state = await js('window.desktop.userProfiles()');
    check(state.profiles.length===2,'Create profile UI');
    const second = state.profiles.find(p=>p.id!=='default').id;
    await js("profileDialog.close(); (async()=>{chooseFolder(await window.desktop.pickFolder());applyTheme('forest');changeTerminalPreference('fontSize',19);changeTerminalPreference('customColors',true);usagePreferences.indicator='ring';usagePreferences.textSize=18;saveUsageDisplay();await themeSavePromise;await window.desktop.savePreferences({usage:usagePreferences,terminal:terminalPreferences});await window.desktop.saveTerminal({name:'Propio',command:'powershell.exe',args:[],icon:'terminal'});})()");
    await js("launch('powershell')");
    const blocked = await js(`window.desktop.switchUserProfile(${JSON.stringify(second)}).then(()=>false,()=>true)`);
    check(blocked,'Active process blocks profile switch');
    closeResponse = 0;
    await js(`(async()=>{profileButton.click();await renderUserProfiles();await [...profileList.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Entrar en el perfil Prueba').onclick();})()`);
    check(await js("window.desktop.initialPreferences.profileId==='default' && sessions.size===1 && !profileBusy"), 'Cancelled close preserves profile and session');
    closeResponse = 1;
    await clickSwitch('Prueba');
    check(await js('sessions.size===0'), 'Switch closes open tabs');
    check(await js("selectedTheme==='pro' && terminalPreferences.fontSize===13 && !terminalPreferences.customColors && usagePreferences.indicator==='bar' && folder===null"),'New profile defaults');
    check((await js('window.desktop.projects()')).length===0,'Separate recent projects');
    check((await js('window.desktop.terminalProfiles()')).length===0,'Separate terminals');
    await js("(async()=>{applyTheme('ocean'); await themeSavePromise;})()");
    await clickSwitch('Principal');
    check(await js("selectedTheme==='forest' && terminalPreferences.fontSize===19 && terminalPreferences.customColors && usagePreferences.indicator==='ring' && usagePreferences.textSize===18"),'Restore appearance');
    check(await js(`folder===${JSON.stringify(project)}`),'Restore last project');
    check((await js('window.desktop.projects()')).length===1,'Restore history');
    check((await js('window.desktop.terminalProfiles()')).length===1,'Restore own terminals');
    await js("window.desktop.renameUserProfile('default','Personal')"); await reload();
    check(await js("profileButton.textContent.includes('Personal')"),'Rename persists');
    await js("sidebarState.compact=true;renderSidebar()");
    check(await js("profileButton.getBoundingClientRect().width===40 && document.documentElement.scrollWidth<=innerWidth"),'Compact profile button');
    check(errors.length===0,errors.join('\n'));
    fs.writeFileSync(path.join(__dirname,'smoke-user-profiles-result.json'), JSON.stringify({passed:true,checks:['profile modal','create from UI','active process protection','switch using Entrar both ways','clean profile defaults','separate recents','separate terminals','restore theme and custom colors','restore usage appearance','last folder','rename persistence','compact layout']},null,2));
    app.exit(0);
  } catch(error) {
    fs.writeFileSync(path.join(__dirname,'smoke-user-profiles-result.json'),JSON.stringify({passed:false,error:String(error)},null,2)); app.exit(1);
  }
});
