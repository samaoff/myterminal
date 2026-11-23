const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { createHash } = require('node:crypto');
const home = os.homedir();
const codexHome = process.env.CODEX_HOME || path.join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
function inside(root, target) { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }
async function projectPath(folder, relative = '') {
  if (typeof folder !== 'string' || typeof relative !== 'string') throw new Error('Ruta no válida.');
  const root = await fs.realpath(folder);
  const target = await fs.realpath(path.resolve(root, relative));
  if (!inside(root, target)) throw new Error('El archivo está fuera del proyecto.');
  return target;
}
async function textFile(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Solo se muestran archivos de texto de hasta 1 MB.');
  const buffer = await fs.readFile(file);
  if (buffer.includes(0)) throw new Error('Este archivo es binario.');
  return buffer.toString('utf8');
}
function metadata(text, fallback) {
  const head = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
  const field = name => {
    const value = head.match(new RegExp('^' + name + ':[ \\t]*(.*)$', 'm'))?.[1]?.trim() || '';
    if (/^[>|][-+]?$/.test(value)) return head.match(new RegExp('^' + name + ':.*\\r?\\n((?:[ \\t]+.*(?:\\r?\\n|$))*)', 'm'))?.[1]?.trim().replace(/\s+/g, ' ') || '';
    if (value.startsWith('"')) { try { return JSON.parse(value); } catch {} }
    return value.replace(/^(['"])([\s\S]*)\1$/, '$2');
  };
  return { name: field('name') || fallback, description: field('description') || 'Sin descripción en SKILL.md' };
}
function skillRoots(folder) {
  const roots = [
    { path: path.join(home, '.agents', 'skills'), agent: 'Codex', scope: 'Personal' },
    { path: path.join(codexHome, 'skills'), agent: 'Codex', scope: 'Personal / sistema' },
    { path: path.join(claudeHome, 'skills'), agent: 'Claude', scope: 'Personal' },
    { path: path.join(codexHome, 'plugins', 'cache'), agent: 'Codex', scope: 'Caché de plugin' },
    { path: path.join(claudeHome, 'plugins', 'cache'), agent: 'Claude', scope: 'Caché de plugin' }
  ];
  if (folder) {
    let current = path.resolve(folder);
    for (let level = 0; level < 20; level++) {
      const scope = level === 0 ? 'Proyecto' : 'Carpeta superior';
      roots.unshift({ path: path.join(current, '.agents', 'skills'), agent: 'Codex', scope }, { path: path.join(current, '.claude', 'skills'), agent: 'Claude', scope }, { path: path.join(current, '.codex', 'skills'), agent: 'Codex', scope: scope + ' / heredada' });
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return roots;
}
async function listSkills(folder) {
  const skills = [], warnings = [], seen = new Set();
  async function scan(dir, root, depth) {
    if (depth > 9 || skills.length >= 1500) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code !== 'ENOENT') warnings.push(`${dir}: ${error.code}`); return; }
    const skill = entries.find(e => e.name === 'SKILL.md' && e.isFile());
    if (skill) {
      const file = path.join(dir, 'SKILL.md');
      if (!seen.has(file)) {
        seen.add(file);
        try { const content = await textFile(file); skills.push({ ...metadata(content, path.basename(dir)), file, agent: root.agent, scope: root.scope }); }
        catch (error) { warnings.push(`${file}: ${error.message}`); }
      }
      return;
    }
    for (const entry of entries) if (entry.isDirectory() && !['node_modules', '.git', 'scripts', 'references', 'assets'].includes(entry.name)) await scan(path.join(dir, entry.name), root, depth + 1);
  }
  for (const root of skillRoots(folder)) await scan(root.path, root, 0);
  return { skills, warnings };
}
function targetRoot(folder, target) {
  if (target === 'codex-user') return path.join(home, '.agents', 'skills');
  if (target === 'claude-user') return path.join(claudeHome, 'skills');
  if (!folder) throw new Error('Selecciona un proyecto primero.');
  if (target === 'codex-project') return path.join(folder, '.agents', 'skills');
  if (target === 'claude-project') return path.join(folder, '.claude', 'skills');
  throw new Error('Destino no válido.');
}
async function inspectSkill(source, root) {
  const content = await textFile(path.join(source, 'SKILL.md'));
  const info = metadata(content, path.basename(source));
  const header = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
  if (!/^name:[ \t]*\S/m.test(header) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(info.name) || info.name.length > 64 || !/^description:[ \t]*\S/m.test(header)) throw new Error('La skill necesita un SKILL.md con name (minúsculas y guiones) y description en la cabecera YAML.');
  const destination = path.join(root, info.name);
  if (inside(path.resolve(source), path.resolve(destination)) || inside(path.resolve(destination), path.resolve(source))) throw new Error('El origen y el destino se solapan.');
  const files = []; let bytes = 0;
  async function collect(dir, relative = '', depth = 0) {
    if (depth > 15) throw new Error('Demasiados niveles de carpetas.');
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error('La importación no admite enlaces simbólicos.');
      const rel = path.join(relative, entry.name), file = path.join(dir, entry.name);
      if (entry.isDirectory()) await collect(file, rel, depth + 1);
      else if (entry.isFile()) { bytes += (await fs.stat(file)).size; files.push({ file, rel }); }
      else throw new Error('La carpeta contiene un archivo no compatible.');
      if (bytes > 25 * 1024 * 1024 || files.length > 1000) throw new Error('La skill supera el límite de 25 MB o 1000 archivos.');
    }
  }
  await collect(source);
  const hash = createHash('sha256');
  for (const item of files) { hash.update(item.rel); hash.update(await fs.readFile(item.file)); }
  let exists = false; try { await fs.lstat(destination); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { ...info, content, destination, files: files.map(f => f.rel), bytes, exists, fingerprint: hash.digest('hex') };
}
async function importSkill(source, root, expectedFingerprint) {
  const preview = await inspectSkill(source, root);
  if (expectedFingerprint && expectedFingerprint !== preview.fingerprint) throw new Error('La skill ha cambiado desde la previsualización. Vuelve a revisarla.');
  if (preview.exists) throw new Error('Ya existe una skill con ese nombre. No se ha sobrescrito.');
  const { name, description, destination } = preview;
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  if (!inside(realRoot, path.join(realRoot, name))) throw new Error('Destino no válido.');
  try { await fs.mkdir(destination); } catch (error) { if (error.code === 'EEXIST') throw new Error('Ya existe una skill con ese nombre. No se ha sobrescrito.'); throw error; }
  // Copy scripts and supporting files as data; importing never executes them.
  for (const rel of preview.files) { const out = path.join(destination, rel); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.copyFile(path.join(source, rel), out, 1); }
  return { name, description, destination, files: preview.files.length };
}
async function previewCreatedSkill(root, { name, description, instructions }) {
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error('Nombre: usa minúsculas, números y guiones, hasta 64 caracteres.');
  if (typeof description !== 'string' || !description.trim() || description.length > 1024) throw new Error('Añade una descripción de hasta 1024 caracteres indicando cuándo usar la skill.');
  if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 100000) throw new Error('Añade instrucciones de hasta 100 000 caracteres.');
  const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description.trim())}\n---\n\n${instructions.trim()}\n`;
  const destination = path.join(root, name);
  let exists = false; try { await fs.lstat(destination); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { name, description, content, destination, files: ['SKILL.md'], bytes: Buffer.byteLength(content), exists };
}
async function createSkill(root, fields) {
  const preview = await previewCreatedSkill(root, fields);
  if (preview.exists) throw new Error('Ya existe una skill con ese nombre. No se ha sobrescrito.');
  await fs.mkdir(root, { recursive: true });
  try { await fs.mkdir(preview.destination); } catch (error) { if (error.code === 'EEXIST') throw new Error('Ya existe una skill con ese nombre.'); throw error; }
  await fs.writeFile(path.join(preview.destination, 'SKILL.md'), preview.content, { flag: 'wx' });
  return { name: preview.name, destination: preview.destination, files: 1 };
}
async function files(folder, relative) {
  const dir = await projectPath(folder, relative);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(e => !['node_modules', '.git', '.venv', '__pycache__'].includes(e.name)).sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).slice(0, 500).map(e => ({ name: e.name, directory: e.isDirectory(), relative: path.join(relative || '', e.name) }));
}
// Paths come from Git relative to the folder (--show-prefix), so 8.3 short names or symlinks never break the match.
async function gitPrefix(options) { return (await run('git', ['rev-parse', '--show-prefix'], options)).stdout.trim(); }
function fromRepo(prefix, name) { const rel = path.posix.relative('/' + prefix, '/' + name); return rel && !rel.startsWith('..') ? rel.split('/').join(path.sep) : null; }
async function changes(folder) {
  try {
    const options = { cwd: folder, windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 15000 };
    const [status, porcelain, prefix] = await Promise.all([
      run('git', ['-c', 'core.quotepath=false', 'status', '--short', '--untracked-files=normal', '--', '.'], options),
      run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], options),
      gitPrefix(options)
    ]);
    const records = porcelain.stdout.split('\0'), entries = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i]; if (!record) continue;
      const state = record.slice(0, 2), name = record.slice(3);
      const relative = fromRepo(prefix, name);
      let previous = null;
      if (/[RC]/.test(state)) previous = records[++i];
      if (relative) entries.push({ relative, state, previous });
    }
    return { status: status.stdout, entries };
  } catch (error) { throw new Error(error.stderr?.includes('not a git repository') ? 'Esta carpeta no pertenece a un repositorio Git.' : 'No se pudieron leer los cambios Git: ' + error.message); }
}
async function fileChange(folder, relative) {
  if (typeof relative !== 'string' || !relative || !inside(path.resolve(folder), path.resolve(folder, relative))) throw new Error('Archivo fuera del proyecto.');
  const current = await changes(folder), entry = current.entries.find(e => e.relative === relative);
  if (!entry) throw new Error('Este archivo ya no aparece como modificado. Actualiza la lista.');
  const options = { cwd: folder, windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 15000 };
  const specs = [':(literal)' + relative];
  if (entry.previous) {
    const old = fromRepo(await gitPrefix(options), entry.previous);
    if (old) specs.push(':(literal)' + old);
  }
  const [staged, working] = await Promise.all([
    run('git', ['--no-pager', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--cached', '--', ...specs], options),
    run('git', ['--no-pager', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--', ...specs], options)
  ]);
  let content = '', readError = '';
  try { content = await textFile(await projectPath(folder, relative)); }
  catch (error) { readError = error.code === 'ENOENT' ? 'El archivo fue eliminado o movido.' : error.message; }
  return { ...entry, staged: staged.stdout, working: working.stdout, content, readError };
}
module.exports = { listSkills, targetRoot, importSkill, inspectSkill, previewCreatedSkill, createSkill, textFile, files, changes, fileChange, projectPath, metadata };

function canDeleteSkill(skill) { return !/plugin|sistema/i.test(skill.scope) && !skill.file.split(/[\\/]/).includes('.system'); }
async function gitInfo(folder) {
 const options={cwd:folder,windowsHide:true,timeout:15000,maxBuffer:2*1024*1024};
 try { await run('git',['rev-parse','--show-toplevel'],options); }
 catch(error){ if(error.stderr?.includes('not a git repository')) return {available:false}; throw error; }
 const branch=(await run('git',['symbolic-ref','--quiet','--short','HEAD'],options).catch(()=>({stdout:'HEAD separado'}))).stdout.trim();
 const upstream=(await run('git',['rev-parse','--abbrev-ref','@{upstream}'],options).catch(()=>({stdout:''}))).stdout.trim();
 let ahead=0,behind=0;
 if(upstream) { const counts=(await run('git',['rev-list','--left-right','--count','HEAD...@{upstream}'],options)).stdout.trim().split(/\s+/).map(Number); [ahead,behind]=counts; }
 const history=(await run('git',['--no-pager','log','-8','--format=%h %s'],options).catch(()=>({stdout:''}))).stdout.trim();
 return {available:true,branch,upstream,ahead,behind,history};
}
async function gitAction(folder,action,relative,message) {
 const options={cwd:folder,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}};
 const info=await gitInfo(folder); if(!info.available) throw new Error('Este proyecto no tiene Git.');
 let args;
 if(action==='stage' || action==='unstage') {
  const current=await changes(folder),entry=current.entries.find(e=>e.relative===relative);
  if(!entry) throw new Error('El archivo ha cambiado. Actualiza la lista.');
  const specs=[':(literal)'+relative];
  if(entry.previous) {
   const old=fromRepo(await gitPrefix(options),entry.previous);
   if(old) specs.push(':(literal)'+old);
   else throw new Error('El renombrado cruza el límite del proyecto. Gestiona este cambio desde la raíz del repositorio.');
  }
  if(action==='stage') args=['add','--',...specs];
  else { const head=await run('git',['rev-parse','--verify','HEAD'],options).then(()=>true,()=>false); args=head?['reset','--quiet','HEAD','--',...specs]:['rm','--cached','--',...specs]; }
 } else if(action==='commit') {
  if(typeof message!=='string'||!message.trim()||message.length>2000) throw new Error('Escribe un mensaje de commit (hasta 2000 caracteres).');
  // A commit records the entire index; require the repository root to keep its scope clear.
  if(await gitPrefix(options)) throw new Error('Abre la raíz del repositorio para crear commits.');
  args=['commit','-m',message.trim()];
 } else if(action==='fetch') args=['fetch'];
 else if(action==='pull') args=['pull','--ff-only'];
 else if(action==='push') args=['push'];
 else throw new Error('Acción Git no válida.');
 try { const result=await run('git',args,options);return {output:result.stdout||result.stderr||'Operación completada'}; }
 catch(error) { throw new Error((error.stderr||error.stdout||error.message).trim()); }
}
Object.assign(module.exports,{canDeleteSkill,gitInfo,gitAction});
