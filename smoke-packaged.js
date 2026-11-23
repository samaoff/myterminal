// Test the packaged executable itself via a loopback DevTools connection.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const child = spawn(path.join(__dirname, 'dist', 'win-unpacked', 'MyTerminal.exe'), [`--remote-debugging-port=${port}`], { cwd: __dirname, windowsHide: true, stdio: 'ignore' });
  let socket; const pending = new Map(); let sequence = 0;
  const report = path.join(__dirname, 'smoke-packaged-result.json');
  try {
    let target;
    for (let i = 0; i < 80; i++) {
      await delay(150);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (target) break; } catch {}
    }
    if (!target) throw new Error('Packaged window did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
    async function evaluate(expression) {
      const id = ++sequence;
      let timeout;
      const result = await Promise.race([new Promise(resolve => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); }), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('DevTools evaluation timeout')), 20000); })]).finally(() => clearTimeout(timeout));
      if (result.error || result.result.exceptionDetails) throw new Error(JSON.stringify(result));
      return result.result.result.value;
    }
    for (let i = 0; i < 40; i++) { if (await evaluate(`typeof catalog !== 'undefined' && catalog.length > 0`)) break; await delay(150); }
    const skills = await evaluate('catalog.length');
    if (!skills) throw new Error('Packaged skill discovery failed');
    await evaluate(`chooseFolder(${JSON.stringify(__dirname)}); launch('powershell')`);
    await delay(1200);
    await evaluate(`window.desktop.write(active, "Write-Output ('PACKAGED_' + 'PTY_OK')\\r")`);
    let terminalOK = false;
    for (let i = 0; i < 30; i++) {
      await delay(200);
      terminalOK = await evaluate(`(() => { const b=sessions.get(active).term.buffer.active; return Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString()).some(l=>l.trim()==='PACKAGED_PTY_OK'); })()`);
      if (terminalOK) break;
    }
    if (!terminalOK) throw new Error('Packaged native terminal failed');
    await evaluate(`showPanel('changes')`);
    await evaluate(`openFileChange(${JSON.stringify(__dirname)}, 'features.js')`);
    if (!await evaluate(`document.querySelector('#viewer').open`)) throw new Error('Packaged per-file viewer failed');
    await evaluate(`document.querySelector('#viewer').close(); window.desktop.write(active, 'exit\\r')`);
    for (let i = 0; i < 30; i++) { if (await evaluate(`sessions.get(active).ended === true`)) break; await delay(100); }
    await evaluate(`close(active)`);
    await fs.writeFile(report, JSON.stringify({ passed: true, skills, checks: ['packaged window', 'packaged skill discovery', 'native ConPTY input/output', 'per-file viewer', 'ended session close'], timestamp: new Date().toISOString() }, null, 2));
    console.log('PASS: packaged executable, skills, ConPTY and per-file viewer');
  } catch (error) { await fs.writeFile(report, JSON.stringify({ passed: false, error: String(error) }, null, 2)); console.error(error); process.exitCode = 1; }
  finally { socket?.close(); child.kill(); }
})();
