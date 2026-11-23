// Comprueba «Mantener los terminales al cerrar la ventana». Uso: electron smoke-background.cjs --user-data-dir=<carpeta temporal>
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
dialog.showMessageBox = async () => ({ response: 0 });
const hooks = require('./main').__test;
const wait = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const result = (ok, extra = {}) => fs.writeFileSync('smoke-background-result.json', JSON.stringify({ ok, ...extra }, null, 2));
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    const run = code => win.webContents.executeJavaScript('(async()=>{try{' + code + '}catch(e){return {__error:String(e.message)}}})()');
    const check = async (name, code, expected = true) => {
      const value = await run(code);
      if (value && value.__error) throw Error(name + ': ' + value.__error);
      if (JSON.stringify(value) !== JSON.stringify(expected)) throw Error(name + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(value));
    };
    await wait(1000);
    await check('Empieza desactivado', "return backgroundMode.isEnabled()", false);
    await run("chooseFolder(" + JSON.stringify(__dirname.split(String.fromCharCode(92)).join('/')) + "); await launch('powershell'); return 1;");
    await wait(1500);

    // Desactivado: cerrar pide confirmación y, si se rechaza, la ventana sigue visible
    win.close(); await wait(800);
    if (!win.isVisible()) throw Error('Con el ajuste desactivado la ventana debía seguir visible tras rechazar el cierre');
    if (hooks.hasTray()) throw Error('No debía haber bandeja con el ajuste desactivado');

    // Activado: la ventana se oculta, hay bandeja y el terminal sigue vivo
    await check('Se activa', "return await backgroundMode.set(true)", true);
    await wait(500);
    win.close(); await wait(800);
    if (!hooks.isHidden()) throw Error('La ventana debía quedar oculta');
    if (!hooks.hasTray()) throw Error('Debía aparecer el icono de la bandeja');
    if (win.isDestroyed()) throw Error('La ventana no debía destruirse');
    await check('El terminal sigue vivo en segundo plano', "return sessions.size", 1);
    await run("sessions.get(active).term.input('echo sigo-aqui-' + (40 + 2) + String.fromCharCode(13), true); return 1;");
    await wait(1200);
    await check('Sigue respondiendo oculto', "const b = sessions.get(active).term.buffer.active; let t = ''; for (let i = 0; i < b.length; i++) t += (b.getLine(i)?.translateToString(true) || '') + ' '; return /sigo-aqui-42/.test(t.replace(/echo sigo-aqui-\\(40 \\+ 2\\)/g, ''))");

    // Volver a abrirla quita la bandeja
    win.show(); await wait(600);
    if (hooks.isHidden()) throw Error('La ventana debía mostrarse');
    if (hooks.hasTray()) throw Error('La bandeja debía desaparecer al mostrar la ventana');
    await check('El ajuste persiste', "return JSON.stringify(await window.desktop.savePreferences({ keepRunning: true })) !== undefined && backgroundMode.isEnabled()");

    // Sin terminales abiertos, cerrar cierra de verdad aunque el ajuste esté activo
    dialog.showMessageBox = async () => ({ response: 1 });
    await run("for (const id of [...sessions.keys()]) { await close(id); } return 1;");
    await wait(1200);
    await check('No quedan terminales', "return sessions.size", 0);
    result(true, { final: 'pendiente' });
    win.close();
    await wait(800);
    if (!win.isDestroyed()) result(false, { error: 'Sin terminales la ventana debía cerrarse de verdad' });
    app.exit(win.isDestroyed() ? 0 : 1);
  } catch (error) {
    result(false, { error: String(error) });
    app.exit(1);
  }
});
