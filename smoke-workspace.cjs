const {app,BrowserWindow,dialog,shell}=require('electron');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-terminal-workspace-'));
const project=path.join(fixture,'project');fs.mkdirSync(project);fs.mkdirSync(path.join(project,'nested'));fs.writeFileSync(path.join(project,'nested','file.txt'),'tree fixture');
for(const dir of ['one','two']){const skill=path.join(project,'.agents','skills',dir);fs.mkdirSync(skill,{recursive:true});fs.writeFileSync(path.join(skill,'SKILL.md'),'---\nname: same-fixture\ndescription: Duplicate fixture\n---\nInstructions');}
execFileSync('git',['init'],{cwd:project,windowsHide:true});
let confirm=0,opened='',trashed='';
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});
dialog.showMessageBox=async()=>({response:confirm});
shell.openPath=async value=>{opened=value;return '';};
// Exercise the selected deletion path without touching the real recycle bin.
shell.trashItem=async value=>{trashed=value;fs.renameSync(value,path.join(fixture,'trashed-copy'));};
require('./main');
app.whenReady().then(async()=>{
 try{
  const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
  const js=code=>win.webContents.executeJavaScript(code);
  await js('pick()');await js("showPanel('files')");
  if(!await js("Array.from(document.querySelectorAll('.file-button')).some(b=>b.textContent.includes('nested'))"))throw Error('Tree missing');
  await js("Array.from(document.querySelectorAll('.file-button')).find(b=>b.textContent.includes('nested')).click()");
  await new Promise(r=>setTimeout(r,200));
  if(!await js("document.querySelector('.file-children').textContent.includes('file.txt')"))throw Error('Tree expansion');
  await js("document.querySelector('#project-open').onclick()");if(opened!==project)throw Error('Open folder');
  await js("showPanel('changes')");if(!await js("document.querySelector('.git-controls').textContent.includes('Crear commit')"))throw Error('Git controls');
  await js("showPanel('skills')");
  const file=path.join(project,'.agents','skills','one','SKILL.md');
  const request=`window.desktop.deleteSkill(folder,${JSON.stringify(file)})`;
  if(await js(request)!==false||trashed)throw Error('Cancel delete');
  confirm=1;if(await js(request)!==true||trashed!==path.dirname(file))throw Error('Delete selected copy');
  if(!fs.existsSync(path.join(project,'.agents','skills','two','SKILL.md')))throw Error('Other copy lost');
  await js("showPanel('skills')");
  if(!await js("document.querySelector('.aside-bottom').textContent.includes('samaapp')"))throw Error('Developer credit');
  fs.writeFileSync('smoke-workspace-result.json',JSON.stringify({passed:true,checks:['tree expansion','open folder routing','Git controls','cancel duplicate deletion','delete selected duplicate only','samaapp credit']},null,2));
  app.exit(0);
 }catch(error){fs.writeFileSync('smoke-workspace-result.json',JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
app.on('will-quit',()=>fs.rmSync(fixture,{recursive:true,force:true}));
