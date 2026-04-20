// sync.js — cross-device template sync (sync code or account-based)
// Depends on: app.js (App, saveTemplates, renderNav, renderSheet)

const Sync = (() => {
  const CODE_KEY = 'turn2sql.sync.code';
  const LAST_PULL_KEY = 'turn2sql.sync.lastPull';
  const LAST_UPDATED = new Map(); // id → ISO string, tracks what we've pushed

  const state = {
    code: localStorage.getItem(CODE_KEY) || null,
    user: null,        // { id, email } when logged in
    enabled: false,    // true once we know there's a workspace
    online: navigator.onLine,
    pushTimer: null,
  };
  window.addEventListener('online',  () => { state.online = true;  flushPending(); });
  window.addEventListener('offline', () => { state.online = false; });

  // ---------- HTTP helpers ----------
  async function req(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    };
    if (state.code && !state.user) opts.headers['X-Sync-Code'] = state.code;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- auth ----------
  async function refreshMe() {
    try {
      const me = await req('GET', '/api/auth/me');
      state.user = me && me.authenticated ? { id: me.id, email: me.email } : null;
    } catch { state.user = null; }
  }

  async function register(email, password) {
    const u = await req('POST', '/api/auth/register', { email, password });
    state.user = { id: u.id, email: u.email };
    // account has its own workspace; drop anonymous code
    setSyncCode(null);
    state.enabled = true;
    await pull({ merge: true });
    return u;
  }

  async function login(email, password) {
    const u = await req('POST', '/api/auth/login', { email, password });
    state.user = { id: u.id, email: u.email };
    setSyncCode(null);
    state.enabled = true;
    await pull({ merge: true });
    return u;
  }

  async function logout() {
    try { await req('POST', '/api/auth/logout'); } catch {}
    state.user = null;
    state.enabled = !!state.code;
  }

  async function claimSyncCode(code) {
    if (!state.user) throw new Error('must be logged in');
    await req('POST', '/api/workspace/claim', { sync_code: code.trim() });
    setSyncCode(null);
    await pull({ merge: true });
  }

  // ---------- sync code ----------
  function setSyncCode(code) {
    state.code = code;
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  }

  async function createSyncCode() {
    const r = await req('POST', '/api/workspace/anon');
    setSyncCode(r.sync_code);
    state.enabled = true;
    return r.sync_code;
  }

  async function useSyncCode(code) {
    const prev = state.code;
    setSyncCode(code.trim().toLowerCase());
    try {
      await req('GET', '/api/workspace');
    } catch (err) {
      setSyncCode(prev);
      throw err;
    }
    state.enabled = true;
    await pull({ merge: true });
  }

  function clearSyncCode() {
    setSyncCode(null);
    if (!state.user) state.enabled = false;
  }

  function currentCode() {
    return state.code;
  }

  // ---------- pull ----------
  async function pull({ merge = true } = {}) {
    if (!state.enabled) return;
    const r = await req('GET', '/api/templates');
    const remote = (r.templates || []).map(rt => {
      const d = typeof rt.data === 'string' ? JSON.parse(rt.data) : rt.data;
      return { ...d, id: rt.id, name: rt.name, _remoteUpdatedAt: rt.updatedAt };
    });
    if (!merge) {
      App.templates = remote;
    } else {
      // Merge: prefer most recent by updatedAt; remote deletions propagate via DELETE handling elsewhere.
      const byId = new Map(App.templates.map(t => [t.id, t]));
      for (const rt of remote) {
        const local = byId.get(rt.id);
        if (!local) {
          byId.set(rt.id, rt);
        } else {
          const remoteTime = new Date(rt._remoteUpdatedAt || 0).getTime();
          const localTime  = new Date(local.updatedAt || local.createdAt || 0).getTime();
          if (remoteTime >= localTime) byId.set(rt.id, rt);
        }
        LAST_UPDATED.set(rt.id, rt._remoteUpdatedAt);
      }
      App.templates = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    localStorage.setItem('turn2sql.templates.v1', JSON.stringify(App.templates));
    if (typeof renderNav === 'function') renderNav();
    if (typeof renderSheet === 'function') renderSheet();
  }

  // ---------- push ----------
  const pendingPush = new Set();    // template ids needing push
  const pendingDelete = new Set();  // template ids needing remote delete

  function markDirty(id) {
    if (!state.enabled) return;
    pendingPush.add(id);
    schedulePush();
  }

  function markDeleted(id) {
    if (!state.enabled) return;
    pendingPush.delete(id);
    pendingDelete.add(id);
    schedulePush();
  }

  function schedulePush() {
    clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(flushPending, 600);
  }

  async function flushPending() {
    if (!state.enabled || !state.online) return;
    const ids = [...pendingPush];
    pendingPush.clear();
    for (const id of ids) {
      const t = App.templates.find(x => x.id === id);
      if (!t) continue;
      try {
        const now = new Date().toISOString();
        t.updatedAt = now;
        const r = await req('PUT', '/api/templates/' + encodeURIComponent(id), {
          name: t.name,
          data: t,
          updatedAt: now,
        });
        LAST_UPDATED.set(id, r.updatedAt);
      } catch (err) {
        console.error('push failed for', id, err);
        if (err.status !== 409) pendingPush.add(id);  // retry, except on conflicts
        showToast('同步失敗: ' + err.message);
      }
    }
    const dels = [...pendingDelete];
    pendingDelete.clear();
    for (const id of dels) {
      try {
        await req('DELETE', '/api/templates/' + encodeURIComponent(id));
      } catch (err) {
        console.error('delete failed for', id, err);
        pendingDelete.add(id);
      }
    }
    localStorage.setItem('turn2sql.templates.v1', JSON.stringify(App.templates));
  }

  // ---------- boot ----------
  async function init() {
    await refreshMe();
    if (state.user || state.code) {
      state.enabled = true;
      try { await pull({ merge: true }); }
      catch (err) {
        console.error('initial pull failed', err);
        if (err.status === 401 && state.code) {
          // code no longer valid
          clearSyncCode();
          showToast('Sync code 無效,已停用同步');
        }
      }
    }
  }

  function status() {
    return {
      user: state.user,
      code: state.code,
      enabled: state.enabled,
      online: state.online,
    };
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      background: '#000080', color: '#fff', padding: '8px 14px',
      border: '2px solid #000', fontSize: '12px', zIndex: 10000,
      boxShadow: '2px 2px 0 #000',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  return {
    init, status, refreshMe,
    register, login, logout, claimSyncCode,
    createSyncCode, useSyncCode, clearSyncCode, currentCode,
    pull, markDirty, markDeleted, flushPending,
    showToast,
  };
})();

window.Sync = Sync;
