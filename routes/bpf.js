const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
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
  const uid = req.user.id;
  const year = parseInt(req.query.year) || new Date().getFullYear() - 1;
  const start = `${year}-01-01`;
  const end = `${year}-12-31T23:59:59`;

  const sessions = db.get('sessions').filter(s =>
    s.user_id === uid && s.status === 'realisee' &&
    s.start_datetime >= start && s.start_datetime <= end
  ).value();

  const invoices = db.get('invoices').filter(i =>
    i.user_id === uid && i.status === 'payee' &&
    i.date_emission >= start && i.date_emission <= `${year}-12-31`
  ).value();

  const learnerIds = new Set();
  sessions.forEach(s => { if (s.learners_count) learnerIds.add(s.id); });

  const totalHours = sessions.reduce((sum, s) => {
    const diff = (new Date(s.end_datetime) - new Date(s.start_datetime)) / 3600000;
    return sum + (isNaN(diff) ? 0 : diff);
  }, 0);

  const caTTC = invoices.reduce((sum, i) => sum + (i.amount_ttc || 0), 0);
  const caHT = invoices.reduce((sum, i) => sum + (i.amount_ht || 0), 0);
  const learnersTotal = sessions.reduce((sum, s) => sum + (s.learners_count || 0), 0);
  const clientIds = [...new Set(invoices.map(i => i.client_id).filter(Boolean))];

  const byType = { presentiel: 0, distanciel: 0, hybride: 0 };
  sessions.forEach(s => { if (byType[s.type] !== undefined) byType[s.type]++; });

  const qualiopi = db.get('qualiopi').filter({ user_id: uid }).value();
  const qualiopiScore = Math.min(Math.round((qualiopi.length / 14) * 100), 100);

  res.json({
    year,
    generated_at: new Date().toISOString(),
    formateur: {
      nom: `${req.user.first_name} ${req.user.last_name}`,
      siret: req.user.siret || '—',
      adresse: `${req.user.address || ''} ${req.user.city || ''} ${req.user.postal_code || ''}`.trim()
    },
    sessions: {
      total: sessions.length,
      heures_total: Math.round(totalHours * 10) / 10,
      par_type: byType
    },
    apprenants: {
      total: learnersTotal,
      clients_count: clientIds.length
    },
    financier: {
      ca_ht: Math.round(caHT),
      ca_ttc: Math.round(caTTC),
      factures_count: invoices.length
    },
    qualiopi: {
      score: qualiopiScore,
      preuves_count: qualiopi.length,
      certifie: qualiopiScore >= 80
    },
    sessions_detail: sessions,
    invoices_detail: invoices
  });
});

module.exports = router;
