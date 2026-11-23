const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const validId = id => typeof id === 'string' && (id === 'default' || /^user-[a-f0-9-]{36}$/.test(id));
function profileName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 48 || /[\x00-\x1f]/.test(name)) throw new Error('Escribe un nombre de entre 1 y 48 caracteres.');
  return name;
}
class UserProfiles {
  constructor(root) {
    this.root = root; this.file = path.join(root, 'user-profiles.json');
    fs.mkdirSync(root, { recursive: true });
    if (!fs.existsSync(this.file)) {
      const directory = path.join(root, 'users', 'default'); fs.mkdirSync(directory, { recursive: true });
      for (const file of ['ui-preferences.json', 'projects.json', 'custom-terminals.json']) {
        const old = path.join(root, file), target = path.join(directory, file);
        if (fs.existsSync(old) && !fs.existsSync(target)) fs.copyFileSync(old, target);
      }
      this.write({ active: 'default', profiles: [{ id: 'default', name: 'Principal' }] });
    }
    this.read();
  }
  read() {
    const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (!value || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 100) throw new Error('No se puede leer la lista de perfiles. El archivo se conserva.');
    const ids = new Set();
    for (const entry of value.profiles) {
      if (!validId(entry.id) || ids.has(entry.id) || profileName(entry.name) !== entry.name) throw new Error('Lista de perfiles no válida.');
      ids.add(entry.id);
    }
    if (!ids.has(value.active)) throw new Error('Perfil activo no válido.');
    return value;
  }
  write(value) {
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2)); fs.renameSync(temporary, this.file);
  }
  list() { const value = this.read(); return { active: value.active, profiles: value.profiles.map(entry => ({ ...entry })) }; }
  current() { const value = this.read(); return value.profiles.find(entry => entry.id === value.active); }
  directory(id = this.current().id) {
    if (!validId(id) || !this.read().profiles.some(entry => entry.id === id)) throw new Error('El perfil no existe.');
    const directory = path.join(this.root, 'users', id); fs.mkdirSync(directory, { recursive: true }); return directory;
  }
  create(name) {
    const value = this.read(), clean = profileName(name);
    if (value.profiles.length >= 100) throw new Error('Puedes guardar hasta 100 perfiles.');
    if (value.profiles.some(entry => entry.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error('Ya existe un perfil con ese nombre.');
    const entry = { id: 'user-' + randomUUID(), name: clean };
    fs.mkdirSync(path.join(this.root, 'users', entry.id), { recursive: true });
    value.profiles.push(entry); this.write(value); return entry;
  }
  rename(id, name) {
    const value = this.read(), entry = value.profiles.find(item => item.id === id), clean = profileName(name);
    if (!entry) throw new Error('El perfil no existe.');
    if (value.profiles.some(item => item.id !== id && item.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error('Ya existe un perfil con ese nombre.');
    entry.name = clean; this.write(value); return entry;
  }
  switch(id) {
    const value = this.read();
    if (!value.profiles.some(entry => entry.id === id)) throw new Error('El perfil no existe.');
    value.active = id; this.write(value); return this.current();
  }
}
module.exports = { UserProfiles };
