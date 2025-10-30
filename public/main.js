let isAdmin = false;
let editingId = null;

async function fetchProjects(showLoader = true) {
  const loader = document.getElementById('loader');
  const container = document.getElementById('projects');

  if (showLoader) loader.style.display = 'block';  // mostrar spinner solo si se indica
  container.innerHTML = '';                        // limpiar proyectos previos

  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    renderProjects(data);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="text-align:center;color:#888;">Error al cargar los proyectos.</p>';
  } finally {
    if (showLoader) loader.style.display = 'none';  // ocultar spinner si se mostró
  }
}


function renderProjects(projects) {
  const container = document.getElementById('projects');
  container.innerHTML = '';

  if (!projects || projects.length === 0) {
    // Mostrar mensaje centrado
    const msg = document.createElement('div');
    msg.textContent = 'No hay proyectos';
    msg.style.textAlign = 'center';
    msg.style.color = '#888';
    msg.style.padding = '40px 0';
    msg.style.fontSize = '1.2em';
    container.appendChild(msg);
    return;
  }

  // Ordenar proyectos por el campo 'orden' (menor primero)
  projects.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

 projects.forEach((p, index) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'project-wrapper';

  // Bloque principal del proyecto
  const div = document.createElement('div');
  div.className = 'project';
  div.innerHTML = `
    <div>
      <strong>${p.nombre}</strong>
      <div class="meta">Código: ${p.codigo}</div>
    </div>
  `;

  // Acciones admin
  if (isAdmin) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = `
      <button class="edit"><i class="fa-solid fa-file-pen"></i></button>
      <button class="delete"><i class="fa-solid fa-trash"></i></button>
    `;
    actions.querySelector('.edit').onclick = () => openModal(p);
    actions.querySelector('.delete').onclick = () => deleteProject(p.id);
    div.appendChild(actions);
  }

  wrapper.appendChild(div);

  // Bloque de flechas (solo visible para admin)
  const arrows = document.createElement('div');
  arrows.className = 'move-arrows';
  arrows.innerHTML = `
    <button class="up"><i class="fa-solid fa-angle-up"></i></button>
    <button class="down"><i class="fa-solid fa-angle-down"></i></button>
  `;
  arrows.querySelector('.up').onclick = () => moveProject(p, -1);
  arrows.querySelector('.down').onclick = () => moveProject(p, 1);
  arrows.style.display = isAdmin ? 'flex' : 'none';

  wrapper.appendChild(arrows);
  container.appendChild(wrapper);
});

}

async function deleteProject(id) {
  if (!confirm('¿Seguro que deseas eliminar este proyecto?')) return;
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  });
  if (res.ok) {
    alert('Proyecto eliminado');
    fetchProjects();
  } else {
    alert('Error eliminando');
  }
}

async function moveProject(project, direction) {
  const loader = document.getElementById('loader');
  const container = document.getElementById('projects');

  // Mostrar loader y ocultar proyectos
  loader.style.display = 'block';
  container.style.display = 'none';

  try {
    const res = await fetch('/api/projects');
    const all = await res.json();

    all.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

    const index = all.findIndex(p => p.id === project.id);
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= all.length) return;

    all[index].orden ??= index;
    all[newIndex].orden ??= newIndex;

    const temp = all[index].orden;
    all[index].orden = all[newIndex].orden;
    all[newIndex].orden = temp;

    // Guardar cambios en Firebase
    for (const p of [all[index], all[newIndex]]) {
      await fetch(`/api/projects/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orden: p.orden })
      });
    }

    await fetchProjects(true); // refrescar proyectos con loader
  } catch (err) {
    console.error(err);
    alert('Error al mover proyecto');
  } finally {
    // Ocultar loader y mostrar proyectos
    loader.style.display = 'none';
    container.style.display = 'block';
  }
}


// Modal logic
function openModal(project = null) {
  const modal = document.getElementById('modal');
  const inputNombre = document.getElementById('p-nombre');
  const inputCodigo = document.getElementById('p-codigo');

  if (!modal || !inputNombre || !inputCodigo) {
    console.error("Modal o inputs no encontrados en el DOM");
    return;
  }

  modal.style.display = 'block';
  editingId = project ? project.id : null;
  document.getElementById('modal-title').textContent = project ? 'Editar Proyecto' : 'Nuevo Proyecto';
  inputNombre.value = project ? project.nombre : '';
  inputCodigo.value = project ? project.codigo : '';
}


function closeModal() {
  document.getElementById('modal').style.display = 'none';
  editingId = null;
}

// Guardar (crear o editar)
async function saveProject() {
  const inputNombre = document.getElementById('p-nombre');
  const inputCodigo = document.getElementById('p-codigo');

  const nombre = inputNombre.value.trim();
  const codigo = inputCodigo.value.trim();

  if (!nombre || !codigo) {
    alert('Nombre y código son obligatorios');
    return;
  }

  let bodyData = { nombre, codigo };

  if (!editingId) {
    // NUEVO proyecto: obtener la cantidad de proyectos existentes
    const resAll = await fetch('/api/projects');
    if (!resAll.ok) {
      alert('No se pudieron obtener los proyectos existentes');
      return;
    }
    const allProjects = await resAll.json();
    bodyData.orden = allProjects.length + 1; // asignar el último lugar
  }

  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/projects/${editingId}` : '/api/projects';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(bodyData)
  });

  if (res.ok) {
    alert(editingId ? 'Proyecto actualizado' : 'Proyecto creado');
    closeModal();
    fetchProjects();
  } else {
    const e = await res.json();
    alert('Error: ' + (e.error || res.status));
  }
}

// Login Flow
async function loginFlow() {
  if (!isAdmin) {
    const pass = prompt('Introduce contraseña de admin:');
    if (!pass) return;
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass }),
      credentials: 'same-origin'
    });
    if (!r.ok) {
      const e = await r.json();
      alert('Login fallido: ' + (e.error || r.status));
      return;
    }
    isAdmin = true;
    document.getElementById('btn-logout').style.display = 'inline-block';
    document.getElementById('btn-admin').style.display = 'none'; // oculta login
    document.getElementById('btn-add').style.display = 'inline-block'; // muestra "+"
    //alert('Login correcto');
    fetchProjects();
  }
}

// Logout
async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  isAdmin = false;
  closeModal();
  fetchProjects();
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('btn-add').style.display = 'none';
  document.getElementById('btn-admin').style.display = 'inline-block';
  //alert('Sesión cerrada');
}

document.addEventListener('DOMContentLoaded', () => {
  fetchProjects();

  const btnAdmin = document.getElementById('btn-admin');
  const btnLogout = document.getElementById('btn-logout');
  const btnAdd = document.getElementById('btn-add');
  const modal = document.getElementById('modal');
  const modalClose = document.getElementById('modal-close');
  const btnSave = document.getElementById('btn-save');

  btnAdmin.addEventListener('click', loginFlow);
  btnLogout.addEventListener('click', logout);
  btnAdd.addEventListener('click', () => openModal());
  modalClose.onclick = closeModal;
  btnSave.onclick = saveProject;

  // Cerrar modal clicando fuera
  //  window.onclick = (e) => {
  //    if (e.target === modal) closeModal();
  //  };
});
