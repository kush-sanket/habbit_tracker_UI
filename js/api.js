/**
 * api.js — All API calls, token management, base request helper
 * BASE_URL points to the Django backend.
 */
const BASE_URL = 'http://127.0.0.1:8000/api/v1';

// ─── Token helpers ───────────────────────────────────────────────────────────
const Auth = {
  getAccess()  { return localStorage.getItem('access'); },
  getRefresh() { return localStorage.getItem('refresh'); },
  setTokens(access, refresh) {
    localStorage.setItem('access', access);
    if (refresh) localStorage.setItem('refresh', refresh);
  },
  clear() {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
  },
  setUser(user) { localStorage.setItem('user', JSON.stringify(user)); },
  getUser()    {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  },
  isLoggedIn() { return !!Auth.getAccess(); },
};

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const access = Auth.getAccess();
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Attempt token refresh on 401
  if (res.status === 401 && Auth.getRefresh()) {
    const refreshed = await _refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${Auth.getAccess()}`;
      const retry = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return _parseResponse(retry);
    } else {
      Auth.clear();
      window.location.href = 'index.html';
      return;
    }
  }

  return _parseResponse(res);
}

async function _parseResponse(res) {
  let data = null;
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok) {
    const err = new Error(data?.detail || data?.non_field_errors?.[0] || `HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function _refreshToken() {
  try {
    const res = await fetch(`${BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: Auth.getRefresh() }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    Auth.setTokens(data.access, null);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────
const API = {
  register({ username, email, password, password2 }) {
    return apiFetch('/auth/register/', { method: 'POST', body: { username, email, password, password2 } });
  },
  login({ email, password }) {
    return apiFetch('/auth/login/', { method: 'POST', body: { email, password } });
  },
  logout() {
    const refresh = Auth.getRefresh();
    return apiFetch('/auth/logout/', { method: 'POST', body: { refresh } });
  },

  // ─── Profile ─────────────────────────────────────────────────────────────
  getProfile() {
    return apiFetch('/profile/');
  },
  togglePrivacy() {
    return apiFetch('/profile/privacy/', { method: 'POST' });
  },

  // ─── Categories ──────────────────────────────────────────────────────────
  getCategories() {
    return apiFetch('/categories/');
  },

  // ─── Branches ────────────────────────────────────────────────────────────
  createBranch({ category, name, description }) {
    return apiFetch('/branches/create/', { method: 'POST', body: { category, name, description } });
  },
  getBranches() {
    return apiFetch('/branches/');
  },
  getBranchDetail(branchId) {
    return apiFetch(`/branches/${branchId}/`);
  },

  // ─── Tasks ───────────────────────────────────────────────────────────────
  createTask({ branch, title, frequency, due_date }) {
    return apiFetch('/tasks/create/', { method: 'POST', body: { branch, title, frequency, due_date } });
  },
  getTasks() {
    return apiFetch('/tasks/');
  },
  completeTask(taskId) {
    return apiFetch(`/tasks/${taskId}/complete/`, { method: 'POST' });
  },
  missTask(taskId) {
    return apiFetch(`/tasks/${taskId}/miss/`, { method: 'POST' });
  },
  rerouteTask(taskId, { title, reason, due_date }) {
    return apiFetch(`/tasks/${taskId}/reroute/`, { method: 'POST', body: { title, reason, due_date } });
  },

  // ─── Streak ──────────────────────────────────────────────────────────────
  getStreak() {
    return apiFetch('/streak/');
  },

  // ─── Tree ─────────────────────────────────────────────────────────────────
  getTreeState() {
    return apiFetch('/tree-state/');
  },

  // ─── Leaderboard ─────────────────────────────────────────────────────────
  getLeaderboard(sort = 'score', limit = 50) {
    return apiFetch(`/leaderboard/?sort=${encodeURIComponent(sort)}&limit=${limit}`);
  },
};
