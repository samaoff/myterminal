// Real desktop smoke check: renderer, preload, ConPTY, input/output and tabs.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const report = path.join(__dirname, 'smoke-result.json');
const fixtureProject = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ai-terminal-desktop-'));
const fixtureSource = path.join(fixtureProject, 'import-source');
fs.mkdirSync(fixtureSource);
fs.writeFileSync(path.join(fixtureSource, 'SKILL.md'), '---\nname: desktop-import-fixture\ndescription: Temporary import test\n---\nImport fixture instructions.');
let dialogResponse = 0, closeQuestions = 0;
dialog.showMessageBox = async () => { closeQuestions++; return { response: dialogResponse }; };
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixtureSource] });
require('./main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const errors = [];
    win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
    await win.webContents.executeJavaScript(`chooseFolder(${JSON.stringify(__dirname)}); launch('powershell')`);
    await delay(1800);
    await win.webContents.executeJavaScript(`window.desktop.write(active, "Write-Output ('AI_' + 'TERMINAL_SMOKE_OK')\\r")`);
    let success = false;
    for (let i = 0; i < 15; i++) {
      await delay(400);
      success = await win.webContents.executeJavaScript(`(() => { const b=sessions.get(active).term.buffer.active; return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString()).some(line=>line.trim()==='AI_TERMINAL_SMOKE_OK'); })()`);
      if (success) break;
    }
    if (!success) throw new Error('PowerShell output did not arrive at the terminal');
    await win.webContents.executeJavaScript(`launch('powershell')`);
    const tabs = await win.webContents.executeJavaScript(`sessions.size`);
    if (tabs !== 2) throw new Error('Expected two working tabs');
    await win.webContents.executeJavaScript(`close(active)`);
    if (await win.webContents.executeJavaScript(`sessions.size`) !== 2) throw new Error('Canceling tab close lost a session');
    win.close(); await delay(100);
    if (win.isDestroyed()) throw new Error('Canceling window close failed');
    dialogResponse = 1;
    await win.webContents.executeJavaScript(`close(active)`);
    const remaining = await win.webContents.executeJavaScript(`sessions.size`);
    if (remaining !== 1) throw new Error('Tab close failed');
    await win.webContents.executeJavaScript(`showPanel('skills')`);
    const skills = await win.webContents.executeJavaScript(`catalog.length`);
    if (!skills) throw new Error('Skills panel did not discover installed skills');
    await win.webContents.executeJavaScript(`document.querySelector('.skill-card').click()`);
    await delay(300);
    const skillOpened = await win.webContents.executeJavaScript(`document.querySelector('#viewer').open && document.querySelector('#viewer-content').textContent.includes('---')`);
    if (!skillOpened) throw new Error('Skill viewer did not open');
    await win.webContents.executeJavaScript(`document.querySelector('#viewer').close(); showPanel('files')`);
    const files = await win.webContents.executeJavaScript(`document.querySelectorAll('.file-button').length`);
    if (!files) throw new Error('Project file list is empty');
    await win.webContents.executeJavaScript(`showPanel('changes')`);
    const gitError = await win.webContents.executeJavaScript(`document.querySelector('#panel-message').textContent.includes('No se pudieron')`);
    if (gitError) throw new Error('Git panel failed');
    await win.webContents.executeJavaScript(`openFileChange(${JSON.stringify(__dirname)}, 'features.js')`);
    if (!await win.webContents.executeJavaScript(`document.querySelector('#viewer').open && document.querySelector('#viewer-content').textContent.includes('showSkillPreview')`)) throw new Error('Per-file change viewer failed');
    await win.webContents.executeJavaScript(`document.querySelector('#viewer').close(); chooseFolder(${JSON.stringify(fixtureProject)}); launch('powershell')`);
    await win.webContents.executeJavaScript(`document.querySelector('#skill-new').click(); document.querySelector('#new-skill-name').value='desktop-smoke-fixture'; document.querySelector('#new-skill-description').value='Only a temporary UI test fixture'; document.querySelector('#new-skill-instructions').value='Fixture instructions'; document.querySelector('#skill-form').onsubmit({preventDefault(){}})`);
    if (!await win.webContents.executeJavaScript(`document.querySelector('#skill-preview').open && document.querySelector('#preview-content').textContent.includes('desktop-smoke-fixture')`)) throw new Error('Skill creation preview failed');
    await win.webContents.executeJavaScript(`document.querySelector('#preview-save').onclick()`);
    if (!fs.existsSync(path.join(fixtureProject, '.agents', 'skills', 'desktop-smoke-fixture', 'SKILL.md'))) throw new Error('Skill creation did not save');
    await win.webContents.executeJavaScript(`document.querySelector('#viewer').close(); document.querySelector('#skill-import').onclick()`);
    if (!await win.webContents.executeJavaScript(`document.querySelector('#skill-preview').open && document.querySelector('#preview-content').textContent.includes('desktop-import-fixture')`)) throw new Error('Import preview did not open');
    if (fs.existsSync(path.join(fixtureProject, '.agents', 'skills', 'desktop-import-fixture'))) throw new Error('Import wrote files before confirmation');
    await win.webContents.executeJavaScript(`document.querySelector('#preview-save').onclick()`);
    if (!fs.existsSync(path.join(fixtureProject, '.agents', 'skills', 'desktop-import-fixture', 'SKILL.md'))) throw new Error('Confirmed import did not save');
    await win.webContents.executeJavaScript(`document.querySelector('#viewer').close(); document.querySelector('#skill-import').onclick()`);
    if (!await win.webContents.executeJavaScript(`document.querySelector('#preview-save').disabled`)) throw new Error('Duplicate import was not blocked');
    await win.webContents.executeJavaScript(`document.querySelector('#skill-preview').close(); close(active)`);
    await win.webContents.executeJavaScript(`showPanel('skills')`);
    await delay(600);
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(report, JSON.stringify({ passed: true, skills, files, closeQuestions, checks: ['PowerShell I/O', 'cancel tab close', 'cancel window close', 'confirm tab close', 'skills discovery and viewer', 'file browser', 'per-file changes', 'skill create preview and save', 'import preview and save', 'duplicate import blocked'], timestamp: new Date().toISOString() }, null, 2));
    fs.writeFileSync(path.join(__dirname, 'preview.png'), (await win.webContents.capturePage()).toPNG());
    // Only this test's uniquely created temporary directory is removed.
    fs.rmSync(fixtureProject, { recursive: true, force: true });
    app.exit(0);
  } catch (error) { fs.writeFileSync(report, JSON.stringify({ passed: false, error: String(error) }, null, 2)); app.exit(1); }
});
