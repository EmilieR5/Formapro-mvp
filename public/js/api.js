// FormaPro API Client
const API = {
  baseUrl: '/api',
  accessToken: null,
  refreshing: false,
  refreshQueue: [],

  async request(method, path, data = null, opts = {}) {
    const url = this.baseUrl + path;
    const headers = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    const config = { method, headers, credentials: 'include' };
    if (data && method !== 'GET') config.body = JSON.stringify(data);

    let res = await fetch(url, config);

    // Auto-refresh on 401 TOKEN_EXPIRED
    if (res.status === 401) {
      const body = await res.clone().json().catch(() => ({}));
      if (body.error === 'TOKEN_EXPIRED' && !opts._retry) {
        if (this.refreshing) {
          return new Promise((resolve, reject) => {
            this.refreshQueue.push({ resolve, reject, method, path, data });
          });
        }
        this.refreshing = true;
        try {
          const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
          if (refreshRes.ok) {
            const refreshJson = await refreshRes.json();
            this.accessToken = refreshJson.accessToken || refreshJson.access_token;
            this.refreshQueue.forEach(q => q.resolve(this.request(q.method, q.path, q.data, { _retry: true })));
            this.refreshQueue = [];
            return this.request(method, path, data, { _retry: true });
          }
        } catch(e) {}
        this.refreshing = false;
        this.logout();
        return;
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur réseau' }));
      throw new Error(err.error || err.errors?.[0]?.msg || 'Erreur');
    }
    return res.json();
  },

  get: (path) => API.request('GET', path),
  post: (path, data) => API.request('POST', path, data),
  put: (path, data) => API.request('PUT', path, data),
  delete: (path) => API.request('DELETE', path),

  async logout() {
    try { await this.post('/auth/logout'); } catch(e) {}
    this.accessToken = null;
    window.location.href = '/';
  },

  // Auth
  login: (email, pw) => API.post('/auth/login', { email, password: pw }),
  register: (data) => API.post('/auth/register', data),
  refresh: () => API.post('/auth/refresh'),
  me: () => API.get('/auth/me'),
  forgotPassword: (email) => API.post('/auth/forgot-password', { email }),
  verifyOtp: (otp, user_id) => API.post('/auth/verify-otp', { otp, user_id }),
  resetPassword: (data) => API.post('/auth/reset-password', data),
  rgpdExport: () => API.post('/auth/rgpd/export'),
  rgpdDelete: (password) => API.delete('/auth/rgpd/delete', { password }),

  // Dashboard
  dashboard: () => API.get('/dashboard'),

  // Clients
  clients: () => API.get('/clients'),
  createClient: (d) => API.post('/clients', d),
  updateClient: (id, d) => API.put(`/clients/${id}`, d),
  deleteClient: (id) => API.delete(`/clients/${id}`),

  // Sessions
  sessions: (month, year) => API.get(`/sessions?month=${month}&year=${year}`),
  createSession: (d) => API.post('/sessions', d),
  updateSession: (id, d) => API.put(`/sessions/${id}`, d),

  // Invoices
  invoices: () => API.get('/invoices'),
  createInvoice: (d) => API.post('/invoices', d),
  sendInvoice: (id) => API.put(`/invoices/${id}/send`),
  markPaid: (id) => API.put(`/invoices/${id}/mark-paid`),
  remindInvoice: (id) => API.post(`/invoices/${id}/remind`),

  // Qualiopi
  qualiopi: () => API.get('/qualiopi'),

  // Learners
  learners: () => API.get('/learners'),
  createLearner: (d) => API.post('/learners', d),

  // Trainings
  trainings: () => API.get('/trainings'),
  createTraining: (d) => API.post('/trainings', d),

  // Notifications
  notifications: () => API.get('/notifications'),
  markNotifRead: (id) => API.put(`/notifications/${id}/read`),
  markAllRead: () => API.put('/notifications/read-all'),

  // Settings
  settings: () => API.get('/settings'),
  updateSettings: (d) => API.put('/settings', d),

  // BPF
  bpf: (year) => API.get(`/bpf?year=${year}`)
};
