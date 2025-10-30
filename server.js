// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar Firebase Admin con la clave JSON
//const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
const projectsCollection = db.collection('projects');

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_default',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true } // en producción añadí secure: true y sameSite
}));

// Helper: comprobar si está logeado
function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

// Rutas API

// Obtener todos los proyectos (público)
app.get('/api/projects', async (req, res) => {
  try {
    const snapshot = await projectsCollection.orderBy('orden', 'asc').get();
    const projects = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      projects.push({ id: doc.id, ...data });
    });

    const ordered = projects.sort((a, b) => {
      const orderA = a.orden !== undefined ? a.orden : 9999;
      const orderB = b.orden !== undefined ? b.orden : 9999;
      return orderA - orderB;
    });

    res.json(ordered);
  } catch (err) {
    console.error('Error obteniendo proyectos:', err);
    res.status(500).json({ error: 'Error leyendo proyectos' });
  }
});


// Login (envía { password })
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Falta contraseña' });
  try {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    req.session.isAdmin = true;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en login' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.json({ ok: true });
  });
});


// Crear proyecto (protegido)
app.post('/api/projects', requireLogin, async (req, res) => {
  const { nombre, codigo } = req.body;
  if (!nombre || !codigo) return res.status(400).json({ error: 'Faltan campos' });

  try {
    const snapshot = await projectsCollection.get();
    const orden = snapshot.size + 1; // agregar al final

    const docRef = await projectsCollection.add({ nombre, codigo, orden });
    res.json({ id: docRef.id, nombre, codigo, orden });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando proyecto' });
  }
});


// Editar proyecto (protegido)
app.put('/api/projects/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  const { nombre, codigo, orden: newOrden } = req.body;

  try {
    const docRef = projectsCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const updates = {};
    if (nombre) updates.nombre = nombre;
    if (codigo) updates.codigo = codigo;

    if (newOrden !== undefined && newOrden !== doc.data().orden) {
      const oldOrden = doc.data().orden;

      // Ajustar orden de otros proyectos
      const snapshot = await projectsCollection.get();
      const batch = db.batch();

      snapshot.forEach(d => {
        const o = d.data().orden;
        if (d.id !== id) {
          // Movimiento hacia arriba
          if (newOrden < oldOrden && o >= newOrden && o < oldOrden) {
            batch.update(d.ref, { orden: o + 1 });
          }
          // Movimiento hacia abajo
          if (newOrden > oldOrden && o <= newOrden && o > oldOrden) {
            batch.update(d.ref, { orden: o - 1 });
          }
        }
      });

      updates.orden = newOrden;
      batch.update(docRef, updates);
      await batch.commit();
    } else {
      await docRef.update(updates);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando proyecto' });
  }
});

// Borrar proyecto (protegido)
app.delete('/api/projects/:id', requireLogin, async (req, res) => {
  const id = req.params.id;

  try {
    const docRef = projectsCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const deletedOrden = doc.data().orden;

    await docRef.delete();

    // Ajustar orden de los demás proyectos
    const snapshot = await projectsCollection.where('orden', '>', deletedOrden).get();
    const batch = db.batch();
    snapshot.forEach(d => batch.update(d.ref, { orden: d.data().orden - 1 }));
    await batch.commit();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error borrando proyecto' });
  }
});


// Ruta por defecto: sirve index.html (ya lo hace express.static)
// levantar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
