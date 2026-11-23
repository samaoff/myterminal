const profileButton = node('button', undefined, 'user-profile-button'); profileButton.id = 'user-profile-button';
const currentUserProfile = window.desktop.initialPreferences.userProfile;
const profileAvatar = node('span', currentUserProfile.name[0].toUpperCase(), 'user-profile-avatar');
profileAvatar.setAttribute('aria-hidden', 'true');
profileButton.append(profileAvatar, node('span', currentUserProfile.name, 'user-profile-name'), node('span', '⌄', 'user-profile-chevron'));
profileButton.title = 'Perfil: ' + currentUserProfile.name; profileButton.setAttribute('aria-label', 'Cambiar perfil de usuario · ' + currentUserProfile.name);
document.querySelector('.brand').after(profileButton);
const profileDialog = node('dialog'); profileDialog.id = 'user-profiles-dialog'; profileDialog.setAttribute('aria-labelledby', 'user-profiles-title');
const profileHeading = node('div', undefined, 'panel-heading');
const profileTitle = node('strong', 'Perfiles de usuario'); profileTitle.id = 'user-profiles-title';
const closeProfiles = node('button', 'Cerrar ×'); closeProfiles.setAttribute('aria-label', 'Cerrar perfiles');
profileHeading.append(profileTitle, closeProfiles);
const profileBody = node('div', undefined, 'form-body');
profileBody.append(node('p', 'Cada perfil conserva sus proyectos recientes, última carpeta, terminales, conexiones remotas y ajustes de apariencia.'));
const profileList = node('div'); profileList.id = 'user-profiles-list';
const profileMessage = node('p'); profileMessage.id = 'user-profiles-message'; profileMessage.setAttribute('role', 'status');
const profileForm = node('form'); profileForm.id = 'user-profile-form';
const profileNameLabel = node('label', 'Nombre del nuevo perfil'), profileNameInput = node('input');
profileNameInput.id = 'user-profile-name'; profileNameInput.required = true; profileNameInput.maxLength = 48; profileNameInput.placeholder = 'Por ejemplo: Dani';
profileNameLabel.append(profileNameInput);
const createProfileButton = node('button', 'Crear perfil', 'primary'); createProfileButton.type = 'submit';
profileForm.append(profileNameLabel, createProfileButton);
profileBody.append(profileList, profileMessage, profileForm, node('p', 'Los perfiles organizan esta aplicación. Las cuentas de las herramientas y los archivos siguen perteneciendo al usuario de Windows.'));
profileDialog.append(profileHeading, profileBody); document.body.append(profileDialog);
let profileBusy = false;
async function renderUserProfiles() {
  const state = await window.desktop.userProfiles(); profileList.replaceChildren();
  for (const profile of state.profiles) {
    const row = node('div', undefined, 'user-profile-row');
    const avatar = node('span', profile.name[0].toUpperCase(), 'user-profile-avatar'); avatar.setAttribute('aria-hidden','true');
    const label = node('span', profile.name, 'user-profile-entry-name');
    const edit = node('button', '✎', 'profile-action'); edit.title = 'Renombrar ' + profile.name; edit.setAttribute('aria-label', edit.title);
    edit.onclick = () => {
      if (profileBusy) return;
      const form = node('form', undefined, 'user-profile-rename'), input = node('input'), save = node('button', 'Guardar'), cancel = node('button', 'Cancelar');
      input.value = profile.name; input.maxLength = 48; input.required = true; input.setAttribute('aria-label', 'Nombre del perfil');
      save.type = 'submit'; cancel.type = 'button'; cancel.onclick = () => renderUserProfiles().catch(error => { profileMessage.textContent = error.message; });
      form.append(input, save, cancel); row.replaceChildren(form); input.focus(); input.select();
      form.onsubmit = async event => {
        event.preventDefault(); if (profileBusy) return; profileBusy = true; save.disabled = true;
        try {
          await window.desktop.renameUserProfile(profile.id, input.value);
          if (profile.id === state.active) { profileButton.querySelector('.user-profile-name').textContent = input.value.trim(); profileAvatar.textContent = input.value.trim()[0].toUpperCase(); profileButton.title = 'Perfil: ' + input.value.trim(); profileButton.setAttribute('aria-label', 'Cambiar perfil de usuario · ' + input.value.trim()); }
          await renderUserProfiles(); profileMessage.textContent = 'Nombre actualizado.';
        } catch (error) { profileMessage.textContent = error.message; } finally { profileBusy = false; save.disabled = false; }
      };
    };
    if (profile.id === state.active) row.append(avatar, label, node('span', 'Actual', 'user-profile-current'), edit);
    else {
      const switchButton = node('button', 'Entrar', 'secondary'); switchButton.setAttribute('aria-label', 'Entrar en el perfil ' + profile.name);
      switchButton.onclick = async () => {
        if (profileBusy) return; profileBusy = true; switchButton.disabled = true;
        switchButton.textContent = 'Cambiando…';
        profileMessage.textContent = 'Cargando el perfil ' + profile.name + '…';
        try {
          await themeSavePromise;
          for (const id of [...sessions.keys()]) {
            await close(id);
            if (sessions.has(id)) {
              profileMessage.textContent = 'Cambio de perfil cancelado: quedan sesiones abiertas.';
              profileBusy = false; switchButton.disabled = false; switchButton.textContent = 'Entrar';
              return;
            }
          }
          await window.desktop.switchUserProfile(profile.id);
        } catch (error) { profileMessage.textContent = error.message; profileBusy = false; switchButton.disabled = false; switchButton.textContent = 'Entrar'; }
      };
      row.append(avatar, label, edit, switchButton);
    }
    profileList.append(row);
  }
}
profileForm.onsubmit = async event => {
  event.preventDefault(); if (profileBusy) return; profileBusy = true; createProfileButton.disabled = true;
  try { await window.desktop.createUserProfile(profileNameInput.value); profileNameInput.value = ''; await renderUserProfiles(); profileMessage.textContent = 'Perfil creado. Pulsa Entrar para usarlo.'; }
  catch (error) { profileMessage.textContent = error.message; }
  finally { profileBusy = false; createProfileButton.disabled = false; }
};
profileButton.onclick = () => { profileMessage.textContent = ''; if (!profileDialog.open) profileDialog.showModal(); renderUserProfiles().catch(error => { profileMessage.textContent = error.message; }); };
closeProfiles.onclick = () => profileDialog.close(); profileDialog.addEventListener('close', () => profileButton.focus());
if (window.desktop.initialPreferences.lastFolder) chooseFolder(window.desktop.initialPreferences.lastFolder);
