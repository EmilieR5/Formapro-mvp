const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new FileSync(path.join(DATA_DIR, 'formapro.json'));
const db = low(adapter);

// Initialize schema
db.defaults({
  users: [],
  refresh_tokens: [],
  password_resets: [],
  consent_log: [],
  audit_log: [],
  clients: [],
  formations: [],
  sessions: [],
  learners: [],
  enrollments: [],
  invoices: [],
  invoice_seq: [],
  qualiopi: [],
  documents: [],
  notifications: [],
  settings: []
}).write();

// Helper: next invoice number NF525
function nextInvoiceNumber(userId) {
  const year = new Date().getFullYear();
  const key = `${userId}-${year}`;
  const seqEntry = db.get('invoice_seq').find({ key }).value();
  const seq = (seqEntry ? seqEntry.seq : 0) + 1;
  if (seqEntry) db.get('invoice_seq').find({ key }).assign({ seq }).write();
  else db.get('invoice_seq').push({ key, seq }).write();
  return `FP-${year}-${String(seq).padStart(6, '0')}`;
}

// Seed demo data
function seedDemo() {
  if (db.get('users').find({ email: 'sophie.martin@formapro-beta.fr' }).value()) return;
  const uid = 'user-sophie-demo';
  const now = new Date().toISOString();
  const pwHash = bcrypt.hashSync('FormaPro2026!', 12);
  const d = (n) => { const dt = new Date(); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };

  db.get('users').push({
    id: uid, email: 'sophie.martin@formapro-beta.fr', password_hash: pwHash,
    first_name: 'Sophie', last_name: 'Martin', phone: '06 12 34 56 78',
    siret: '83482956200018', tva_number: 'FR12834829562', tva_exempt: false,
    address: '12 Rue des Formateurs', city: 'Lille', postal_code: '59000', country: 'FR',
    plan: 'pro', role: 'formateur', avatar_initials: 'SM',
    email_verified: true, is_active: true,
    rgpd_consent: true, rgpd_consent_date: now, rgpd_consent_ip: '127.0.0.1',
    marketing_consent: false, failed_attempts: 0, locked_until: null,
    last_login: null, login_count: 0,
    created_at: now, updated_at: now
  }).write();

  // Clients
  const c1 = uuidv4(), c2 = uuidv4(), c3 = uuidv4();
  db.get('clients').push(
    { id: c1, user_id: uid, name: 'Accenture France', siret: '33562025400026', email: 'formation@accenture.fr', phone: '01 53 23 00 00', address: '118 Av. de France', city: 'Paris', postal_code: '75013', type: 'entreprise', opco: 'AFDAS', is_active: true, created_at: now },
    { id: c2, user_id: uid, name: 'Mairie de Lille', siret: '21590350100046', email: 'rh@mairie-lille.fr', phone: '03 20 49 50 00', address: 'Place Roger Salengro', city: 'Lille', postal_code: '59000', type: 'public', opco: '', is_active: true, created_at: now },
    { id: c3, user_id: uid, name: 'BNP Paribas', siret: '66205165099019', email: 'formation@bnpparibas.fr', phone: '01 40 14 45 46', address: '16 Bd des Italiens', city: 'Paris', postal_code: '75009', type: 'entreprise', opco: 'OPCO EP', is_active: true, created_at: now }
  ).write();

  // Formations
  const f1 = uuidv4(), f2 = uuidv4(), f3 = uuidv4();
  db.get('formations').push(
    { id: f1, user_id: uid, title: 'Management & Leadership', description: 'Développer ses compétences managériales', duration_hours: 14, price_ht: 1200, tva_rate: 20, type: 'presentiel', category: 'Management', is_active: true, created_at: now },
    { id: f2, user_id: uid, title: 'Communication interpersonnelle', description: 'Améliorer sa communication au travail', duration_hours: 7, price_ht: 700, tva_rate: 20, type: 'distanciel', category: 'Soft skills', is_active: true, created_at: now },
    { id: f3, user_id: uid, title: 'Prévention RPS', description: 'Identifier et prévenir les risques psychosociaux', duration_hours: 14, price_ht: 1400, tva_rate: 20, type: 'hybride', category: 'RH / QVT', is_active: true, created_at: now }
  ).write();

  // Sessions (upcoming)
  db.get('sessions').push(
    { id: uuidv4(), user_id: uid, formation_id: f1, client_id: c1, title: 'Management & Leadership', start_datetime: d(1)+'T09:00:00', end_datetime: d(1)+'T17:00:00', type: 'presentiel', location: 'Accenture Paris 13e', status: 'planifiee', learners_count: 4, created_at: now },
    { id: uuidv4(), user_id: uid, formation_id: f2, client_id: c3, title: 'Communication interpersonnelle', start_datetime: d(2)+'T10:00:00', end_datetime: d(2)+'T17:00:00', type: 'distanciel', location: 'Zoom', status: 'planifiee', learners_count: 12, created_at: now },
    { id: uuidv4(), user_id: uid, formation_id: f3, client_id: c1, title: 'Prévention RPS', start_datetime: d(4)+'T09:00:00', end_datetime: d(4)+'T17:00:00', type: 'hybride', location: 'Accenture + Teams', status: 'planifiee', learners_count: 8, created_at: now },
    { id: uuidv4(), user_id: uid, formation_id: f2, client_id: c2, title: 'Communication - Mairie Lille', start_datetime: d(8)+'T14:00:00', end_datetime: d(8)+'T17:00:00', type: 'distanciel', location: 'Teams', status: 'planifiee', learners_count: 6, created_at: now }
  ).write();

  // Invoices (seed invoice_seq first)
  const makeInv = (n, cid, status, daysAgo, daysEch, ht, tva, desc) => {
    const key = `${uid}-${new Date().getFullYear()}`;
    const seqEntry = db.get('invoice_seq').find({ key }).value();
    const seq = (seqEntry ? seqEntry.seq : 0) + 1;
    if (seqEntry) db.get('invoice_seq').find({ key }).assign({ seq }).write();
    else db.get('invoice_seq').push({ key, seq }).write();
    const num = `FP-${new Date().getFullYear()}-${String(seq).padStart(6,'0')}`;
    const ttc = ht + (ht * tva / 100);
    const hash = require('crypto').createHash('sha256').update(num+ht).digest('hex').substring(0,32);
    return { id: uuidv4(), user_id: uid, client_id: cid, invoice_number: num, status,
      date_emission: d(-daysAgo), date_echeance: d(-daysAgo+daysEch),
      amount_ht: ht, tva_rate: tva, amount_tva: ht*tva/100, amount_ttc: ttc,
      description: desc, payment_date: status==='payee' ? d(-daysAgo+daysEch-2) : null,
      nf525_hash: hash, reminder_count: status==='retard'?2:0, created_at: now, updated_at: now };
  };
  db.get('invoices').push(
    makeInv(1, c1, 'payee', 20, 15, 2400, 20, 'Management & Leadership — 4 participants (2 jours)'),
    makeInv(2, c3, 'payee', 15, 10, 1400, 20, 'Prévention RPS — 8 participants (1 jour)'),
    makeInv(3, c1, 'envoyee', 10, 30, 1200, 20, 'Communication interpersonnelle — 6 participants'),
    makeInv(4, c2, 'retard', 35, 20, 700, 0, 'Formation Management RH — exonérée TVA Art. 261-4-4°a'),
    makeInv(5, c3, 'retard', 30, 15, 1400, 20, 'RPS Avancé — 10 participants')
  ).write();

  // Qualiopi
  db.get('qualiopi').push(
    { id: uuidv4(), user_id: uid, criterion: 1, title: 'Programme publié sur site web', description: "Capture d'écran + URL accessible au public", evidence_date: d(-60), created_at: now },
    { id: uuidv4(), user_id: uid, criterion: 2, title: 'Questionnaire positionnement Management', description: 'Formulaire signé par 4 participants', evidence_date: d(-18), created_at: now },
    { id: uuidv4(), user_id: uid, criterion: 4, title: 'Supports pédagogiques Management', description: 'Slides, exercices, bibliographie', evidence_date: d(-15), created_at: now },
    { id: uuidv4(), user_id: uid, criterion: 5, title: 'CV et diplômes — Sophie Martin', description: 'Master RH, certifications Qualiopi', evidence_date: d(-90), created_at: now },
    { id: uuidv4(), user_id: uid, criterion: 7, title: 'Enquêtes satisfaction avril 2026', description: 'Taux réponse 92%, score moyen 4.6/5', evidence_date: d(-5), created_at: now }
  ).write();

  // Notifications
  db.get('notifications').push(
    { id: uuidv4(), user_id: uid, type: 'alert', title: '3 factures en retard', message: 'Relance automatique prévue demain.', is_read: false, created_at: now },
    { id: uuidv4(), user_id: uid, type: 'info', title: 'BPF 2025 à déposer', message: 'Avant le 30 avril 2026.', is_read: false, created_at: now },
    { id: uuidv4(), user_id: uid, type: 'success', title: 'Paiement reçu', message: 'Facture FP-2026-000002 — 1 680 €', is_read: true, created_at: now }
  ).write();

  // Settings
  db.get('settings').push({
    user_id: uid, invoice_prefix: 'FP', default_payment_terms: 30,
    bank_iban: 'FR76 3000 6000 0112 3456 7890 189', bank_bic: 'BNPAFRPPXXX',
    notif_invoice_reminder: true, notif_session_reminder: true, notif_email: true,
    created_at: now, updated_at: now
  }).write();

  console.log('✅ Demo data seeded — sophie.martin@formapro-beta.fr / FormaPro2026!');
}

try { seedDemo(); } catch(e) { console.warn('Seed warning:', e.message); }

module.exports = { db, nextInvoiceNumber };
