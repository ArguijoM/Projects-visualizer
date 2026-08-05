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

  // Formato de fecha para mostrar (dd/mm/yyyy)
  const fechaDisplay = p.fechaEntrega
    ? (() => {
        const [y, m, d] = p.fechaEntrega.split('-');
        return `${d}/${m}/${y}`;
      })()
    : null;

  // Ícono de estado de fecha
  const deadlineStatus = getDeadlineStatus(p.fechaEntrega);

  div.innerHTML = `
    <div class="project-info">
      <div class="project-top-row">
        <strong>${p.nombre}</strong>
        <div class="deadline-row">
          ${isAdmin ? `
            <i class="fa-regular fa-calendar deadline-icon"></i>
            <input
              type="text"
              class="deadline-input flatpickr-input"
              id="deadline-${p.id}"
              placeholder="Agregar fecha"
              value="${p.fechaEntrega || ''}"
              data-id="${p.id}"
              readonly
            />
            ${p.fechaEntrega ? `<button class="deadline-clear" title="Quitar fecha" data-id="${p.id}"><i class="fa-solid fa-xmark"></i></button>` : ''}
          ` : (fechaDisplay ? `
            <i class="fa-regular fa-calendar${deadlineStatus.icon} deadline-icon ${deadlineStatus.cls}"></i>
            <span class="deadline-display ${deadlineStatus.cls}">${fechaDisplay}</span>
          ` : '')}
        </div>
      </div>
      <div class="meta">Código: ${p.clave}</div>
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

  // Bloque de flechas + select de orden (solo visible para admin)
  const arrows = document.createElement('div');
  arrows.className = 'move-arrows';

  // Generar opciones del select (1 al total de proyectos)
  const total = projects.length;
  let options = '';
  for (let i = 1; i <= total; i++) {
    options += `<option value="${i}" ${i === p.orden ? 'selected' : ''}>${i}</option>`;
  }

  arrows.innerHTML = `
    <button class="up"><i class="fa-solid fa-angle-up"></i></button>
    <select class="order-select" title="Mover a posición">${options}</select>
    <button class="down"><i class="fa-solid fa-angle-down"></i></button>
  `;
  arrows.querySelector('.up').onclick = () => moveProject(p, -1);
  arrows.querySelector('.down').onclick = () => moveProject(p, 1);
  arrows.querySelector('.order-select').onchange = async (e) => {
    const newOrden = parseInt(e.target.value);
    if (newOrden !== p.orden) {
      await jumpProject(p, newOrden);
    }
  };
  arrows.style.display = isAdmin ? 'flex' : 'none';

  wrapper.appendChild(arrows);
  container.appendChild(wrapper);

  // Inicializar Flatpickr en el input de fecha (solo admin)
  if (isAdmin) {
    const inputEl = document.getElementById(`deadline-${p.id}`);
    if (inputEl) {
      flatpickr(inputEl, {
        locale: 'es',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        defaultDate: p.fechaEntrega || null,
        allowInput: false,
        onChange: async (selectedDates, dateStr) => {
          await saveDeadline(p.id, dateStr);
          // Re-render sin loader para reflejar el estado de color
          await fetchProjects(false);
        }
      });

      // Botón de limpiar fecha
      const clearBtn = div.querySelector(`.deadline-clear[data-id="${p.id}"]`);
      if (clearBtn) {
        clearBtn.onclick = async (e) => {
          e.stopPropagation();
          await saveDeadline(p.id, null);
          await fetchProjects(false);
        };
      }
    }
  }
});

}

async function saveDeadline(projectId, dateStr) {
  try {
    const res = await fetch(`/api/projects/${projectId}/deadline`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ fechaEntrega: dateStr || null })
    });
    if (!res.ok) {
      const e = await res.json();
      alert('Error guardando fecha: ' + (e.error || res.status));
    }
  } catch (err) {
    console.error(err);
    alert('Error de conexión al guardar fecha');
  }
}

function getDeadlineStatus(fechaEntrega) {
  if (!fechaEntrega) return { cls: '', icon: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(fechaEntrega + 'T00:00:00');
  const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { cls: 'deadline-overdue', icon: '-xmark' };
  if (diffDays <= 7) return { cls: 'deadline-soon', icon: '-clock' };
  return { cls: 'deadline-ok', icon: '' };
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
  try {
    const res = await fetch('/api/projects');
    const all = await res.json();

    all.sort((a, b) => a.orden - b.orden);

    const index = all.findIndex(p => p.id === project.id);
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= all.length) return;

    const targetProject = all[newIndex];

    // Intercambiar orden usando PUT
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ orden: targetProject.orden })
    });

    await fetchProjects();
  } catch (err) {
    console.error(err);
    alert('Error al mover proyecto');
  }
}


async function jumpProject(project, newOrden) {
  try {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ orden: newOrden })
    });
    if (!res.ok) {
      const e = await res.json();
      alert('Error al mover proyecto: ' + (e.error || res.status));
      return;
    }
    await fetchProjects(false);
  } catch (err) {
    console.error(err);
    alert('Error al mover proyecto');
  }
}

// Modal logic
function openModal(project = null) {
  const modal = document.getElementById('modal');
  const inputNombre = document.getElementById('p-nombre');
  const inputClave = document.getElementById('p-clave');

  if (!modal || !inputNombre || !inputClave) {
    console.error("Modal o inputs no encontrados en el DOM");
    return;
  }

  modal.style.display = 'block';
  editingId = project ? project.id : null;
  document.getElementById('modal-title').textContent = project ? 'Editar Proyecto' : 'Nuevo Proyecto';
  inputNombre.value = project ? project.nombre : '';
  inputClave.value = project ? project.clave : '';
}


function closeModal() {
  document.getElementById('modal').style.display = 'none';
  editingId = null;
}

// Guardar (crear o editar)
async function saveProject() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const clave = document.getElementById('p-clave').value.trim();

  if (!nombre || !clave) return alert('Nombre y código son obligatorios');

  const bodyData = { nombre, clave };
  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/projects/${editingId}` : '/api/projects';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(bodyData)
  });

  if (res.ok) {
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