const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { db, nextInvoiceNumber } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'fp_jwt_dev_secret_change_in_production_2026';

// ===== AUTH MIDDLEWARE =====
function auth(req, res, next) {
  const token = (req.cookies && req.cookies.access_token) || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.get('users').find({ id: decoded.sub, is_active: true }).value();
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    req.user = user;
    next();
  } catch(e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Token invalide' });
  }
}

router.use(auth);

// ===== DASHBOARD =====
router.get('/dashboard', (req, res) => {
  const uid = req.user.id;
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const yStart = `${now.getFullYear()}-01-01`;

  const invoices = db.get('invoices').filter({ user_id: uid }).value();
  const sessions = db.get('sessions').filter({ user_id: uid }).value();

  const caMonth = invoices.filter(i => i.status === 'payee' && i.payment_date >= mStart).reduce((s,i) => s + i.amount_ht, 0);
  const caYear = invoices.filter(i => i.status === 'payee' && i.payment_date >= yStart).reduce((s,i) => s + i.amount_ht, 0);
  const sessionsMonth = sessions.filter(s => s.start_datetime >= mStart).length;
  const overdue = invoices.filter(i => i.status === 'retard').length;
  const pending = invoices.filter(i => i.status === 'envoyee').reduce((s,i) => s + i.amount_ttc, 0);
  const total = invoices.filter(i => ['envoyee','payee'].includes(i.status)).length;
  const paid = invoices.filter(i => i.status === 'payee').length;
  const billingRate = total ? Math.round((paid/total)*100) : 0;

  // Revenue by month (last 9 months)
  const revenueByMonth = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const rev = invoices.filter(inv => inv.status === 'payee' && inv.payment_date && inv.payment_date.startsWith(monthStr)).reduce((s,inv) => s + inv.amount_ht, 0);
    revenueByMonth.push({ month: d.toLocaleString('fr-FR', { month: 'short' }), value: Math.round(rev) });
  }

  const upcomingSessions = sessions.filter(s => s.start_datetime >= now.toISOString().split('T')[0] && s.status === 'planifiee')
    .sort((a,b) => a.start_datetime.localeCompare(b.start_datetime)).slice(0,4)
    .map(s => {
      const client = db.get('clients').find({ id: s.client_id }).value();
      return { ...s, client_name: client ? client.name : '—' };
    });

  const notifs = db.get('notifications').filter({ user_id: uid }).orderBy(['created_at'], ['desc']).value();
  const qualiopi_count = db.get('qualiopi').filter({ user_id: uid }).value().length;
  const learners = db.get('learners').filter({ user_id: uid }).value().length;

  res.json({ caMonth, caYear, sessionsMonth, billingRate, overdue, pending, revenueByMonth, upcomingSessions, notifications: notifs, qualiopi_count, learners });
});

// ===== CLIENTS =====
router.get('/clients', (req, res) => {
  const clients = db.get('clients').filter({ user_id: req.user.id }).value();
  res.json({ clients });
});

router.post('/clients', (req, res) => {
  const { name, siret, email, phone, address, city, postal_code, type, opco, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const client = { id: uuidv4(), user_id: req.user.id, name, siret: siret||'', email: email||'', phone: phone||'', address: address||'', city: city||'', postal_code: postal_code||'', type: type||'entreprise', opco: opco||'', notes: notes||'', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  db.get('clients').push(client).write();
  res.status(201).json({ message: 'Client créé', client });
});

router.put('/clients/:id', (req, res) => {
  const c = db.get('clients').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!c) return res.status(404).json({ error: 'Client introuvable' });
  const { name, siret, email, phone, address, city, postal_code, type, opco, notes } = req.body;
  db.get('clients').find({ id: req.params.id }).assign({ name:name||c.name, siret:siret||c.siret, email:email||c.email, phone:phone||c.phone, address:address||c.address, city:city||c.city, postal_code:postal_code||c.postal_code, type:type||c.type, opco:opco||c.opco, notes:notes||c.notes, updated_at:new Date().toISOString() }).write();
  res.json({ message: 'Client mis à jour', client: db.get('clients').find({ id: req.params.id }).value() });
});

router.delete('/clients/:id', (req, res) => {
  const c = db.get('clients').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!c) return res.status(404).json({ error: 'Client introuvable' });
  db.get('clients').find({ id: req.params.id }).assign({ is_active: false, updated_at: new Date().toISOString() }).write();
  res.json({ message: 'Client archivé' });
});

// ===== FORMATIONS =====
router.get('/formations', (req, res) => res.json({ formations: db.get('formations').filter({ user_id: req.user.id, is_active: true }).value() }));

router.post('/formations', (req, res) => {
  const { title, description, duration_hours, price_ht, tva_rate, type, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  const f = { id: uuidv4(), user_id: req.user.id, title, description: description||'', duration_hours: parseFloat(duration_hours)||0, price_ht: parseFloat(price_ht)||0, tva_rate: parseFloat(tva_rate)||20, type: type||'presentiel', category: category||'', is_active: true, created_at: new Date().toISOString() };
  db.get('formations').push(f).write();
  res.status(201).json({ message: 'Formation créée', formation: f });
});

router.put('/formations/:id', (req, res) => {
  const f = db.get('formations').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!f) return res.status(404).json({ error: 'Formation introuvable' });
  db.get('formations').find({ id: req.params.id }).assign({ ...req.body, updated_at: new Date().toISOString() }).write();
  res.json({ message: 'Formation mise à jour' });
});

// ===== SESSIONS =====
router.get('/sessions', (req, res) => {
  const sessions = db.get('sessions').filter({ user_id: req.user.id }).orderBy(['start_datetime'], ['desc']).value();
  const enriched = sessions.map(s => {
    const client = db.get('clients').find({ id: s.client_id }).value();
    const formation = db.get('formations').find({ id: s.formation_id }).value();
    return { ...s, client_name: client ? client.name : '—', formation_title: formation ? formation.title : s.title };
  });
  res.json({ sessions: enriched });
});

router.post('/sessions', (req, res) => {
  const { formation_id, client_id, title, start_datetime, end_datetime, type, location, learners_count, notes } = req.body;
  if (!title || !start_datetime || !end_datetime) return res.status(400).json({ error: 'Titre, début et fin requis' });
  const s = { id: uuidv4(), user_id: req.user.id, formation_id: formation_id||null, client_id: client_id||null, title, start_datetime, end_datetime, type: type||'presentiel', location: location||'', status: 'planifiee', learners_count: parseInt(learners_count)||0, notes: notes||'', invoice_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  db.get('sessions').push(s).write();
  res.status(201).json({ message: 'Session créée', session: s });
});

router.put('/sessions/:id', (req, res) => {
  const s = db.get('sessions').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!s) return res.status(404).json({ error: 'Session introuvable' });
  db.get('sessions').find({ id: req.params.id }).assign({ ...req.body, updated_at: new Date().toISOString() }).write();
  res.json({ message: 'Session mise à jour', session: db.get('sessions').find({ id: req.params.id }).value() });
});

router.delete('/sessions/:id', (req, res) => {
  const s = db.get('sessions').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!s) return res.status(404).json({ error: 'Session introuvable' });
  db.get('sessions').find({ id: req.params.id }).assign({ status: 'annulee', updated_at: new Date().toISOString() }).write();
  res.json({ message: 'Session annulée' });
});

// ===== INVOICES =====
router.get('/invoices', (req, res) => {
  const invoices = db.get('invoices').filter({ user_id: req.user.id }).orderBy(['date_emission'], ['desc']).value();
  const enriched = invoices.map(i => {
    const client = db.get('clients').find({ id: i.client_id }).value();
    return { ...i, client_name: client ? client.name : '—' };
  });
  res.json({ invoices: enriched });
});

router.post('/invoices', (req, res) => {
  const { client_id, session_id, description, amount_ht, tva_rate, date_echeance, notes } = req.body;
  if (!client_id || !amount_ht) return res.status(400).json({ error: 'Client et montant HT requis' });
  const ht = parseFloat(amount_ht);
  const tva = parseFloat(tva_rate) || 20;
  const tvaAmt = ht * tva / 100;
  const ttc = ht + tvaAmt;
  const num = nextInvoiceNumber(req.user.id);
  const hash = crypto.createHash('sha256').update(num + req.user.id + ht).digest('hex').substring(0, 32);
  const now = new Date().toISOString();
  const ech = date_echeance || new Date(Date.now() + (db.get('settings').find({ user_id: req.user.id }).value()?.default_payment_terms || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const invoice = { id: uuidv4(), user_id: req.user.id, client_id, session_id: session_id||null, invoice_number: num, status: 'brouillon', date_emission: now.split('T')[0], date_echeance: ech, amount_ht: ht, tva_rate: tva, amount_tva: tvaAmt, amount_ttc: ttc, description: description||'', payment_date: null, nf525_hash: hash, reminder_count: 0, notes: notes||'', created_at: now, updated_at: now };
  db.get('invoices').push(invoice).write();
  res.status(201).json({ message: 'Facture créée', invoice });
});

router.put('/invoices/:id', (req, res) => {
  const inv = db.get('invoices').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (['payee'].includes(inv.status) && req.body.status !== 'avoir') return res.status(400).json({ error: 'Facture payée — non modifiable' });
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  if (req.body.status === 'payee' && !inv.payment_date) updates.payment_date = new Date().toISOString().split('T')[0];
  db.get('invoices').find({ id: req.params.id }).assign(updates).write();
  res.json({ message: 'Facture mise à jour', invoice: db.get('invoices').find({ id: req.params.id }).value() });
});

// POST invoice from session (one-click)
router.post('/invoices/from-session/:sessionId', (req, res) => {
  const uid = req.user.id;
  const session = db.get('sessions').find({ id: req.params.sessionId, user_id: uid }).value();
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  if (session.invoice_id) return res.status(400).json({ error: 'Cette session a déjà une facture' });
  const formation = session.formation_id ? db.get('formations').find({ id: session.formation_id }).value() : null;
  const ht = formation ? formation.price_ht : 0;
  const tva = formation ? formation.tva_rate : 20;
  const tvaAmt = ht * tva / 100;
  const ttc = ht + tvaAmt;
  const num = nextInvoiceNumber(uid);
  const hash = crypto.createHash('sha256').update(num + uid + ht).digest('hex').substring(0, 32);
  const now = new Date().toISOString();
  const settings = db.get('settings').find({ user_id: uid }).value();
  const ech = new Date(Date.now() + (settings?.default_payment_terms || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const invoice = { id: uuidv4(), user_id: uid, client_id: session.client_id, session_id: session.id, invoice_number: num, status: 'envoyee', date_emission: now.split('T')[0], date_echeance: ech, amount_ht: ht, tva_rate: tva, amount_tva: tvaAmt, amount_ttc: ttc, description: `${session.title} — ${session.learners_count} participant(s)`, payment_date: null, nf525_hash: hash, reminder_count: 0, notes: '', created_at: now, updated_at: now };
  db.get('invoices').push(invoice).write();
  db.get('sessions').find({ id: session.id }).assign({ invoice_id: invoice.id, updated_at: now }).write();
  res.status(201).json({ message: 'Facture générée', invoice });
});

// ===== QUALIOPI =====
router.get('/qualiopi', (req, res) => {
  const evidences = db.get('qualiopi').filter({ user_id: req.user.id }).orderBy(['criterion', 'evidence_date'], ['asc', 'desc']).value();
  const bycriterion = [1,2,3,4,5,6,7].map(n => ({ criterion: n, count: evidences.filter(e => e.criterion === n).length, items: evidences.filter(e => e.criterion === n) }));
  const score = Math.round((evidences.length / 14) * 100);
  res.json({ evidences, by_criterion: bycriterion, score: Math.min(score, 100), total: evidences.length });
});

router.post('/qualiopi', (req, res) => {
  const { criterion, title, description, evidence_date, sub_criterion, session_id } = req.body;
  if (!criterion || !title) return res.status(400).json({ error: 'Critère et titre requis' });
  const e = { id: uuidv4(), user_id: req.user.id, criterion: parseInt(criterion), sub_criterion: sub_criterion||'', title, description: description||'', file_name: '', evidence_date: evidence_date || new Date().toISOString().split('T')[0], session_id: session_id||null, created_at: new Date().toISOString() };
  db.get('qualiopi').push(e).write();
  res.status(201).json({ message: 'Preuve ajoutée', evidence: e });
});

router.delete('/qualiopi/:id', (req, res) => {
  const e = db.get('qualiopi').find({ id: req.params.id, user_id: req.user.id }).value();
  if (!e) return res.status(404).json({ error: 'Preuve introuvable' });
  db.get('qualiopi').remove({ id: req.params.id }).write();
  res.json({ message: 'Preuve supprimée' });
});

// ===== LEARNERS =====
router.get('/learners', (req, res) => res.json({ learners: db.get('learners').filter({ user_id: req.user.id }).value() }));

router.post('/learners', (req, res) => {
  const { first_name, last_name, email, phone, client_id } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'Prénom et nom requis' });
  const l = { id: uuidv4(), user_id: req.user.id, client_id: client_id||null, first_name, last_name, email: email||'', phone: phone||'', status: 'actif', created_at: new Date().toISOString() };
  db.get('learners').push(l).write();
  res.status(201).json({ message: 'Apprenant créé', learner: l });
});

// ===== BPF =====
router.get('/bpf', (req, res) => {
  const uid = req.user.id;
  const year = parseInt(req.query.year) || new Date().getFullYear() - 1;
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const sessions = db.get('sessions').filter(s => s.user_id === uid && s.status === 'realisee' && s.start_datetime >= start && s.start_datetime <= end+'T23:59:59').value();
  const invoices = db.get('invoices').filter(i => i.user_id === uid && i.status === 'payee' && i.date_emission >= start && i.date_emission <= end).value();
  const totalHours = sessions.reduce((s,sess) => { const diff = (new Date(sess.end_datetime) - new Date(sess.start_datetime)) / 3600000; return s + diff; }, 0);
  const caTotal = invoices.reduce((s,i) => s + i.amount_ttc, 0);
  const clientIds = [...new Set(invoices.map(i => i.client_id))];
  res.json({ year, sessions_count: sessions.length, total_hours: Math.round(totalHours * 10) / 10, learners_count: sessions.reduce((s,sess) => s + (sess.learners_count||0), 0), ca_total: caTotal, clients_count: clientIds.length, sessions, invoices });
});

// ===== NOTIFICATIONS =====
router.get('/notifications', (req, res) => {
  const notifs = db.get('notifications').filter({ user_id: req.user.id }).orderBy(['created_at'], ['desc']).value();
  res.json({ notifications: notifs, unread: notifs.filter(n => !n.is_read).length });
});

router.put('/notifications/:id/read', (req, res) => {
  db.get('notifications').find({ id: req.params.id, user_id: req.user.id }).assign({ is_read: true }).write();
  res.json({ message: 'OK' });
});

router.put('/notifications/read-all', (req, res) => {
  db.get('notifications').filter({ user_id: req.user.id }).each(n => { n.is_read = true; }).write();
  res.json({ message: 'Toutes lues' });
});

// ===== SETTINGS =====
router.get('/settings', (req, res) => {
  const uid = req.user.id;
  const user = db.get('users').find({ id: uid }).value();
  const settings = db.get('settings').find({ user_id: uid }).value() || {};
  const { password_hash, mfa_secret, ...safeUser } = user;
  res.json({ user: safeUser, settings });
});

router.put('/settings', (req, res) => {
  const uid = req.user.id;
  const { first_name, last_name, phone, siret, tva_number, tva_exempt, address, city, postal_code, invoice_prefix, default_payment_terms, bank_iban, bank_bic, notif_invoice_reminder, notif_session_reminder, notif_email } = req.body;
  const now = new Date().toISOString();
  if (first_name || last_name || phone || siret) {
    db.get('users').find({ id: uid }).assign({ ...(first_name && { first_name }), ...(last_name && { last_name }), ...(phone !== undefined && { phone }), ...(siret !== undefined && { siret }), ...(tva_number !== undefined && { tva_number }), ...(tva_exempt !== undefined && { tva_exempt }), ...(address !== undefined && { address }), ...(city !== undefined && { city }), ...(postal_code !== undefined && { postal_code }), updated_at: now }).write();
  }
  const existingSettings = db.get('settings').find({ user_id: uid }).value();
  if (existingSettings) {
    db.get('settings').find({ user_id: uid }).assign({ ...(invoice_prefix !== undefined && { invoice_prefix }), ...(default_payment_terms !== undefined && { default_payment_terms: parseInt(default_payment_terms) }), ...(bank_iban !== undefined && { bank_iban }), ...(bank_bic !== undefined && { bank_bic }), ...(notif_invoice_reminder !== undefined && { notif_invoice_reminder }), ...(notif_session_reminder !== undefined && { notif_session_reminder }), ...(notif_email !== undefined && { notif_email }), updated_at: now }).write();
  } else {
    db.get('settings').push({ user_id: uid, invoice_prefix: invoice_prefix||'FP', default_payment_terms: parseInt(default_payment_terms)||30, bank_iban: bank_iban||'', bank_bic: bank_bic||'', notif_invoice_reminder: true, notif_session_reminder: true, notif_email: true, created_at: now, updated_at: now }).write();
  }
  res.json({ message: 'Paramètres sauvegardés' });
});

// ===== AUDIT LOG (admin) =====
router.get('/audit', (req, res) => {
  const logs = db.get('audit_log').filter({ user_id: req.user.id }).orderBy(['created_at'], ['desc']).take(50).value();
  res.json({ logs });
});

module.exports = router;
