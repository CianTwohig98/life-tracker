/* Pure sync logic: per-section / per-day last-write-wins merge. No network, no DOM. */
(function (root) {
  'use strict';
  const J = x => JSON.stringify(x === undefined ? null : x);
  const clone = x => JSON.parse(JSON.stringify(x));
  const miscOf = s => ({ months: s.months || {}, bonuses: s.bonuses || [], claims: s.claims || {}, todos: s.todos || [], ideas: s.ideas || [] });
  const hashes = s => { const logs = {}; for (const d of Object.keys(s.logs || {})) logs[d] = J(s.logs[d]); return { config: J(s.config), misc: J(miscOf(s)), logs }; };

  /** Stamp whatever changed since lastH with `now`. Returns the new lastH. */
  function stamp(state, lastH, now) {
    const sy = state.sync = state.sync || { at: { config: 0, misc: 0 }, logs: {} };
    sy.at = sy.at || { config: 0, misc: 0 }; sy.logs = sy.logs || {};
    const h = hashes(state);
    if (lastH) {
      if (h.config !== lastH.config) sy.at.config = now;
      if (h.misc !== lastH.misc) sy.at.misc = now;
      for (const d of Object.keys(h.logs)) if (h.logs[d] !== (lastH.logs || {})[d]) sy.logs[d] = now;
    }
    return h;
  }

  /** a, b are the competing versions {stamp, val}; the newer stamp wins, ties go to the richer data, then to `prefer`. */
  function pick(a, b, prefer) {
    if (a.stamp !== b.stamp) return a.stamp > b.stamp ? a : b;
    const la = J(a.val).length, lb = J(b.val).length;
    if (la !== lb) return la > lb ? a : b;
    return prefer === 'remote' ? b : a;
  }

  function merge(local, remote) {
    if (!remote) return clone(local);
    const L = local, R = remote, lsy = L.sync || {}, rsy = R.sync || {}, lat = lsy.at || {}, rat = rsy.at || {};
    const out = clone(L); out.sync = { at: { config: 0, misc: 0 }, logs: {} };
    const cfg = pick({ stamp: lat.config || 0, val: L.config }, { stamp: rat.config || 0, val: R.config }, 'remote');
    out.config = clone(cfg.val); out.sync.at.config = cfg.stamp;
    const mi = pick({ stamp: lat.misc || 0, val: miscOf(L) }, { stamp: rat.misc || 0, val: miscOf(R) }, 'remote');
    Object.assign(out, clone(mi.val)); out.sync.at.misc = mi.stamp;
    out.logs = {}; const days = new Set(Object.keys(L.logs || {}).concat(Object.keys(R.logs || {})));
    for (const d of days) {
      const a = (L.logs || {})[d], b = (R.logs || {})[d];
      if (!a) { out.logs[d] = clone(b); out.sync.logs[d] = (rsy.logs || {})[d] || 0; continue; }
      if (!b) { out.logs[d] = clone(a); out.sync.logs[d] = (lsy.logs || {})[d] || 0; continue; }
      const w = pick({ stamp: (lsy.logs || {})[d] || 0, val: a }, { stamp: (rsy.logs || {})[d] || 0, val: b }, 'local');
      out.logs[d] = clone(w.val); out.sync.logs[d] = w.stamp;
    }
    out.startDate = [L.startDate, R.startDate].filter(Boolean).sort()[0] || L.startDate;
    out.welcomed = !!(L.welcomed || R.welcomed);
    out.lastBackup = [L.lastBackup, R.lastBackup].filter(Boolean).sort().pop() || undefined;
    out.v = 2; return out;
  }
  /** content equality ignoring the stamps (used to decide whether a push is needed) */
  const sameData = (a, b) => { const h = hashes(a), g = hashes(b); return h.config === g.config && h.misc === g.misc && J(h.logs) === J(g.logs); };
  const api = { stamp, merge, hashes, sameData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LTSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
