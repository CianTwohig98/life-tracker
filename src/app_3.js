
/* ---------- cross-device sync (Supabase REST, per-day merge) ---------- */
const SYNC_KEY = 'lifetracker.v2.sync';
const LT = window.LTSync;
let sy = (function () { try { return JSON.parse(lsGet(SYNC_KEY) || '{}'); } catch (e) { return {}; } })();
const syCfg = () => Object.assign({}, window.LT_SYNC || {}, { url: (sy.url || (window.LT_SYNC || {}).url || '').replace(/\/$/, ''), key: sy.key || (window.LT_SYNC || {}).key || '' });
const syncSave = () => lsSet(SYNC_KEY, JSON.stringify(sy));
const syncSigned = () => !!(sy.session && sy.session.refresh_token && syCfg().url && syCfg().key);
let lastH = null, syncing = false, again = false, pushTimer = null, syncStatus = { s: 'idle', at: null, msg: '' };

function syncRebase() { lastH = LT.hashes(state); }
function syncDirty() {
  lastH = LT.stamp(state, lastH, Date.now());
  if (syncSigned()) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncNow(), 1500); }
}
function syncBadge() {
  if (!syncSigned() || appMode !== 'real') return '';
  const t = syncStatus, label = t.s === 'syncing' ? 'syncing' : t.s === 'ok' ? 'synced ' + t.at : t.s === 'offline' ? 'offline, will retry' : t.s === 'auth' ? 'sign in again' : t.s === 'error' ? 'sync error' : 'sync on';
  return '<span class="syncst ' + (t.s === 'ok' ? 'ok' : t.s === 'syncing' || t.s === 'idle' ? '' : 'bad') + '" data-act="tab" data-id="settings" title="' + esc(t.msg || '') + '">' + esc(label) + '</span>';
}
function setSync(s, msg) {
  syncStatus = { s, at: s === 'ok' ? pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()) : syncStatus.at, msg: msg || '' };
  const el = $('.syncst'); if (el) el.outerHTML = syncBadge(); else if (!$('.syncst') && $('.brand')) $('.brand').insertAdjacentHTML('beforeend', syncBadge());
  const st = $('#syncState'); if (st) st.textContent = syncLine();
}
function syncLine() { const t = syncStatus; return t.s === 'ok' ? 'Last synced ' + t.at : t.s === 'syncing' ? 'Syncing...' : t.s === 'offline' ? 'Offline. It will retry when you are back online.' : t.s === 'auth' ? 'Your login expired. Sign in again.' : t.s === 'error' ? 'Error: ' + t.msg : 'Waiting for the first sync.'; }

async function sbReq(method, path, body, token, extra) {
  const c = syCfg(); const headers = Object.assign({ apikey: c.key, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, extra || {});
  const r = await fetch(c.url + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { /* not json */ }
  if (!r.ok) { const e = new Error((j && (j.msg || j.error_description || j.message || j.error)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
  return j;
}
function keepSession(j) { if (!j || !j.access_token) return false; sy.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, uid: (j.user || {}).id || (sy.session || {}).uid, email: (j.user || {}).email || (sy.session || {}).email }; syncSave(); return true; }
async function ensureToken() {
  const s = sy.session; if (!s) throw Object.assign(new Error('not signed in'), { status: 401 });
  if (s.expires_at - 60000 > Date.now()) return s.access_token;
  try { const j = await sbReq('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }); if (!keepSession(j)) throw new Error('no session'); return sy.session.access_token; }
  catch (e) { if (e.status >= 400 && e.status < 500) { sy.session = null; syncSave(); e.status = 401; } throw e; }
}
async function syncNow() {
  if (!syncSigned() || appMode !== 'real') return;
  if (syncing) { again = true; return; }
  syncing = true; setSync('syncing');
  try {
    const tok = await ensureToken(), uid = sy.session.uid;
    const rows = await sbReq('GET', '/rest/v1/tracker_state?select=data,updated_at&user_id=eq.' + uid, null, tok);
    const remote = rows && rows[0] && rows[0].data && rows[0].data.logs ? rows[0].data : null;
    const merged = remote ? LT.merge(state, remote) : state;
    if (remote && !LT.sameData(merged, state)) {
      const day = TODAY; try { const pb = JSON.parse(lsGet('lifetracker.v2.prebackup') || '{}'); if (pb.day !== day) lsSet('lifetracker.v2.prebackup', JSON.stringify({ day, state })); } catch (e) { lsSet('lifetracker.v2.prebackup', JSON.stringify({ day, state })); }
      state = migrate(merged); syncRebase(); save0(); const a = document.activeElement; if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) render();
    } else if (remote) { state.sync = merged.sync; syncRebase(); save0(); }
    if (!remote || !LT.sameData(state, remote) || J2(state.sync) !== J2(remote.sync)) await sbReq('POST', '/rest/v1/tracker_state?on_conflict=user_id', { user_id: uid, data: state, updated_at: new Date().toISOString() }, tok, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    setSync('ok');
  } catch (e) {
    if (e.status === 401 || e.status === 403) setSync('auth', e.message); else if (!navigator.onLine || e instanceof TypeError) setSync('offline', e.message); else setSync('error', e.message);
  } finally { syncing = false; if (again) { again = false; setTimeout(syncNow, 500); } }
}
const J2 = x => JSON.stringify(x === undefined ? null : x);
const save0 = () => lsSet(KEYS.real, JSON.stringify(state));

function syncInit() {
  syncRebase();
  addEventListener('online', () => syncNow()); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  if (syncSigned()) syncNow();
}
function syncCard() {
  const c = syCfg(), baked = !!((window.LT_SYNC || {}).url);
  let h = '<div class="card" style="margin-top:12px"><h2>Sync across devices</h2>';
  if (syncSigned()) {
    h += '<p class="mu">Signed in as <b>' + esc((sy.session || {}).email || '') + '</b>. <span id="syncState">' + esc(syncLine()) + '</span></p><div class="row"><button class="btn pri" data-act="syncNowBtn">Sync now</button><button class="btn" data-act="syncOut">Sign out</button></div>' +
      '<p class="hint">Every change is saved here first and sent to your private cloud copy a moment later. Days merge individually, so logging on the phone and the laptop never loses either. If two devices edit the same day, the newer edit wins. A safety copy of this device is kept before any merge changes it.</p>';
  } else {
    h += '<p class="mu">Sign in on each device with the same email and password to share one set of data. The cloud copy is also your backup.</p><div class="fld">' + (baked ? '' : '<label>Project URL</label><input type="text" id="sbUrl" value="' + esc(c.url) + '" placeholder="https://xxxx.supabase.co" autocapitalize="off"><label>Anon key</label><input type="text" id="sbKey" value="' + esc(c.key) + '" autocapitalize="off">') +
      '<label>Email</label><input type="email" id="sbEmail" value="' + esc(sy.email || '') + '" autocapitalize="off" autocomplete="username"><label>Password</label><input type="password" id="sbPass" autocomplete="current-password"></div>' +
      '<div class="row"><button class="btn pri" data-act="syncLogin">Sign in</button><button class="btn" data-act="syncSignup">Create account</button></div>' + (syncStatus.s === 'error' || syncStatus.s === 'auth' ? '<p class="hint dn">' + esc(syncStatus.msg) + '</p>' : '');
  }
  return h + '</div>';
}
const SYNC_ACT = {
  syncLogin: () => syncAuth(false), syncSignup: () => syncAuth(true),
  syncNowBtn: async () => { await syncNow(); toast(syncStatus.s === 'ok' ? 'Synced' : 'Sync: ' + (syncStatus.msg || syncStatus.s)); render(); },
  syncOut: () => { sy.session = null; syncSave(); setSync('idle'); render(); toast('Signed out. Your data stays on this device.'); }
};
async function syncAuth(signup) {
  const val = id => ($(id) ? $(id).value.trim() : ''), email = val('#sbEmail'), pass = ($('#sbPass') || {}).value || '';
  if ($('#sbUrl')) { sy.url = val('#sbUrl'); sy.key = val('#sbKey'); }
  if (!syCfg().url || !syCfg().key) { toast('Enter the project URL and anon key'); return; }
  if (!email || pass.length < 6) { toast('Email and a password of at least 6 characters'); return; }
  sy.email = email; syncSave();
  try {
    const j = signup ? await sbReq('POST', '/auth/v1/signup', { email, password: pass }) : await sbReq('POST', '/auth/v1/token?grant_type=password', { email, password: pass });
    if (!keepSession(j)) { toast('Account created. Confirm it via the email we sent, then sign in.'); return; }
    syncStatus = { s: 'idle', at: null, msg: '' }; render(); await syncNow(); render(); toast(syncStatus.s === 'ok' ? 'Signed in and synced' : 'Signed in, sync: ' + (syncStatus.msg || syncStatus.s));
  } catch (e) { syncStatus = { s: 'error', at: null, msg: e.message }; toast(e.message); render(); }
}
