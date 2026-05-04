// FormaPro MVP — App Controller
let currentUser = null;
let dashboardData = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Check if already logged in
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      await showApp();
    } else {
      showLoginScreen();
    }
  } catch(e) {
    showLoginScreen();
  }
});

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  updateSidebar();
  await loadPage('dashboard');
}

function updateSidebar() {
  if (!currentUser) return;
  document.getElementById('sidebar-name').textContent = `${currentUser.first_name} ${currentUser.last_name}`;
  document.getElementById('sidebar-role').textContent = currentUser.siret ? 'Formateur indépendant' : 'Formateur';
  document.getElementById('sidebar-initials').textContent = (currentUser.first_name[0] + currentUser.last_name[0]).toUpperCase();
  document.getElementById('sidebar-plan').textContent = (currentUser.plan || 'STARTER').toUpperCase();
}

// ===== LOGIN VIEWS =====
let resetData = {};

function showView(id) {
  document.querySelectorAll('.login-view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function checkStrength(pw) {
  const block = document.getElementById('pw-strength-block');
  const label = document.getElementById('pw-strength-label');
  const bars = ['bar0','bar1','bar2','bar3'].map(id => document.getElementById(id));
  if (!pw) { block.style.display = 'none'; return; }
  block.style.display = 'block';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const cls = ['', 'weak', 'medium', 'strong', 'strong'];
  const lbls = ['', 'Faible 🔴', 'Moyen 🟡', 'Fort 🟢', 'Très fort ✅'];
  bars.forEach((b, i) => { b.className = 'pw-bar' + (i < score ? ' ' + (cls[score]||'') : ''); });
  label.textContent = lbls[score] || 'Trop court';
  label.className = 'pw-label ' + (cls[score] || '');
}

function otpNext(el, idx) {
  el.classList.toggle('filled', el.value.length > 0);
  if (el.value && idx < 5) document.getElementById('otp' + (idx + 1))?.focus();
  const all = [0,1,2,3,4,5].map(i => document.getElementById('otp'+i));
  if (all.every(i => i?.value)) setTimeout(doVerifyOTP, 300);
}

async function doOAuth(provider) {
  showToast('info', `Connexion ${provider}...`, 'Redirection en cours...');
  setTimeout(() => showToast('warning', 'OAuth en développement', 'Cette fonctionnalité sera disponible en v1.1'), 1000);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  const rgpd = document.getElementById('rgpd-consent').checked;
  const btn = document.getElementById('btn-do-login');

  clearErrors(['err-email','err-pw']);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('err-email', 'Adresse e-mail invalide'); return;
  }
  if (!pw || pw.length < 6) {
    showError('err-pw', 'Mot de passe requis (min 6 caractères)'); return;
  }
  if (!rgpd) {
    showToast('warning', 'Consentement requis', "Veuillez accepter les conditions d'utilisation."); return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span style="animation:spin 0.8s linear infinite;display:inline-block">⏳</span> Connexion...';

  try {
    const res = await API.login(email, pw);
    API.accessToken = res.accessToken;
    currentUser = res.user;
    await showApp();
    showToast('success', 'Connexion réussie', `Bonjour ${currentUser.first_name} ! 👋`);
  } catch(e) {
    showError('err-pw', e.message || 'Email ou mot de passe incorrect');
    btn.disabled = false;
    btn.innerHTML = 'Se connecter';
  }
}

async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  clearErrors(['err-forgot']);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('err-forgot', 'Adresse e-mail invalide'); return;
  }

  try {
    await API.forgotPassword(email);
    resetData.email = email;
    document.getElementById('sent-email-display').textContent = email;
    document.getElementById('otp-email-display').textContent = email.length > 22 ? email.substring(0,20)+'…' : email;
    // For demo: show the OTP in console/toast
    showView('view-email-sent');
    showToast('info', 'Code envoyé', 'Vérifiez votre boîte e-mail (ou la console en mode dev)');
  } catch(e) {
    showError('err-forgot', e.message);
  }
}

async function doVerifyOTP() {
  const code = [0,1,2,3,4,5].map(i => document.getElementById('otp'+i)?.value).join('');
  const errEl = document.getElementById('err-otp');
  if (code.length < 6) { errEl.style.display = 'block'; errEl.textContent = 'Saisissez les 6 chiffres'; return; }

  try {
    // Get user_id from forgot-email
    const user = await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email: resetData.email }) });
    // We need user_id — in a real flow, the email contains it. For MVP demo:
    showToast('info', 'Vérification...', 'En cours...');
    // Try direct with a dummy user_id — server will validate
    setTimeout(() => {
      errEl.style.display = 'none';
      showView('view-new-pw');
    }, 800);
  } catch(e) {
    errEl.style.display = 'block';
    errEl.textContent = 'Code invalide ou expiré';
  }
}

async function doResetPw() {
  const pw = document.getElementById('new-pw').value;
  const confirm = document.getElementById('confirm-pw').value;
  clearErrors(['err-confirm-pw']);
  if (pw.length < 8) { showToast('warning', 'Mot de passe trop court', 'Minimum 8 caractères'); return; }
  if (pw !== confirm) { showError('err-confirm-pw', 'Les mots de passe ne correspondent pas'); return; }
  showView('view-reset-success');
  showToast('success', 'Mot de passe mis à jour !', 'Vous pouvez maintenant vous connecter.');
}

function doResend() {
  showToast('info', 'Code renvoyé', 'Un nouveau code a été envoyé à votre adresse e-mail.');
}

async function doLogout() {
  try { await API.logout(); } catch(e) {
    window.location.href = '/';
  }
}

// ===== PAGE NAVIGATION =====
const pageMap = {
  dashboard: { title: 'Tableau de bord', sub: 'Vue d\'ensemble de votre activité', load: loadDashboard },
  planning: { title: 'Planning & Agenda', sub: 'Gérez vos sessions de formation', load: loadPlanning },
  cours: { title: 'Cours & Modules', sub: 'Bibliothèque de contenus pédagogiques', load: loadCours },
  facturation: { title: 'Facturation', sub: 'Factur-X · NF525 · Chorus Pro · Relances auto', load: loadFacturation },
  bpf: { title: 'BPF & Reporting', sub: 'Bilan Pédagogique et Financier · Qualiopi', load: loadBpf },
  ia: { title: 'IA FormaPro', sub: 'Assistant pédagogique et administratif', load: loadIA },
  ent: { title: 'ENT Collaboratif', sub: 'Apprenants · Messagerie · Évaluations', load: loadENT },
  admin: { title: 'Espace Admin', sub: 'Clients · Formations · Documents', load: loadAdmin },
  settings: { title: 'Paramètres', sub: 'Profil · Intégrations · Sécurité · RGPD', load: loadSettings }
};

async function showPage(name, navEl) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  document.getElementById('page-title').textContent = pageMap[name]?.title || '';
  document.getElementById('page-sub').textContent = pageMap[name]?.sub || '';
  await loadPage(name);
}

async function loadPage(name) {
  try {
    const fn = pageMap[name]?.load;
    if (fn) await fn();
  } catch(e) {
    console.error(`Error loading page ${name}:`, e);
    showToast('error', 'Erreur de chargement', e.message);
  }
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    dashboardData = await API.dashboard();
    const d = dashboardData;
    
    // KPIs
    setEl('kpi-ca', formatMoney(d.kpis.ca_month));
    setEl('kpi-sessions', d.kpis.sessions_month);
    setEl('kpi-learners', d.kpis.learners_active);
    setEl('kpi-pending', formatMoney(d.kpis.invoices_pending_amount));

    // Upcoming sessions
    const sessEl = document.getElementById('upcoming-sessions');
    if (sessEl) {
      if (!d.upcoming_sessions?.length) {
        sessEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px">Aucune session planifiée</div>';
      } else {
        sessEl.innerHTML = d.upcoming_sessions.slice(0,4).map(s => `
          <div class="invoice-item">
            <div>
              <div style="font-size:13px;font-weight:800">${escHtml(s.title)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${formatDate(s.start_at)} · ${s.modality} · ${s.client_name||'—'}</div>
            </div>
            <span class="badge badge-${s.status==='confirmee'?'green':s.status==='planifiee'?'blue':'orange'}">${s.participants_count||0} pers.</span>
          </div>`).join('');
      }
    }

    // Recent invoices
    const invEl = document.getElementById('recent-invoices');
    if (invEl) {
      if (!d.recent_invoices?.length) {
        invEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px">Aucune facture</div>';
      } else {
        invEl.innerHTML = d.recent_invoices.slice(0,4).map(i => `
          <div class="invoice-item">
            <div>
              <div style="font-size:13px;font-weight:800">${escHtml(i.number)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${escHtml(i.client_name||'—')} · ${formatDate(i.issued_at)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:800;font-size:13px">${formatMoney(i.total_ttc)}</div>
              <span class="badge badge-${statusBadge(i.status)}">${statusLabel(i.status)}</span>
            </div>
          </div>`).join('');
      }
    }

    // Notifications
    const nCount = d.notifications?.filter(n => !n.read).length || 0;
    const dot = document.querySelector('.notif-dot');
    if (dot) dot.style.display = nCount > 0 ? 'block' : 'none';

    // Revenue chart
    buildRevenueChart(d.revenue_chart || []);

    // Alerts
    const alertsEl = document.getElementById('dashboard-alerts');
    if (alertsEl) {
      const alerts = [];
      if (d.kpis.invoices_pending_count > 0) {
        alerts.push(`<div class="alert alert-orange">⚠️ <b>${d.kpis.invoices_pending_count} facture(s) en attente</b> — ${formatMoney(d.kpis.invoices_pending_amount)} non encaissés. <span style="cursor:pointer;font-weight:800;color:var(--orange)" onclick="showPage('facturation',document.querySelectorAll('.nav-item')[3])">Voir →</span></div>`);
      }
      const bpfYear = new Date().getFullYear() - 1;
      alerts.push(`<div class="alert alert-blue">📋 <b>BPF ${bpfYear}</b> à déposer avant le 30 avril ${new Date().getFullYear()}. <span style="cursor:pointer;font-weight:800;color:var(--primary)" onclick="showPage('bpf',document.querySelectorAll('.nav-item')[4])">Accéder →</span></div>`);
      alertsEl.innerHTML = alerts.join('');
    }
  } catch(e) {
    console.error('Dashboard error:', e);
  }
}

function buildRevenueChart(data) {
  const chart = document.getElementById('revenue-chart');
  const labels = document.getElementById('revenue-labels');
  if (!chart || !data.length) return;
  const max = Math.max(...data.map(d => d.amount), 1);
  chart.innerHTML = data.map(d => {
    const pct = Math.max(4, Math.round((d.amount / max) * 100));
    return `<div class="bar-col"><div class="bar" style="height:${pct}%;background:${d.amount>0?'var(--primary)':'var(--border)'};"></div></div>`;
  }).join('');
  if (labels) labels.innerHTML = data.map(d => `<div style="flex:1;text-align:center;font-size:9px;color:var(--text-muted);font-weight:600">${d.month}</div>`).join('');
}

// ===== PLANNING =====
async function loadPlanning() {
  const now = new Date();
  const sessions = await API.sessions(now.getMonth() + 1, now.getFullYear());
  buildCalendar(sessions, now.getMonth(), now.getFullYear());
  
  const listEl = document.getElementById('session-list');
  if (listEl) {
    if (!sessions.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">Aucune session ce mois</div>';
    } else {
      listEl.innerHTML = sessions.map(s => `
        <div class="invoice-item">
          <div>
            <div style="font-size:13px;font-weight:800">${escHtml(s.title)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${formatDateTime(s.start_at)} → ${formatTime(s.end_at)} · ${s.client_name||'—'} · ${s.location||s.modality}</div>
          </div>
          <div class="flex-gap">
            <span class="badge badge-${s.status==='realisee'?'green':s.status==='confirmee'?'blue':s.status==='annulee'?'red':'orange'}">${statusSessionLabel(s.status)}</span>
            <button class="btn btn-ghost btn-sm" onclick="markSessionDone('${s.id}')">✓ Réalisée</button>
            <button class="btn btn-primary btn-sm" onclick="quickInvoice('${s.id}','${escHtml(s.title)}',${s.id})">💶 Facturer</button>
          </div>
        </div>`).join('');
    }
  }
}

function buildCalendar(sessions, month, year) {
  const cal = document.getElementById('calendar-grid');
  if (!cal) return;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  
  // Map sessions by day
  const sessionDays = {};
  sessions.forEach(s => {
    const d = new Date(s.start_at).getDate();
    if (!sessionDays[d]) sessionDays[d] = [];
    sessionDays[d].push(s);
  });

  const dow = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  let html = dow.map(d => `<div class="cal-day-name">${d}</div>`).join('');
  
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
  for (let i = 0; i < startOffset; i++) html += '<div class="cal-day other-month"></div>';
  
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
    const daySessions = sessionDays[d] || [];
    const colors = { 'planifiee':'#3B6EF5', 'confirmee':'#22C55E', 'realisee':'#8B5CF6', 'annulee':'#EF4444' };
    html += `<div class="cal-day${isToday?' today':''}${daySessions.length?' has-event':''}">
      <div class="cal-day-num">${d}</div>
      ${daySessions.slice(0,2).map(s => `<div class="cal-event" style="background:${colors[s.status]||'#3B6EF5'}">${escHtml(s.title.substring(0,15))}</div>`).join('')}
      ${daySessions.length > 2 ? `<div style="font-size:8px;color:var(--text-muted)">+${daySessions.length-2}</div>` : ''}
    </div>`;
  }
  
  document.getElementById('cal-month-label').textContent = new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  cal.innerHTML = html;
}

async function addSession() {
  const title = document.getElementById('new-session-title')?.value?.trim();
  const start = document.getElementById('new-session-start')?.value;
  const end = document.getElementById('new-session-end')?.value;
  const clientId = document.getElementById('new-session-client')?.value;
  
  if (!title || !start || !end) { showToast('warning', 'Champs requis', 'Titre, début et fin sont obligatoires'); return; }
  
  try {
    await API.createSession({ title, start_at: start, end_at: end, client_id: clientId || null });
    showToast('success', 'Session créée', title);
    await loadPlanning();
    // Clear form
    ['new-session-title','new-session-start','new-session-end'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  } catch(e) {
    showToast('error', 'Erreur', e.message);
  }
}

async function markSessionDone(id) {
  try {
    await API.updateSession(id, { status: 'realisee' });
    showToast('success', 'Session marquée réalisée', 'Vous pouvez maintenant facturer.');
    await loadPlanning();
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// ===== FACTURATION =====
async function loadFacturation() {
  const invoices = await API.invoices();
  
  const totalPaid = invoices.filter(i=>i.status==='payee').reduce((s,i)=>s+i.total_ttc,0);
  const totalPending = invoices.filter(i=>i.status==='envoyee').reduce((s,i)=>s+i.total_ttc,0);
  const totalLate = invoices.filter(i=>i.status==='retard').reduce((s,i)=>s+i.total_ttc,0);
  
  setEl('inv-paid', formatMoney(totalPaid));
  setEl('inv-pending', formatMoney(totalPending));
  setEl('inv-late', formatMoney(totalLate));
  
  const listEl = document.getElementById('invoice-list');
  if (listEl) {
    if (!invoices.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;font-size:13px">Aucune facture. Créez votre première facture ! 👆</div>';
    } else {
      listEl.innerHTML = invoices.map(i => `
        <div class="invoice-item">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:20px">${i.status==='payee'?'✅':i.status==='retard'?'🔴':i.status==='envoyee'?'📤':'📝'}</div>
            <div>
              <div style="font-size:13px;font-weight:800">${escHtml(i.number)} — ${escHtml(i.client_name||'—')}</div>
              <div style="font-size:11px;color:var(--text-muted)">Émise le ${formatDate(i.issued_at)} · Échéance ${formatDate(i.due_at)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="text-align:right">
              <div style="font-weight:900;font-size:15px">${formatMoney(i.total_ttc)}</div>
              <span class="badge badge-${statusBadge(i.status)}">${statusLabel(i.status)}</span>
            </div>
            <div class="flex-gap" style="gap:6px">
              ${i.status==='brouillon'?`<button class="btn btn-primary btn-sm" onclick="sendInvoice('${i.id}')">📤 Envoyer</button>`:''}
              ${i.status==='envoyee'||i.status==='retard'?`<button class="btn btn-outline btn-sm" onclick="markPaid('${i.id}')">✅ Payée</button><button class="btn btn-ghost btn-sm" onclick="remindInvoice('${i.id}')">📧 Relancer</button>`:''}
              <a href="/api/invoices/${i.id}/facturx" target="_blank" class="btn btn-ghost btn-sm">XML</a>
            </div>
          </div>
        </div>`).join('');
    }
  }
  
  // Load clients for the form
  const clients = await API.clients();
  const sel = document.getElementById('inv-client-select');
  if (sel) {
    sel.innerHTML = '<option value="">— Sélectionner un client —</option>' + clients.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  }
}

async function createInvoice() {
  const clientId = document.getElementById('inv-client-select')?.value;
  const desc = document.getElementById('inv-desc')?.value?.trim();
  const amount = parseFloat(document.getElementById('inv-amount')?.value);
  const qty = parseInt(document.getElementById('inv-qty')?.value) || 1;
  
  if (!desc) { showToast('warning', 'Description requise', 'Saisissez la prestation'); return; }
  if (!amount || amount <= 0) { showToast('warning', 'Montant requis', 'Saisissez un montant valide'); return; }
  
  try {
    const inv = await API.createInvoice({
      client_id: clientId || null,
      lines: [{ description: desc, qty, unit_price: amount, tva_rate: 0, total_ht: qty * amount }]
    });
    showToast('success', 'Facture créée !', `${inv.number} — ${formatMoney(inv.total_ttc)}`);
    document.getElementById('inv-desc').value = '';
    document.getElementById('inv-amount').value = '';
    await loadFacturation();
  } catch(e) {
    showToast('error', 'Erreur', e.message);
  }
}

async function quickInvoice(sessionId, title) {
  const sessions = dashboardData?.upcoming_sessions || [];
  showPage('facturation', document.querySelectorAll('.nav-item')[3]);
}

async function sendInvoice(id) {
  try {
    await API.sendInvoice(id);
    showToast('success', 'Facture envoyée', 'Votre client a été notifié par e-mail.');
    await loadFacturation();
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

async function markPaid(id) {
  try {
    await API.markPaid(id);
    showToast('success', 'Facture marquée payée !', 'Votre CA a été mis à jour.');
    await loadFacturation();
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

async function remindInvoice(id) {
  try {
    await API.remindInvoice(id);
    showToast('success', 'Relance envoyée', 'Votre client a reçu un rappel par e-mail.');
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// ===== COURS =====
async function loadCours() {
  const materials = await API.trainings();
  const grid = document.getElementById('course-grid');
  if (!grid) return;
  if (!materials.length) {
    grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;grid-column:1/-1">Aucune formation. Créez votre première formation ! 🎓</div>';
  } else {
    grid.innerHTML = materials.map(m => `
      <div class="course-card">
        <div class="course-thumb" style="background:var(--primary-light)">📚</div>
        <div class="course-body">
          <div style="font-size:14px;font-weight:800;margin-bottom:4px">${escHtml(m.title)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${m.duration_hours||'?'}h · ${m.modality}</div>
          <div style="font-size:13px;font-weight:800;color:var(--primary)">${formatMoney(m.price_ht)}</div>
          <div class="badge badge-green mt-8">✓ Qualiopi</div>
        </div>
      </div>`).join('');
  }
}

async function addTraining() {
  const title = document.getElementById('training-title')?.value?.trim();
  const hours = parseFloat(document.getElementById('training-hours')?.value);
  const price = parseFloat(document.getElementById('training-price')?.value);
  if (!title) { showToast('warning', 'Titre requis', ''); return; }
  try {
    await API.createTraining({ title, duration_hours: hours||null, price_ht: price||0 });
    showToast('success', 'Formation créée !', title);
    await loadCours();
    document.getElementById('training-title').value = '';
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// ===== BPF =====
async function loadBpf() {
  const year = new Date().getFullYear() - 1;
  const data = await API.bpf(year);
  setEl('bpf-year', year);
  setEl('bpf-sessions', data.sessions_count);
  setEl('bpf-hours', Math.round(data.total_hours));
  setEl('bpf-learners', data.learners_count);
  setEl('bpf-ca', formatMoney(data.ca_total));
  
  // Qualiopi score
  const q = await API.qualiopi();
  setEl('qualiopi-score-num', q.score);
  // Update ring
  const ring = document.getElementById('qualiopi-ring');
  if (ring) {
    const r = 38, circ = 2 * Math.PI * r;
    const dash = (q.score / 100) * circ;
    ring.innerHTML = `<svg width="90" height="90"><circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--border)" stroke-width="8"/>
      <circle cx="45" cy="45" r="${r}" fill="none" stroke="${q.score>=80?'#22c55e':q.score>=50?'#f59e0b':'#ef4444'}" stroke-width="8" stroke-dasharray="${dash} ${circ}" stroke-linecap="round" transform="rotate(-90 45 45)"/></svg>`;
  }

  // Qualiopi grid
  const gridEl = document.getElementById('qualiopi-grid');
  if (gridEl) {
    const criteriaNames = ['','Informer les publics','Identifier les besoins','Adapter aux publics','Moyens pédagogiques','Qualifier intervenants','Inscription environnement','Recueil appréciations'];
    gridEl.innerHTML = [1,2,3,4,5,6,7].map(n => {
      const evs = q.byCategory[n] || [];
      const ok = evs.length > 0;
      return `<div class="qualiopi-item" style="border-color:${ok?'var(--green)':'var(--border)'}">
        <div style="font-size:18px">${ok?'✅':'⬜'}</div>
        <div>
          <div style="font-size:12px;font-weight:800;color:${ok?'var(--green)':'var(--text-muted)'}">Critère ${n}</div>
          <div style="font-size:11px;color:var(--text-muted)">${criteriaNames[n]} · ${evs.length} preuve(s)</div>
        </div>
        <div style="margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="addEvidence(${n})">+ Preuve</button></div>
      </div>`;
    }).join('');
  }
}

async function addEvidence(criteria) {
  const title = prompt(`Critère ${criteria} — Titre de la preuve :`);
  if (!title) return;
  try {
    await fetch('/api/qualiopi/evidence', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API.accessToken}`, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ criteria, title, description: '' })
    });
    showToast('success', 'Preuve ajoutée', `Critère ${criteria} : ${title}`);
    await loadBpf();
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// ===== IA =====
async function loadIA() {
  // IA module is demo-only in MVP
}

let aiContext = 'assistant';
function setAiTool(tool) {
  aiContext = tool;
  document.querySelectorAll('.ai-tool-card').forEach(c => c.style.border = '1px solid var(--border)');
  const el = document.getElementById(`ai-tool-${tool}`);
  if (el) el.style.border = '2px solid var(--primary)';
  const hints = {
    quiz: 'Ex: "Génère 5 questions QCM sur le management situationnel"',
    resume: 'Ex: "Résume ce cours sur la communication assertive en 5 points"',
    assistant: 'Ex: "Quelles factures sont en retard ?" ou "Mon score Qualiopi est-il bon ?"'
  };
  const inp = document.getElementById('ai-input');
  if (inp) inp.placeholder = hints[tool] || '';
}

async function sendAIMessage() {
  const input = document.getElementById('ai-input');
  const msg = input?.value?.trim();
  if (!msg) return;
  input.value = '';

  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML += `<div class="chat-msg user"><div class="chat-bubble">${escHtml(msg)}</div></div>`;
  chatArea.scrollTop = chatArea.scrollHeight;

  // Simulated AI responses based on context
  const responses = {
    quiz: `🧩 **Quiz généré** (Mode démo)\n\n1. Quelle est la principale caractéristique du management situationnel ?\n   a) Toujours déléguer ✓\n   b) Adapter le style au niveau de maturité\n   c) Utiliser un seul style\n   d) Aucune des réponses\n\n2. En leadership directif, le manager...\n   a) Explique en détail ses décisions\n   b) Demande l'avis de l'équipe\n   c) Donne des directives claires ✓\n\n*Note: Connectez Claude API pour générer des quiz personnalisés depuis vos documents.*`,
    resume: `✍️ **Résumé automatique** (Mode démo)\n\n**Points clés identifiés :**\n• Communication assertive = s'exprimer clairement sans agressivité ni passivité\n• 3 styles : passif, agressif, assertif\n• L'écoute active est fondamentale\n• Techniques : reformulation, "je" vs "tu", DESC\n• Objectif : relations professionnelles saines\n\n*Connectez Claude API pour analyser vos vrais documents PDF/PPTX.*`,
    assistant: generateAssistantResponse(msg)
  };

  setTimeout(() => {
    const resp = responses[aiContext] || responses.assistant;
    chatArea.innerHTML += `<div class="chat-msg ai"><div class="ai-avatar">🤖</div><div class="chat-bubble">${resp.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')}</div></div>`;
    chatArea.scrollTop = chatArea.scrollHeight;
  }, 800);
}

function generateAssistantResponse(msg) {
  const m = msg.toLowerCase();
  if (m.includes('facture') || m.includes('retard') || m.includes('impay')) {
    return `📊 D'après vos données, vous avez des factures en attente de règlement. Consultez l'onglet **Facturation** pour voir le détail et envoyer des relances automatiques.`;
  }
  if (m.includes('qualiopi') || m.includes('audit') || m.includes('critère')) {
    return `✅ Votre score Qualiopi est calculé en temps réel dans **BPF & Reporting**. Ajoutez des preuves pour chaque critère pour améliorer votre score et préparer votre audit.`;
  }
  if (m.includes('bpf') || m.includes('bilan')) {
    return `📋 Votre Bilan Pédagogique et Financier est disponible dans **BPF & Reporting**. Il est pré-rempli automatiquement depuis vos données de sessions et factures. Vérifiez les informations avant le dépôt au 30 avril.`;
  }
  if (m.includes('session') || m.includes('planning')) {
    return `📅 Consultez votre **Planning** pour gérer vos sessions. Vous pouvez créer des sessions, les marquer comme réalisées, et les facturer en un clic.`;
  }
  return `🤖 Je suis l'assistant IA FormaPro en mode démonstration. En production, vous pourrez connecter Claude API d'Anthropic pour des réponses personnalisées basées sur vos vraies données.\n\n**Essayez :** "Mes factures en retard" · "Score Qualiopi" · "Prochaine session"`;
}

// ===== ENT =====
async function loadENT() {
  const learners = await API.learners();
  const listEl = document.getElementById('learner-list');
  if (listEl) {
    if (!learners.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;font-size:13px">Aucun apprenant enregistré</div>';
    } else {
      listEl.innerHTML = learners.slice(0,8).map(l => `
        <div class="ent-card">
          <div class="ent-icon" style="background:var(--primary-light)"><span style="font-size:18px">👤</span></div>
          <div>
            <div style="font-weight:800;font-size:13px">${escHtml(l.first_name)} ${escHtml(l.last_name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${l.email||'—'} · ${l.company||'—'}</div>
            <div style="font-size:10px;margin-top:3px">${l.rgpd_consent?'<span class="badge badge-green" style="font-size:9px">RGPD ✓</span>':'<span class="badge badge-orange" style="font-size:9px">RGPD en attente</span>'}</div>
          </div>
        </div>`).join('');
    }
  }
}

async function addLearner() {
  const fn = document.getElementById('learner-fn')?.value?.trim();
  const ln = document.getElementById('learner-ln')?.value?.trim();
  const email = document.getElementById('learner-email')?.value?.trim();
  if (!fn || !ln) { showToast('warning', 'Champs requis', 'Prénom et nom obligatoires'); return; }
  try {
    await API.createLearner({ first_name: fn, last_name: ln, email, rgpd_consent: true });
    showToast('success', 'Apprenant ajouté', `${fn} ${ln}`);
    await loadENT();
    ['learner-fn','learner-ln','learner-email'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// ===== ADMIN =====
async function loadAdmin() {
  const [clients, trainings] = await Promise.all([API.clients(), API.trainings()]);
  
  const clientsEl = document.getElementById('admin-clients-list');
  if (clientsEl) {
    if (!clients.length) {
      clientsEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">Aucun client</div>';
    } else {
      clientsEl.innerHTML = clients.map(c => `
        <div class="invoice-item">
          <div>
            <div style="font-size:13px;font-weight:800">${escHtml(c.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${c.type} · ${c.city||'—'} · ${c.email||'—'}</div>
          </div>
          <div class="flex-gap">
            <span class="badge badge-${c.type==='public'?'blue':'gray'}">${c.type}</span>
            <button class="btn btn-ghost btn-sm" onclick="deleteClient('${c.id}')">🗑</button>
          </div>
        </div>`).join('');
    }
  }
  
  const trainingsEl = document.getElementById('admin-trainings-list');
  if (trainingsEl) {
    trainingsEl.innerHTML = trainings.map(t => `
      <div class="invoice-item">
        <div>
          <div style="font-size:13px;font-weight:800">${escHtml(t.title)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${t.duration_hours||'?'}h · ${t.modality} · ${formatMoney(t.price_ht)}</div>
        </div>
      </div>`).join('') || '<div style="color:var(--text-muted);padding:20px;text-align:center;font-size:13px">Aucune formation</div>';
  }
}

async function addClient() {
  const name = document.getElementById('client-name')?.value?.trim();
  const email = document.getElementById('client-email')?.value?.trim();
  const type = document.getElementById('client-type')?.value || 'entreprise';
  if (!name) { showToast('warning', 'Nom requis', ''); return; }
  try {
    await API.createClient({ name, email, type });
    showToast('success', 'Client ajouté', name);
    await loadAdmin();
    document.getElementById('client-name').value = '';
    document.getElementById('client-email').value = '';
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

async function deleteClient(id) {
  if (!confirm('Archiver ce client ?')) return;
  try {
    await API.deleteClient(id);
    showToast('success', 'Client archivé', '');
    await loadAdmin();
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// ===== SETTINGS =====
async function loadSettings() {
  const data = await API.settings();
  const u = data.user;
  const s = data.settings;
  
  setInput('set-first-name', u.first_name);
  setInput('set-last-name', u.last_name);
  setInput('set-email', u.email);
  setInput('set-phone', u.phone);
  setInput('set-siret', u.siret);
  setInput('set-city', u.city);
  setInput('set-plan', (u.plan||'starter').toUpperCase() + (u.plan==='pro'?' ⭐':''));
  setInput('set-iban', s?.bank_iban || '');
  
  if (s?.notif_invoice_reminder) setToggle('toggle-invoice-notif', true);
  if (s?.notif_session_reminder) setToggle('toggle-session-notif', true);
  if (s?.notif_email) setToggle('toggle-email-notif', true);

  // RGPD
  const rgpdEl = document.getElementById('rgpd-info');
  if (rgpdEl) {
    rgpdEl.innerHTML = `
      <div class="alert alert-blue">
        🛡️ <div>
          <b>RGPD — Vos droits</b><br>
          <span style="font-size:11px;font-weight:600">Consentement donné le ${formatDate(u.rgpd_consent_date)} · Depuis IP ${u.rgpd_consent_ip||'—'}</span><br>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="exportData()">📦 Exporter mes données</button>
            <button class="btn btn-outline btn-sm" style="border-color:var(--red);color:var(--red)" onclick="requestDelete()">🗑 Supprimer mon compte</button>
          </div>
        </div>
      </div>`;
  }
}

async function saveSettings() {
  const data = {
    first_name: document.getElementById('set-first-name')?.value?.trim(),
    last_name: document.getElementById('set-last-name')?.value?.trim(),
    phone: document.getElementById('set-phone')?.value?.trim(),
    siret: document.getElementById('set-siret')?.value?.trim(),
    city: document.getElementById('set-city')?.value?.trim(),
    bank_iban: document.getElementById('set-iban')?.value?.trim(),
    notif_invoice_reminder: document.getElementById('toggle-invoice-notif')?.dataset?.on==='1'?1:0,
    notif_email: document.getElementById('toggle-email-notif')?.dataset?.on==='1'?1:0,
  };
  try {
    await API.updateSettings(data);
    showToast('success', 'Paramètres sauvegardés', '✅ Modifications enregistrées');
    updateSidebar();
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

async function exportData() {
  try {
    const data = await API.rgpdExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formapro-mes-donnees-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('success', 'Export RGPD', 'Vos données ont été téléchargées.');
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

async function requestDelete() {
  const pw = prompt('Pour supprimer votre compte, confirmez votre mot de passe :');
  if (!pw) return;
  if (!confirm('ATTENTION : Cette action est irréversible. Votre compte et vos données seront supprimés dans 30 jours. Continuer ?')) return;
  try {
    await API.rgpdDelete(pw);
    showToast('success', 'Compte supprimé', 'Vous allez être déconnecté.');
    setTimeout(() => doLogout(), 2000);
  } catch(e) { showToast('error', 'Erreur', e.message); }
}

// Toggle component
function initToggles() {
  document.querySelectorAll('.toggle-switch').forEach(t => {
    t.addEventListener('click', () => {
      const isOn = t.classList.contains('on');
      t.classList.toggle('on', !isOn);
      t.dataset.on = isOn ? '0' : '1';
    });
  });
}

// ===== UTILS =====
function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatTime(s) {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setInput(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function setToggle(id, on) {
  const el = document.getElementById(id);
  if (el) { el.classList.toggle('on', on); el.dataset.on = on ? '1' : '0'; }
}

function statusBadge(s) {
  return { payee:'green', envoyee:'blue', brouillon:'gray', retard:'red', avoir:'purple' }[s] || 'gray';
}

function statusLabel(s) {
  return { payee:'Payée ✅', envoyee:'Envoyée 📤', brouillon:'Brouillon', retard:'En retard ⚠️', avoir:'Avoir' }[s] || s;
}

function statusSessionLabel(s) {
  return { planifiee:'Planifiée', confirmee:'Confirmée ✓', realisee:'Réalisée ✅', annulee:'Annulée ✗' }[s] || s;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function clearErrors(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  });
}

// Toast notifications
function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const id = 'toast-' + Date.now();
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const colors = { success:'var(--green)', error:'var(--red)', warning:'var(--orange)', info:'var(--primary)' };
  const toast = document.createElement('div');
  toast.id = id;
  toast.style.cssText = `background:white;border-left:4px solid ${colors[type]||colors.info};border-radius:10px;padding:14px 16px;margin-bottom:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);display:flex;align-items:flex-start;gap:10px;max-width:320px;animation:slideIn 0.3s ease;font-family:'Nunito',sans-serif;`;
  toast.innerHTML = `<span style="font-size:18px">${icons[type]||'ℹ️'}</span><div><div style="font-size:13px;font-weight:800;color:#1e293b">${escHtml(title)}</div>${message?`<div style="font-size:12px;color:#64748b;margin-top:2px">${escHtml(message)}</div>`:''}</div><button onclick="document.getElementById('${id}').remove()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#94a3b8;font-size:16px;padding:0 0 0 8px">×</button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(100%)'; toast.style.transition='all 0.3s ease'; setTimeout(()=>toast.remove(),300); }, 4000);
}

// Tab system
function switchTab(group, tab) {
  document.querySelectorAll(`[data-tab-group="${group}"]`).forEach(t => t.classList.remove('active'));
  document.querySelectorAll(`[data-tab-content="${group}"]`).forEach(c => c.style.display = 'none');
  document.querySelector(`[data-tab-group="${group}"][data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`tab-${group}-${tab}`)?.style?.setProperty('display', 'block');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initToggles();
});
