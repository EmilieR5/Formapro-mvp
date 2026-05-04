const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'fp_jwt_dev_secret_change_in_production_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fp_refresh_dev_secret_change_in_production_2026';
const IS_PROD = process.env.NODE_ENV === 'production';
const BCRYPT_ROUNDS = IS_PROD ? 12 : 10;

function tokens(user) {
  const access = jwt.sign({ sub: user.id, email: user.email, plan: user.plan, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ sub: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { access, refresh };
}

function setCookies(res, access, refresh) {
  const base = { httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? 'strict' : 'lax' };
  res.cookie('access_token', access, { ...base, maxAge: 15*60*1000 });
  res.cookie('refresh_token', refresh, { ...base, maxAge: 7*24*60*60*1000, path: '/api/auth' });
}

function clearCookies(res) {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/auth' });
}

function auditLog(userId, action, ip, success, details) {
  try { db.get('audit_log').push({ id: uuidv4(), user_id: userId||null, action, ip: ip||null, success: !!success, details: details||null, created_at: new Date().toISOString() }).write(); } catch(e) {}
}

function safeUser(u) {
  if (!u) return null;
  const { password_hash, mfa_secret, ...safe } = u;
  return safe;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, rgpd_consent, marketing_consent } = req.body;
    const ip = req.ip;
    if (!email || !password || !first_name || !last_name) return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    if (password.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum.' });
    if (!rgpd_consent) return res.status(400).json({ error: 'Le consentement RGPD est obligatoire.' });
    if (db.get('users').find({ email: email.toLowerCase().trim() }).value()) return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const user = {
      id: uuidv4(), email: email.toLowerCase().trim(), password_hash: hash,
      first_name: first_name.trim(), last_name: last_name.trim(),
      avatar_initials: (first_name[0] + last_name[0]).toUpperCase(),
      phone: '', siret: '', tva_number: '', tva_exempt: true,
      address: '', city: '', postal_code: '', country: 'FR',
      plan: 'starter', role: 'formateur',
      email_verified: true, is_active: true,
      rgpd_consent: true, rgpd_consent_date: now, rgpd_consent_ip: ip,
      marketing_consent: !!marketing_consent,
      failed_attempts: 0, locked_until: null,
      last_login: null, login_count: 0,
      created_at: now, updated_at: now
    };
    db.get('users').push(user).write();
    db.get('consent_log').push({ id: uuidv4(), user_id: user.id, action: 'REGISTER_CONSENT', details: 'CGU v1.0 + Politique confidentialite v1.0', ip, ua: req.headers['user-agent']||'', created_at: now }).write();
    db.get('settings').push({ user_id: user.id, invoice_prefix: 'FP', default_payment_terms: 30, bank_iban: '', bank_bic: '', notif_invoice_reminder: true, notif_session_reminder: true, notif_email: true, created_at: now, updated_at: now }).write();
    auditLog(user.id, 'REGISTER', ip, true);

    const { access, refresh } = tokens(user);
    db.get('refresh_tokens').push({ id: uuidv4(), user_id: user.id, token_hash: crypto.createHash('sha256').update(refresh).digest('hex'), ip, ua: req.headers['user-agent']||'', expires_at: new Date(Date.now()+7*24*60*60*1000).toISOString(), created_at: now }).write();
    setCookies(res, access, refresh);
    res.status(201).json({ message: 'Compte créé avec succès', access_token: access, user: safeUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;
    if (!email || !password) return res.status(400).json({ error: 'E-mail et mot de passe requis.' });
    const user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
    if (!user || !user.password_hash) { auditLog(null, 'LOGIN_FAIL', ip, false, 'unknown email'); return res.status(401).json({ error: 'Identifiants incorrects.' }); }
    if (!user.is_active) return res.status(403).json({ error: 'Compte désactivé. Contactez le support.' });
    if (user.locked_until && new Date(user.locked_until) > new Date()) return res.status(423).json({ error: `Compte verrouillé jusqu'à ${new Date(user.locked_until).toLocaleTimeString('fr-FR')}.` });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = (user.failed_attempts || 0) + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 30*60*1000).toISOString() : null;
      db.get('users').find({ id: user.id }).assign({ failed_attempts: attempts, locked_until: lockUntil, updated_at: new Date().toISOString() }).write();
      auditLog(user.id, 'LOGIN_FAIL', ip, false, `attempt ${attempts}`);
      if (lockUntil) return res.status(423).json({ error: 'Trop de tentatives. Compte verrouillé 30 minutes.' });
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const now = new Date().toISOString();
    db.get('users').find({ id: user.id }).assign({ failed_attempts: 0, locked_until: null, last_login: now, login_count: (user.login_count||0)+1, updated_at: now }).write();
    auditLog(user.id, 'LOGIN_OK', ip, true);

    const { access, refresh } = tokens(user);
    db.get('refresh_tokens').push({ id: uuidv4(), user_id: user.id, token_hash: crypto.createHash('sha256').update(refresh).digest('hex'), ip, ua: req.headers['user-agent']||'', expires_at: new Date(Date.now()+7*24*60*60*1000).toISOString(), created_at: now }).write();
    setCookies(res, access, refresh);
    const updated = db.get('users').find({ id: user.id }).value();
    res.json({ message: 'Connexion réussie', access_token: access, user: safeUser(updated) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const token = req.cookies && req.cookies.refresh_token;
  if (!token) return res.status(401).json({ error: 'Session expirée' });
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    const user = db.get('users').find({ id: decoded.sub, is_active: true }).value();
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    const { access, refresh } = tokens(user);
    setCookies(res, access, refresh);
    res.json({ access_token: access, user: safeUser(user) });
  } catch { clearCookies(res); res.status(401).json({ error: 'SESSION_EXPIRED' }); }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => { clearCookies(res); res.json({ message: 'Déconnecté' }); });

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies.access_token || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.get('users').find({ id: decoded.sub, is_active: true }).value();
    if (!user) return res.status(401).json({ error: 'Introuvable' });
    res.json({ user: safeUser(user) });
  } catch { res.status(401).json({ error: 'TOKEN_EXPIRED' }); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const ip = req.ip;
  if (!email) return res.status(400).json({ error: 'E-mail requis' });
  res.json({ message: `Si ce compte existe, un code a été envoyé à ${email}` }); // Always 200 — anti-enumeration
  const user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
  if (!user) return;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 8);
  const now = new Date().toISOString();
  db.get('password_resets').remove({ user_id: user.id }).write();
  db.get('password_resets').push({ id: uuidv4(), user_id: user.id, otp_hash: otpHash, expires_at: new Date(Date.now()+15*60*1000).toISOString(), used: false, ip, created_at: now }).write();
  auditLog(user.id, 'FORGOT_PW', ip, true);
  console.log(`\n🔑 OTP DEMO (ne pas utiliser en production): ${otp} — pour ${email}\n`);
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'E-mail et code requis' });
  const user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
  if (!user) return res.status(400).json({ error: 'Code invalide ou expiré' });
  const reset = db.get('password_resets').find({ user_id: user.id, used: false }).value();
  if (!reset || new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Code invalide ou expiré (15 min max)' });
  const ok = await bcrypt.compare(otp, reset.otp_hash);
  if (!ok) return res.status(400).json({ error: 'Code incorrect. Vérifiez et réessayez.' });
  db.get('password_resets').find({ id: reset.id }).assign({ used: true }).write();
  const resetJwt = jwt.sign({ sub: user.id, type: 'reset' }, JWT_SECRET, { expiresIn: '10m' });
  res.json({ message: 'Code vérifié', reset_token: resetJwt });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { reset_token, new_password } = req.body;
  if (!reset_token || !new_password) return res.status(400).json({ error: 'Paramètres manquants' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  try {
    const decoded = jwt.verify(reset_token, JWT_SECRET);
    if (decoded.type !== 'reset') throw new Error();
    const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    db.get('users').find({ id: decoded.sub }).assign({ password_hash: hash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).write();
    auditLog(decoded.sub, 'RESET_PW_OK', req.ip, true);
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch { res.status(400).json({ error: 'Lien de réinitialisation invalide ou expiré' }); }
});

// POST /api/auth/oauth
router.post('/oauth', async (req, res) => {
  const { provider, email, first_name, last_name } = req.body;
  const ip = req.ip;
  if (!provider || !email) return res.status(400).json({ error: 'Paramètres OAuth manquants' });
  const now = new Date().toISOString();
  let user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
  if (!user) {
    user = { id: uuidv4(), email: email.toLowerCase().trim(), password_hash: null,
      first_name: first_name||'Utilisateur', last_name: last_name||'FormaPro',
      avatar_initials: ((first_name||'U')[0]+(last_name||'S')[0]).toUpperCase(),
      phone:'', siret:'', tva_number:'', tva_exempt:true, address:'', city:'', postal_code:'', country:'FR',
      plan:'starter', role:'formateur', oauth_provider: provider,
      email_verified:true, is_active:true,
      rgpd_consent:true, rgpd_consent_date:now, rgpd_consent_ip:ip,
      marketing_consent:false, failed_attempts:0, locked_until:null,
      last_login:now, login_count:1, created_at:now, updated_at:now };
    db.get('users').push(user).write();
    db.get('consent_log').push({ id:uuidv4(), user_id:user.id, action:'OAUTH_CONSENT', details:`Via ${provider}`, ip, ua:req.headers['user-agent']||'', created_at:now }).write();
    db.get('settings').push({ user_id:user.id, invoice_prefix:'FP', default_payment_terms:30, bank_iban:'', bank_bic:'', notif_invoice_reminder:true, notif_session_reminder:true, notif_email:true, created_at:now, updated_at:now }).write();
  } else {
    db.get('users').find({ id:user.id }).assign({ last_login:now, login_count:(user.login_count||0)+1, updated_at:now }).write();
    user = db.get('users').find({ id:user.id }).value();
  }
  auditLog(user.id, `OAUTH_LOGIN_${provider.toUpperCase()}`, ip, true);
  const { access, refresh } = tokens(user);
  const base = { httpOnly:true, secure:IS_PROD, sameSite:IS_PROD?'strict':'lax' };
  res.cookie('access_token', access, { ...base, maxAge:15*60*1000 });
  res.cookie('refresh_token', refresh, { ...base, maxAge:7*24*60*60*1000, path:'/api/auth' });
  res.json({ message:`Connexion ${provider} réussie`, access_token:access, user:safeUser(user) });
});

// DELETE /api/auth/account — RGPD droit à l'oubli
router.delete('/account', async (req, res) => {
  const token = req.cookies && req.cookies.access_token || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.get('users').find({ id: decoded.sub }).value();
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    // RGPD: anonymize instead of hard delete (for legal obligations)
    db.get('users').find({ id: decoded.sub }).assign({
      email: `deleted-${decoded.sub}@supprime.formapro.fr`,
      password_hash: null, first_name: '[Supprimé]', last_name: '[RGPD]',
      phone: '', siret: '', address: '', is_active: false,
      deleted_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).write();
    db.get('consent_log').push({ id: uuidv4(), user_id: decoded.sub, action: 'ACCOUNT_DELETION_RGPD', details: 'Demande de suppression - Art. 17 RGPD', ip: req.ip, ua: req.headers['user-agent']||'', created_at: new Date().toISOString() }).write();
    clearCookies(res);
    res.json({ message: 'Compte supprimé conformément au RGPD (Art. 17). Vos données personnelles ont été anonymisées.' });
  } catch { res.status(401).json({ error: 'Token invalide' }); }
});

// GET /api/auth/export-data — RGPD portabilité
router.get('/export-data', (req, res) => {
  const token = req.cookies && req.cookies.access_token || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const uid = decoded.sub;
    const user = db.get('users').find({ id: uid }).value();
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    const { password_hash, mfa_secret, ...safeU } = user;
    const data = {
      export_date: new Date().toISOString(),
      rgpd_notice: 'Export RGPD — Article 20 — Droit à la portabilité',
      user: safeU,
      clients: db.get('clients').filter({ user_id: uid }).value(),
      sessions: db.get('sessions').filter({ user_id: uid }).value(),
      invoices: db.get('invoices').filter({ user_id: uid }).value(),
      qualiopi: db.get('qualiopi').filter({ user_id: uid }).value(),
      consent_log: db.get('consent_log').filter({ user_id: uid }).value()
    };
    db.get('consent_log').push({ id: uuidv4(), user_id: uid, action: 'DATA_EXPORT_RGPD', details: 'Export portabilite Art. 20', ip: req.ip, ua: req.headers['user-agent']||'', created_at: new Date().toISOString() }).write();
    res.setHeader('Content-Disposition', `attachment; filename="formapro-mes-donnees-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch { res.status(401).json({ error: 'Token invalide' }); }
});

module.exports = router;
