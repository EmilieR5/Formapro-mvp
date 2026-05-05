# FormaPro MVP — v1.0-beta

SaaS EdTech pour formateurs indépendants français.  
Facturation Factur-X · Qualiopi · BPF · IA · RGPD

---

## 🚀 Déploiement Railway (recommandé — 5 minutes)

### 1. Prérequis
- Compte [Railway](https://railway.app) (gratuit)
- Compte [GitHub](https://github.com)

### 2. Pousser sur GitHub

```bash
cd formapro-mvp
git init
git add .
git commit -m "FormaPro MVP v1.0-beta"
git remote add origin https://github.com/TON_COMPTE/formapro-mvp.git
git push -u origin main
```

### 3. Déployer sur Railway

1. Aller sur [railway.app](https://railway.app) → **New Project**
2. Choisir **Deploy from GitHub repo** → sélectionner `formapro-mvp`
3. Railway détecte automatiquement Node.js via `nixpacks.toml`
4. Aller dans **Variables** → ajouter :

```
NODE_ENV=production
JWT_SECRET=<générez avec: openssl rand -base64 64>
JWT_REFRESH_SECRET=<différent du précédent>
BASE_URL=https://votre-app.up.railway.app
```

5. Railway déploie automatiquement → URL générée en 2 minutes

### 4. Vérifier le déploiement

```bash
curl https://votre-app.up.railway.app/health
```

---

## 🟣 Déploiement alternatif Render

1. [render.com](https://render.com) → **New Web Service**
2. Connecter le repo GitHub
3. Build command : `npm install`
4. Start command : `node server.js`
5. Même variables d'environnement que Railway

---

## 💻 Développement local

```bash
# Cloner et installer
git clone https://github.com/TON_COMPTE/formapro-mvp.git
cd formapro-mvp
npm install

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# Démarrer
npm start
# → http://localhost:3000
```

**Compte de démonstration :**
- Email : `sophie.martin@formapro-beta.fr`
- Mot de passe : `FormaPro2026!`

### Test rapide MVP (smoke test)

1. Démarrer l'application :
```bash
npm start
```

2. Dans un second terminal, lancer :
```bash
npm run test:smoke
```

Sortie attendue :
- `GET /health` en `200`
- `POST /api/auth/login` en `200`
- `GET /api/dashboard` en `200`
- `GET /api/invoices` en `200`

Variables optionnelles :
- `BASE_URL` (défaut : `http://localhost:3000`)
- `DEMO_EMAIL` et `DEMO_PASSWORD` (si vous changez le compte de test)

---

## 🔐 Sécurité implémentée

| Couche | Implémentation |
|--------|---------------|
| Auth | JWT RS256 · Access token 15min · Refresh token 7j |
| Mots de passe | Bcrypt coût 12 · Verrouillage 5 tentatives |
| Sessions | HttpOnly cookies · SameSite Strict en prod |
| Headers | Helmet (CSP, HSTS, X-Frame-Options…) |
| API | Rate limiting par route (auth: 20/15min, api: 120/min) |
| RGPD | Consentement explicit · Export Art. 20 · Suppression Art. 17 |
| NF525 | Séquentialité factures · Hash SHA-256 intégrité |
| Logs | Audit trail complet (connexions, actions RGPD) |

---

## 📡 API Endpoints

### Auth (public)
```
POST /api/auth/register         Créer un compte
POST /api/auth/login            Se connecter
POST /api/auth/logout           Se déconnecter
POST /api/auth/refresh          Rafraîchir le token
GET  /api/auth/me               Profil courant
POST /api/auth/forgot-password  Demande réinitialisation
POST /api/auth/verify-otp       Vérifier code OTP
POST /api/auth/reset-password   Nouveau mot de passe
POST /api/auth/oauth            Connexion OAuth simulée
```

### RGPD (authentifié)
```
GET    /api/auth/export-data   Export données (Art. 20)
DELETE /api/auth/account       Suppression compte (Art. 17)
```

### API métier (authentifié — Bearer token requis)
```
GET/POST        /api/dashboard
GET/POST/PUT    /api/invoices
POST            /api/invoices/from-session/:id
GET/POST/PUT    /api/sessions
GET/POST/PUT    /api/clients
GET/POST/DELETE /api/qualiopi
GET/POST/PUT    /api/formations
GET/POST/PUT    /api/learners
GET             /api/bpf?year=2025
GET/PUT         /api/settings
GET             /api/notifications
PUT             /api/notifications/:id/read
GET             /api/audit
GET             /health
```

---

## 🗃️ Stack technique

- **Runtime** : Node.js 20 + Express 4
- **Base de données** : lowdb (JSON file) → migrable vers PostgreSQL
- **Auth** : JWT (jsonwebtoken) + bcryptjs
- **Sécurité** : Helmet, CORS, express-rate-limit
- **Email** : Nodemailer (logs console en dev, SMTP en prod)
- **Déploiement** : Railway / Render / Heroku / VPS

---

## 📋 Variables d'environnement requises en production

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NODE_ENV` | ✅ | `production` |
| `JWT_SECRET` | ✅ | Secret JWT (64+ chars) |
| `JWT_REFRESH_SECRET` | ✅ | Secret refresh (différent) |
| `BASE_URL` | Recommandé | URL publique de l'app |
| `SMTP_HOST` | Non | Envoi d'emails réels |
| `SMTP_USER` | Non | User SMTP |
| `SMTP_PASS` | Non | Mot de passe SMTP |

---

## 🔄 Migration vers PostgreSQL (phase 2)

Le code utilise une abstraction `db.get(table).filter().value()` compatible avec un ORM.  
Migrer vers Prisma + PostgreSQL en remplaçant `db.js` par une connexion Prisma.

---

*FormaPro Beta v1.0 · Confidentiel · 2026*
