let isAdmin = false;
let editingId = null;

async function fetchProjects() {
  const loader = document.getElementById('loader');
  const container = document.getElementById('projects');

  loader.style.display = 'block';   // mostrar spinner
  container.innerHTML = '';         // limpiar proyectos previos

  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    renderProjects(data);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Error al cargar los proyectos.</p>';
  } finally {
    loader.style.display = 'none';  // ocultar spinner
  }
}

function renderProjects(projects) {
  const container = document.getElementById('projects');
  container.innerHTML = '';

  projects.forEach(p => {
    const div = document.createElement('div');
    div.className = 'project';
    div.innerHTML = `
      <div>
        <strong>${p.nombre}</strong>
        <div class="meta">Código: ${p.codigo}</div>
        <p>${p.descripcion || ''}</p>
      </div>
    `;

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

    container.appendChild(div);
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

// Modal logic
function openModal(project = null) {
  const modal = document.getElementById('modal');
  modal.style.display = 'block';
  editingId = project ? project.id : null;
  document.getElementById('modal-title').textContent = project ? 'Editar Proyecto' : 'Nuevo Proyecto';
  document.getElementById('p-nombre').value = project ? project.nombre : '';
  document.getElementById('p-codigo').value = project ? project.codigo : '';
  document.getElementById('p-desc').value = project ? project.descripcion || '' : '';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  editingId = null;
}

// Guardar (crear o editar)
async function saveProject() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const codigo = document.getElementById('p-codigo').value.trim();
  const descripcion = document.getElementById('p-desc').value.trim();

  if (!nombre || !codigo) {
    alert('Nombre y código son obligatorios');
    return;
  }

  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/projects/${editingId}` : '/api/projects';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ nombre, codigo, descripcion })
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
