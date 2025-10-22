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
    const snapshot = await projectsCollection.orderBy('codigo').get();
    const projects = [];
    snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
    res.json(projects);
  } catch (err) {
    console.error(err);
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

// Crear proyecto (protegido) body: { nombre, codigo, descripcion }
app.post('/api/projects', requireLogin, async (req, res) => {
  const { nombre, codigo, descripcion } = req.body;
  if (!nombre || !codigo) return res.status(400).json({ error: 'Faltan campos' });
  try {
    const docRef = await projectsCollection.add({ nombre, codigo, descripcion: descripcion || '' });
    res.json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando proyecto' });
  }
});

// Editar proyecto (protegido) PUT /api/projects/:id
app.put('/api/projects/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  const data = (({ nombre, codigo, descripcion }) => ({ nombre, codigo, descripcion }))(req.body);
  try {
    await projectsCollection.doc(id).update(data);
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
    await projectsCollection.doc(id).delete();
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
