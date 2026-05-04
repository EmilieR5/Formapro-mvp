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
  const learners = db.get('learners').filter({ user_id: req.user.id }).value();
  const enriched = learners.map(l => {
    const client = l.client_id ? db.get('clients').find({ id: l.client_id }).value() : null;
    return { ...l, client_name: client ? client.name : '—' };
  });
  res.json({ learners: enriched });
});

router.post('/', (req, res) => {
  const { first_name, last_name, email, phone, client_id, notes } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'Prénom et nom requis' });
  const l = { id: uuidv4(), user_id: req.user.id, client_id: client_id||null, first_name, last_name, email: email||'', phone: phone||'', notes: notes||'', status: 'actif', created_at: new Date().toISOString() };
  db.get('learners').push(l).write();
  res.status(201).json({ message: 'Apprenant créé', learner: l });
});

router.put('/:id', (req, res) => {
  const l = db.get('learners').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!l) return res.status(404).json({ error: 'Apprenant introuvable' });
  db.get('learners').find({ id: req.params.id }).assign({ ...req.body, updated_at: new Date().toISOString() }).write();
  res.json({ message: 'Apprenant mis à jour' });
});

module.exports = router;
