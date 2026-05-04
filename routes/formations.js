const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'fp_jwt_dev_secret_change_in_production_2026';

function auth(req, res, next) {
  const token = (req.cookies && req.cookies.access_token) || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = db.get('users').find({ id: decoded.sub, is_active: true }).value();
    if (!req.user) return res.status(401).json({ error: 'Introuvable' });
    next();
  } catch { res.status(401).json({ error: 'TOKEN_EXPIRED' }); }
}
router.use(auth);

router.get('/', (req, res) => {
  res.json({ formations: db.get('formations').filter({ user_id: req.user.id, is_active: true }).value() });
});

router.post('/', (req, res) => {
  const { title, description, duration_hours, price_ht, tva_rate, type, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  const f = { id: uuidv4(), user_id: req.user.id, title, description: description||'', duration_hours: parseFloat(duration_hours)||0, price_ht: parseFloat(price_ht)||0, tva_rate: parseFloat(tva_rate)||20, type: type||'presentiel', category: category||'', is_active: true, created_at: new Date().toISOString() };
  db.get('formations').push(f).write();
  res.status(201).json({ message: 'Formation créée', formation: f });
});

router.put('/:id', (req, res) => {
  const f = db.get('formations').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!f) return res.status(404).json({ error: 'Formation introuvable' });
  db.get('formations').find({ id: req.params.id }).assign({ ...req.body, updated_at: new Date().toISOString() }).write();
  res.json({ message: 'Formation mise à jour' });
});

router.delete('/:id', (req, res) => {
  const f = db.get('formations').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!f) return res.status(404).json({ error: 'Formation introuvable' });
  db.get('formations').find({ id: req.params.id }).assign({ is_active: false }).write();
  res.json({ message: 'Formation archivée' });
});

module.exports = router;
