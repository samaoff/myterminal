const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-tools-smoke-'));
const originalSetPath = app.setPath.bind(app);
app.setPath = (name,value) => originalSetPath(name, name === 'userData' ? fixture : value);
require('./main'); app.setPath = originalSetPath;
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  try {
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load',resolve));
    const js = code => win.webContents.executeJavaScript(code);
    const check = (value,message) => { if (!value) throw new Error(message); };
    await js("refreshPanel=async()=>{};for(let i=0;i<40;i++){const row=node('div','Proyecto de prueba '+i,'recent-row');row.style.height='35px';document.getElementById('recent').append(row)}");
    await js("sidebarState.sections.connections=true;for(let i=0;i<30;i++){const row=node('div','Servidor de prueba '+i,'remote-connection-row');row.style.height='34px';document.getElementById('remote-connections').append(row)}");
    for (const [width,height] of [[1380,860],[950,580]]) {
      win.setSize(width,height);
      for (const compact of [false,true]) {
        await js(`sidebarState.compact=${compact};renderSidebar();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        check(await js("(()=>{const tools=document.getElementById('fixed-tools').getBoundingClientRect(),appearance=document.getElementById('appearance-icon').getBoundingClientRect();return tools.top>=0&&tools.bottom<=appearance.top&&appearance.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()"),'Tools visible above appearance');
        check(await js("(()=>{const c=document.querySelector('.sidebar-fixed>[data-section=connections]'),r=c.getBoundingClientRect(),t=document.getElementById('fixed-tools').getBoundingClientRect();return r.top>=0&&r.bottom<=t.top&&!document.querySelector('.sidebar-scroll [data-section=connections]')})()"),'Connections fixed above tools');
        if(!compact)check(await js("(()=>{const r=document.getElementById('add-connection').getBoundingClientRect(),l=document.getElementById('remote-connections');return r.bottom<=document.getElementById('fixed-tools').getBoundingClientRect().top&&l.scrollHeight>l.clientHeight&&l.clientHeight<=101})()"),'Large connection list scrolls without pushing tools');
        check(await js("document.querySelectorAll('#fixed-tools button svg').length===3"),'Three tool SVG icons');
        const before = await js("document.getElementById('fixed-tools').getBoundingClientRect().top");
        const connectionsBefore=await js("document.querySelector('[data-section=connections]').getBoundingClientRect().top");
        await js("document.querySelector('.sidebar-scroll').scrollTop=99999");
        check(Math.abs(await js("document.getElementById('fixed-tools').getBoundingClientRect().top") - before)<1,'Tools remain fixed while scrolling');
        check(Math.abs(await js("document.querySelector('[data-section=connections]').getBoundingClientRect().top")-connectionsBefore)<1,'Connections remain fixed while scrolling');
        for (const value of ['skills','files','changes']) {
          await js(`document.querySelector('#fixed-tools [data-panel=${value}]').click()`);
          check(await js(`panel==='${value}'&&!document.getElementById('inspector').hidden&&document.querySelector('#fixed-tools [data-panel=${value}]').classList.contains('selected')`),'Tool click '+value);
          await js("document.getElementById('panel-close').click()");
        }
      }
    }
    win.setSize(1380,860);
    await js("sidebarState.compact=false;renderSidebar();document.querySelector('.sidebar-scroll').scrollTop=0;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.join(__dirname,'preview-fixed-tools.png'),(await win.webContents.capturePage()).toPNG());
    const info=await js('window.desktop.appInfo()');check(info.version==='0.9.0'&&info.releases[0].version===info.version,'Release version and history');
    fs.writeFileSync(path.join(__dirname,'smoke-fixed-tools-result.json'),JSON.stringify({passed:true,checks:['connections fixed above tools','large connection list scrolls independently','tools fixed above appearance','visible at 950x580 and 1380x860','expanded and compact','three SVG icons','stationary while scrolling','all tool buttons open their panel','0.9.0 release history']},null,2));
    app.exit(0);
  } catch(error) {
    fs.writeFileSync(path.join(__dirname,'smoke-fixed-tools-result.json'),JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);
  }
});
