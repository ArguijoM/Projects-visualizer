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
    const snapshot = await projectsCollection
      .where('tipo', '==', 1)
      .orderBy('orden', 'asc')
      .get();

    const projects = [];
    snapshot.forEach(doc => {
      projects.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json(projects);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
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
  const { nombre, clave } = req.body;
  if (!nombre || !clave) return res.status(400).json({ error: 'Faltan campos' });

  try {
    const snapshot = await projectsCollection.get();
    const orden = snapshot.size + 1; // agregar al final

    const docRef = await projectsCollection.add({ nombre, clave, orden });
    res.json({ id: docRef.id, nombre, clave, orden });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando proyecto' });
  }
});


// Editar proyecto (protegido)
app.put('/api/projects/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  const { nombre, clave, orden: newOrden } = req.body;

  try {
    const docRef = projectsCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const updates = {};
    if (nombre) updates.nombre = nombre;
    if (clave) updates.clave = clave;

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

// Actualizar fecha de entrega (protegido)
app.patch('/api/projects/:id/deadline', requireLogin, async (req, res) => {
  const id = req.params.id;
  const { fechaEntrega } = req.body;

  try {
    const docRef = projectsCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Proyecto no encontrado' });

    // fechaEntrega puede ser null para borrarla
    await docRef.update({ fechaEntrega: fechaEntrega || null });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando fecha de entrega' });
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