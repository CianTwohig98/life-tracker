/* Life Tracker UI */
(function () {
'use strict';
const E = window.LifeRPG;
const $ = (s, r) => (r || document).querySelector(s);
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const sg = n => (n > 0.5 ? '+' : n < -0.5 ? '−' : '') + fmt(Math.abs(n));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dlabel = d => { const dt = E.pd(d); return DOW[dt.getUTCDay()] + ' ' + dt.getUTCDate() + ' ' + MON[dt.getUTCMonth()]; };
const barCls = p => p < 30 ? 'lo' : p < 60 ? 'mid' : 'hi';
const STATE_LABEL = { ok: 'ok', partial: 'partial', miss: 'missed', unlogged: 'not logged', pending: 'pending', waived: 'waived', rest: 'rest day', neutral: 'neutral', madeup: 'made up', blank: 'left blank', none: '' };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const GCOL = ['#6fae7e', '#5fa3c9', '#b58bc4', '#c9a25a', '#c97a7a', '#7ac9b8'];
const SCOL = { morning: '#d6b25e', afternoon: '#d98c5f', night: '#8a8fd6' };
const gcol = g => GCOL[groupList().indexOf(g)] || '#8a929e';
const scol = id => gcol((skillOf(id) || {}).group);

/* ---------- persistence ---------- */
const KEYS = { real: 'lifetracker.v2.real', demo: 'lifetracker.v2.demo', mode: 'lifetracker.v2.mode' };
const mem = {}; let storageOk = true;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { storageOk = false; return mem[k] || null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { storageOk = false; mem[k] = v; } };
let TODAY = todayStr(), appMode = 'real', state, res;
const ui = { actOpen: null, actSel: {}, tab: 'dashboard', slot: 'morning', date: TODAY, simPersona: 'consistent', simDays: 90, sim: null, simAll: null };
(function () { const h = new Date().getHours(); ui.slot = h < 11 ? 'morning' : h < 18 ? 'afternoon' : 'night'; })();

function migrate(s) {
  const def = E.defaultState(TODAY), dS = def.config.settings;
  s.config = s.config || def.config;
  const S = s.config.settings = Object.assign({}, dS, s.config.settings || {});
  S.curve = Object.assign({}, dS.curve, S.curve || {}); S.catchUp = Object.assign({}, dS.catchUp, S.catchUp || {});
  S.modeScale = Object.assign({}, dS.modeScale, S.modeScale || {}); S.rhythm = S.rhythm || dS.rhythm; S.cheatFrom = S.cheatFrom || dS.cheatFrom; S.foodCost = Object.assign({}, dS.foodCost, S.foodCost || {});
  if (!Array.isArray(S.backfill)) S.backfill = dS.backfill;
  for (const k of ['skills', 'indicators', 'bars', 'quests']) if (!Array.isArray(s.config[k])) s.config[k] = def.config[k];
  s.config.skills.forEach(k => { if (!k.group) k.group = 'Lifestyle'; });
  E.upgradeConfig(s.config);
  s.logs = s.logs || {}; s.months = s.months || {}; s.bonuses = s.bonuses || []; s.todos = Array.isArray(s.todos) ? s.todos : [];
  s.claims = s.claims || {}; s.startDate = s.startDate || TODAY; s.v = 2;
  return s;
}
function loadState() {
  appMode = lsGet(KEYS.mode) === 'demo' && lsGet(KEYS.demo) ? 'demo' : 'real';
  const raw = lsGet(KEYS[appMode]);
  if (raw) { try { const o = JSON.parse(raw); if (o && o.config && (o.config.rev || 0) < E.REV) lsSet('lifetracker.v2.preupgrade', raw); return migrate(o); } catch (e) { console.warn('bad saved state', e); } }
  return E.defaultState(TODAY);
}
const save = () => { if (appMode === 'real') syncDirty(); lsSet(KEYS[appMode], JSON.stringify(state)); };
function persist() { save(); render(); }

/* ---------- helpers ---------- */
const cfg = () => state.config;
const S_ = () => state.config.settings;
const skillOf = id => cfg().skills.find(s => s.id === id);
const indOf = id => cfg().indicators.find(i => i.id === id);
const slotsOf = i => (i.slots && i.slots.length) ? i.slots : [i.slot];
const isPart = i => (i.kind === 'effort' || i.kind === 'bar') && slotsOf(i).length > 1;
/* full-day items live in the last check-in they allow (night); one-slot items stay where they are */
const lastSlot = i => slotsOf(i).slice().sort((a, b) => E.SLOTS.indexOf(a) - E.SLOTS.indexOf(b)).pop();
const shownIn = (i, slot) => slotsOf(i).includes(slot) && lastSlot(i) === slot;
const SHORT = { supp_multi: 'Multivitamin', supp_d3: 'Vitamin D3', supp_zinc: 'Zinc', supp_creatine: 'Creatine', supp_water: 'Water 0.5 L', supp_protein: 'Protein 30 g', supp_mag: 'Magnesium', teeth_am: 'Teeth', teeth_pm: 'Teeth', shower: 'Shower', skincare: 'Skincare', sunscreen: 'Sunscreen', stretch_ham: 'Hamstring stretch', job_time: 'Job / PhD', study_de: 'German', study_or: 'Operations Research', reading: 'Reading', roles_found: 'Roles found', apps_sent: 'Applications sent', org_browsed: 'Browsed an organisation', uni_browsed: 'Browsed a university', coffee_chat: 'Coffee chat', outreach: 'Reached out', workout: 'Workout', walk: 'Walk' };
const shortName = i => SHORT[i.id] || i.name;
const ACT_CATS = [{ id: 'fitness', label: 'Fitness', skills: ['fitness'] }, { id: 'study', label: 'Study', skills: ['german', 'or', 'reading'] }, { id: 'career', label: 'Career', skills: ['career'] }];
function partVal(day, ind, slot) {
  const p = day.parts && day.parts[ind.id];
  if (p && Object.keys(p).length) return p[slot] == null ? null : p[slot];
  return slot === ind.slot && day.v && day.v[ind.id] != null ? Number(day.v[ind.id]) : null;
}
function setPart(day, ind, slot, val) {
  day.parts = day.parts || {}; let p = day.parts[ind.id];
  if (!p) { p = day.parts[ind.id] = {}; if (day.v[ind.id] != null && !isNaN(Number(day.v[ind.id]))) p[ind.slot] = Number(day.v[ind.id]); }
  if (val == null || isNaN(val)) delete p[slot]; else p[slot] = Math.max(0, val);
  const ks = Object.keys(p);
  if (ks.length) day.v[ind.id] = ks.reduce((x, k) => x + p[k], 0); else { delete day.parts[ind.id]; delete day.v[ind.id]; }
}
function parseTime(s) {
  let t = String(s || '').trim().replace(/[.,;hH]/, ':'); let hh, mm;
  if (/^\d{3,4}$/.test(t)) { hh = Number(t.slice(0, -2)); mm = Number(t.slice(-2)); }
  else { const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t); if (!m) return null; hh = Number(m[1]); mm = m[2] == null ? 0 : Number(m[2]); }
  if (!(hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) return null; return pad(hh) + ':' + pad(mm);
}
const homeInd = () => cfg().indicators.find(i => i.kind === 'rooms' && !i.off);
function getDay(d) { return state.logs[d] || (state.logs[d] = { v: {}, slots: {}, mode: 'normal' }); }
const dayXp = d => { const r = res.days[d]; return r ? cfg().skills.reduce((x, s) => x + r.skills[s.id].gain - r.skills[s.id].loss, 0) : 0; };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function openModal(html) { const m = $('#modal'); m.innerHTML = '<div class="ov" data-act="ovclick"><div class="md">' + html + '</div></div>'; m.hidden = false; }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
const opt = (v, label, sel) => '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
function groupList() { const g = E.GROUPS.slice(); cfg().skills.forEach(s => { if (!g.includes(s.group)) g.push(s.group); }); return g; }
const skillsByGroup = () => groupList().map(g => ({ g, skills: cfg().skills.filter(s => s.group === g) })).filter(x => x.skills.length);

/* ---------- charts ---------- */
function svgBars(vals) {
  const W = 640, H = 120, n = vals.length || 1, bw = W / n;
  const mx = Math.max(10, ...vals), mn = Math.min(0, ...vals), range = mx - mn;
  const y0 = H - 8 - ((0 - mn) / range) * (H - 16);
  let b = '';
  vals.forEach((v, i) => { const h = Math.abs(v) / range * (H - 16); b += '<rect x="' + (i * bw + 1).toFixed(1) + '" y="' + (v >= 0 ? y0 - h : y0).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + Math.max(0.5, h).toFixed(1) + '" fill="' + (v >= 0 ? 'var(--ok)' : 'var(--bad)') + '"/>'; });
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><line x1="0" x2="' + W + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#2a2f37"/>' + b + '</svg>';
}
function svgLines(series, opts) {
  opts = opts || {}; const W = 640, H = opts.h || 140, P = 22;
  const all = series.flatMap(s => s.pts.filter(p => p[1] != null)); if (!all.length) return '<p class="mu">Not enough data yet.</p>';
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  let y0 = opts.yMin != null ? opts.yMin : Math.min(...ys), y1 = opts.yMax != null ? opts.yMax : Math.max(...ys);
  if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const X = x => P + (x - x0) / (x1 - x0) * (W - P - 6), Y = y => H - 14 - (y - y0) / (y1 - y0) * (H - 28);
  let g = '<line x1="' + P + '" x2="' + W + '" y1="' + Y(y0) + '" y2="' + Y(y0) + '" stroke="#2a2f37"/>';
  g += '<text x="2" y="' + (Y(y1) + 4) + '" fill="#8a929e" font-size="10">' + (+y1.toFixed(1)) + '</text><text x="2" y="' + (Y(y0) + 4) + '" fill="#8a929e" font-size="10">' + (+y0.toFixed(1)) + '</text>';
  for (const s of series) {
    let d = ''; let pen = false;
    for (const p of s.pts) { if (p[1] == null) continue; d += (pen ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); pen = true; }
    g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.w || 1.6) + '" stroke-linejoin="round"/>';
    if (s.dots) for (const pt of s.pts) if (pt[1] != null) g += '<rect x="' + (X(pt[0]) - 2).toFixed(1) + '" y="' + (Y(pt[1]) - 2).toFixed(1) + '" width="4" height="4" fill="' + s.color + '"/>';
  }
  const lg = series.filter(s => s.name).map(s => '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>').join('');
  return '<svg class="chart" style="height:' + H + 'px" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + g + '</svg>' + (lg ? '<div class="legend">' + lg + '</div>' : '');
}
const lastDays = n => { const a = []; for (let i = n - 1; i >= 0; i--) a.push(E.addDays(TODAY, -i)); return a; };

/* ---------- shell ---------- */
function render() {
  TODAY = todayStr(); if (ui.date > TODAY) ui.date = TODAY;
  res = E.compute(state, { today: TODAY, viewDate: ui.date });
  const y = window.scrollY;
  const views = { more: vMore, dashboard: vDashboard, checkin: vCheckin, skills: vSkills, todos: vTodos, quests: vQuests, sim: vSim, settings: vSettings };
  $('#app').innerHTML = vHeader() + vTabs() + (appMode === 'demo' ? '<div class="banner"><span><b>Demo mode</b>: simulated data. Your real data is untouched.</span><button class="btn sm" data-act="exitDemo">Exit demo</button></div>' : '') +
    (storageOk ? '' : '<div class="note warn">Browser storage is unavailable here, so changes only live in this tab. Use Settings, Export backup, often.</div>') + views[ui.tab]();
  window.scrollTo(0, y);
}
function vHeader() {
  const isT = ui.date === TODAY;
  return '<header class="top"><div class="brand">Life Tracker <span>v2</span>' + syncBadge() + '</div>' +
    '<div class="datenav"><button data-act="dprev" aria-label="Previous day">&lt;</button><button class="' + (isT ? 'today' : '') + '" data-act="dtoday">' + dlabel(ui.date) + (isT ? ' (today)' : '') + '</button>' +
    '<input type="date" data-in="date" value="' + ui.date + '" max="' + TODAY + '"><button data-act="dnext" aria-label="Next day"' + (isT ? ' disabled' : '') + '>&gt;</button></div>' +
    '<div class="chips"><span class="chip">Total level<b>' + res.totalLevel + '</b></span><span class="chip">XP ' + (isT ? 'today' : 'that day') + '<b class="' + (dayXp(ui.date) >= 0 ? 'pos' : 'neg') + '">' + sg(dayXp(ui.date)) + '</b></span><span class="chip">Life tokens<b>' + res.tokens.left + '/' + res.tokens.per + '</b></span></div></header>';
}
function vMore() {
  const items = [['quests', 'Milestones', 'Rewards you are working towards'], ['sim', 'Simulate', 'Try the scoring on practice data'], ['settings', 'Settings', 'Targets, rooms, indicators, backup']];
  return '<div class="card"><h2>More</h2>' + items.map(x => '<button class="morebtn" data-act="tab" data-id="' + x[0] + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></button>').join('') + '</div>';
}
function vTabs() {
  const bt = [['dashboard', 'Home'], ['checkin', 'Check-in'], ['skills', 'Skills'], ['todos', 'To-dos'], ['more', 'More']], moreOn = ['more', 'quests', 'sim', 'settings'].includes(ui.tab);
  const bottom = '<nav class="btabs">' + bt.map(x => '<button class="' + ((x[0] === 'more' ? moreOn : ui.tab === x[0]) ? 'on' : '') + '" data-act="tab" data-id="' + x[0] + '">' + x[1] + '</button>').join('') + '</nav>';
  return vTabsDesk() + bottom;
}
function vTabsDesk() {
  const t = [['dashboard', 'Dashboard'], ['checkin', 'Check-in'], ['skills', 'Skills'], ['todos', 'To-dos'], ['quests', 'Milestones'], ['sim', 'Simulate'], ['settings', 'Settings']];
  return '<nav class="tabs">' + t.map(x => '<button class="' + (ui.tab === x[0] ? 'on' : '') + '" data-act="tab" data-id="' + x[0] + '">' + x[1] + '</button>').join('') + '</nav>';
}

/* ---------- dashboard ---------- */
function slotDots(d) {
  const r = res.days[d]; if (!r) return '';
  return '<div class="slottags">' + E.SLOTS.map(s => { const sl = r.slots[s]; const miss = !sl.logged && d < TODAY && !r.waive; return '<span class="stag' + (sl.logged ? ' on' : miss ? ' miss' : '') + '" style="--sc:' + SCOL[s] + '" title="' + s + (sl.logged ? ' logged' : ' open') + '">' + s.charAt(0).toUpperCase() + '</span>'; }).join('') + '</div>';
}
function vRecs() {
  if (ui.date !== TODAY) return '';
  const now = new Date(), rec = E.recommend(state, res, TODAY, now.getHours() * 60 + now.getMinutes());
  const rows = rec.schedule.map(x => '<tr class="k-' + x.kind + '" style="--gc:' + scol(x.skill) + '"><td class="tm">' + x.start + (x.mins ? '<small> to ' + x.end + '</small>' : '') + '</td><td class="tx">' + esc(x.text) + '</td><td class="tg">' + esc(x.skillName) + '</td></tr>').join('');
  const rw = rec.rewards.map(q => '<div class="rw"><span><b>' + esc(q.reward || q.name) + '</b> <small>' + esc(q.name) + '</small></span>' + (q.claimed ? '<span class="badge">claimed today</span>' : q.done ? '<button class="btn pri sm" data-act="claim" data-id="' + q.id + '">Unlocked, claim</button>' : '<span class="badge">locked</span>') + '</div>').join('');
  return '<div class="card" style="margin-bottom:12px"><div class="row sp"><h2 style="margin:0">Plan &middot; ' + rec.title.toLowerCase() + ', from ' + rec.from + '</h2><button class="btn sm" data-act="openSlot" data-id="' + rec.stage + '">Open ' + rec.stage + ' check-in</button></div>' +
    '<p class="sumline" style="margin-top:10px">' + esc(rec.summary) + '</p>' +
    (rows ? '<table class="plan"><tbody>' + rows + '</tbody></table>' : '') +
    (rec.overflow.length ? '<p class="hint">Did not fit before ' + (rec.cheatFrom ? rec.cheatFrom + ' (cheat evening)' : 'bedtime') + ': ' + esc(rec.overflow.join(', ')) + '. Move them to tomorrow or drop the lowest priority.</p>' : '') +
    (rec.notes.length ? '<ul class="recs">' + rec.notes.map(i => '<li><span class="tag">' + esc(i.skillName) + '</span><span>' + esc(i.text) + '</span></li>').join('') + '</ul>' : '') +
    (rw ? '<div class="rewards"><h2>Rewards for today</h2>' + rw + '</div>' : '') +
    '</div>';
}
function roomsCard() {
  const home = homeInd(), r = res.days[ui.date], rd = home && r && r.rooms && r.rooms[home.id]; if (!rd) return '';
  const rows = home.rooms.map(x => ({ id: x.id, name: x.name, lv: rd.rooms[x.id] })).sort((a, b) => a.lv - b.lv);
  return '<div class="card"><div class="row sp"><h2 style="margin:0">Household &middot; ' + Math.round(rd.total) + '%</h2><span class="unit">weakest room: ' + esc(rows[0].name) + '</span></div><div style="margin-top:12px">' +
    rows.map((x, i) => '<div class="rm' + (i === 0 && x.lv < 50 ? ' low' : '') + '"><span class="nm">' + esc(x.name) + '</span><div class="bar thin ' + barCls(x.lv) + '"><i style="width:' + Math.round(x.lv) + '%"></i></div><span class="unit">' + Math.round(x.lv) + '%</span></div>').join('') + '</div>' +
    '</div>';
}
function vDashboard() {
  const d = ui.date, r = res.days[d], day = state.logs[d] || {};
  let h = '';
  if (!Object.keys(state.logs).length && !state.welcomed && appMode === 'real') {
    h += '<div class="card" style="margin-bottom:12px"><h2>Welcome</h2><p>Three short check-ins a day (morning, afternoon, night). Good behaviour earns XP and raises skill levels. Bad days cost a little, never as much as good days give.</p><div class="row"><button class="btn pri" data-act="startDemo">Load 90 simulated days</button><button class="btn" data-act="startFresh">Start fresh</button></div></div>';
  }
  for (const a of res.alerts) h += '<div class="note ' + (a.type === 'backfill' ? 'warn' : a.type === 'catchup' ? 'info' : 'good') + '">' + esc(a.text) + (a.date ? ' <button class="btn sm" data-act="goBackfill" data-id="' + a.date + '">Backfill</button>' : '') + '</div>';
  h += vRecs();
  const S = S_(), dt = r ? r.dayType : 'normal';
  const dayBadge = dt === 'rest' ? '<span class="badge rest">rest day</span>' : dt === 'fun' ? '<span class="badge fun">fun day</span>' : dt === 'cheat' ? '<span class="badge fun">cheat evening</span>' : '';
  const modeBadge = r && r.mode !== 'normal' ? '<span class="badge mode">' + esc(r.mode) + ' mode</span>' : '';
  const nextSlot = E.SLOTS.find(s => !(r && r.slots[s].logged)) || null;
  h += '<div class="grid g2">';
  h += '<div class="card"><h2>Needs</h2>' + res.bars.map(b => '<div class="need"><div class="nh"><span>' + esc(b.name) + '</span><b>' + (b.any ? b.pct + '%' : '-') + '</b></div><div class="bar ' + barCls(b.pct) + (b.any ? '' : ' empty') + '"><i style="width:' + (b.any ? b.pct : 0) + '%"></i></div></div>').join('') + '</div>';
  h += '<div class="card"><div class="row sp"><h2 style="margin:0">' + (d === TODAY ? 'Today' : dlabel(d)) + '</h2><div class="row">' + dayBadge + modeBadge + slotDots(d) + '</div></div>';
  h += '<div class="big ' + (dayXp(d) >= 0 ? 'pos' : 'neg') + '">' + sg(dayXp(d)) + ' <small>XP</small></div>';
  h += '<div class="row" style="margin:8px 0 12px"><label class="mu">Priority today</label><select data-in="priority">' + priorityOptions(day.priority) + '</select></div>';
  h += '<button class="btn pri" data-act="openSlot" data-id="' + (nextSlot || 'night') + '">' + (nextSlot ? 'Check in: ' + nextSlot : 'All check-ins done, review night') + '</button></div>';
  h += '</div>';
  h += todoCard();
  h += '<div class="grid g2" style="margin-top:12px">' + roomsCard() + '<div class="card"><h2>Weekly goals</h2>' + (res.weekly.map(w => { const p = Math.min(100, Math.round(w.count / w.goal * 100)); return '<div class="goal"><div class="nh"><span>' + esc(w.name) + '</span><b>' + w.count + ' / ' + w.goal + '</b></div><div class="bar thin ' + (p >= 100 ? 'hi' : p >= 50 ? 'mid' : 'lo') + '"><i style="width:' + p + '%"></i></div></div>'; }).join('') || '<p class="mu">No weekly goals set.</p>') + '</div></div>';
  for (const grp of skillsByGroup()) {
    h += '<div class="sec" style="border-bottom-color:' + gcol(grp.g) + '"><h2 style="color:' + gcol(grp.g) + '">' + esc(grp.g) + '</h2><span class="unit">' + grp.skills.length + ' skills</span></div><div class="grid g3">' + grp.skills.map(s => {
      const k = res.skills[s.id]; if (!k) return ''; const a = r ? r.skills[s.id] : null; const dx = a ? a.gain - a.loss : 0;
      return '<div class="card skill" style="--gc:' + gcol(grp.g) + '"><div class="sh"><div><b>' + esc(s.name) + '</b><small class="' + (k.form >= 1 ? 'up' : 'dn') + '">form ' + k.form.toFixed(2) + 'x</small></div><div class="lv">' + k.level + '</div></div><div class="bar thin sk"><i style="width:' + Math.round(k.pct * 100) + '%"></i></div><div class="sf"><span>' + fmt(k.into) + ' / ' + fmt(k.need) + ' XP</span><span class="' + (dx >= 0 ? 'up' : 'dn') + '">' + sg(dx) + (d === TODAY ? ' today' : '') + '</span></div></div>';
    }).join('') + '</div>';
  }
  h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h2>Milestones in progress</h2>' + questList(true) + '</div>';
  const days30 = lastDays(30);
  h += '<div class="card"><h2>XP per day, last 30 days</h2>' + svgBars(days30.map(x => dayXp(x))) + '</div>';
  const mk = id => { const pts = []; days30.forEach((x, i) => { const v = state.logs[x] && state.logs[x].v ? E.num(state.logs[x].v[id]) : null; pts.push([i, v]); }); return pts; };
  const avg7 = id => { const pts = mk(id); return pts.map((q, i) => { const w = pts.slice(Math.max(0, i - 6), i + 1).map(z => z[1]).filter(z => z != null); return [q[0], w.length ? w.reduce((a, b) => a + b, 0) / w.length : null]; }); };
  h += '<div class="card" style="border-top:3px solid ' + gcol('Lifestyle') + '"><h2>Outfit score (1-10), last 30 days</h2>' + svgLines([{ name: 'Daily score', color: '#7c8591', pts: mk('outfit'), dots: true, w: 1 }, { name: '7-day average', color: gcol('Lifestyle'), pts: avg7('outfit'), w: 2 }], { yMin: 1, yMax: 10 }) + '</div>';
  h += '<div class="card" style="border-top:3px solid ' + gcol('Health') + '"><h2>Mood (1-10), last 30 days</h2>' + svgLines([{ name: 'Daily score', color: '#7c8591', pts: mk('mood'), dots: true, w: 1 }, { name: '7-day average', color: gcol('Health'), pts: avg7('mood'), w: 2 }], { yMin: 1, yMax: 10 }) + '</div>';
  const wts = mk('weight');
  if (wts.some(p => p[1] != null)) h += '<div class="card"><h2>Weight (kg)</h2>' + svgLines([{ color: '#c9a25a', pts: wts }]) + '</div>';
  h += '</div>';
  const keys = Object.keys(state.logs).length;
  if (appMode === 'real' && keys >= 5 && (!state.lastBackup || E.diffDays(TODAY, state.lastBackup) >= 7)) h += '<div class="note warn" style="margin-top:12px">Data lives in this browser only. <button class="btn sm" data-act="export">Download a backup</button></div>';
  return h;
}
function priorityOptions(sel) {
  return '<option value="">None</option>' + cfg().indicators.filter(i => !i.off && !['need', 'weight', 'savings', 'amount', 'foodcost', 'rooms'].includes(i.kind) && !i.modifies).map(i => opt(i.id, i.name, sel)).join('');
}

/* ---------- milestones ---------- */
function condText(c) { const i = indOf(c.ind); const nm = i ? i.name : c.ind; const v = c.val === true ? 'yes' : c.val === false ? 'no' : (c.op === '>=' ? 'at least ' : c.op === '<=' ? 'at most ' : '') + c.val; return nm + ' ' + v; }
function questDesc(c) {
  if (!c) return ''; const m = c.metric || {};
  if (m.type === 'meta') return 'All of: ' + (m.ids || []).map(id => { const x = cfg().quests.find(z => z.id === id); return x ? x.name : id; }).join('; ');
  if (m.type === 'days') { const conds = [m.op ? { ind: m.ind, op: m.op, val: m.val } : null].concat(m.and ? [m.and] : [], m.all || []).filter(Boolean); return conds.length ? 'A day counts when: ' + conds.map(condText).join(' + ') + (m.weekdays ? ' (Mon-Fri)' : '') : ''; }
  return '';
}
function periodLabel(q) { return q.period === 'day' ? 'daily' : q.period === 'week' ? 'weekly' : q.period === 'month' ? 'monthly' : q.period === 'all' ? 'milestone' : q.from + ' to ' + q.to; }
function questRow(q, compact) {
  const p = Math.min(100, Math.round(q.value / q.target * 100));
  return '<div class="quest"><div class="qb"><div class="nh"><span><b>' + esc(q.name) + '</b> <small>' + periodLabel(q) + '</small></span><b>' + (Math.round(q.value * 10) / 10) + ' / ' + q.target + '</b></div><div class="bar thin ' + (q.done ? 'hi' : 'mid') + '"><i style="width:' + p + '%"></i></div><small class="qd">' + esc(questDesc(cfg().quests.find(z => z.id === q.id))) + '</small><small>' + (q.reward ? 'Reward: ' + esc(q.reward) : 'No reward set') + (q.xp ? ' &middot; +' + q.xp + ' XP' : '') + '</small></div>' +
    '<div class="row">' + (q.done && !q.claimed ? '<button class="btn pri sm" data-act="claim" data-id="' + q.id + '">Claim</button>' : q.claimed ? '<span class="badge">claimed</span>' : '') + (compact ? '' : '<button class="btn sm" data-act="editQuest" data-id="' + q.id + '">Edit</button>') + '</div></div>';
}
function questList(compact) {
  let qs = res.quests; if (!qs.length) return '<p class="mu">No milestones yet.</p>';
  if (compact) qs = qs.filter(q => !q.claimed).sort((a, b) => (b.done - a.done) || (b.value / b.target - a.value / a.target)).slice(0, 7);
  return qs.length ? qs.map(q => questRow(q, compact)).join('') : '<p class="mu">Everything claimed.</p>';
}
function vQuests() {
  let h = '<div class="card" style="margin-bottom:12px"><div class="row sp"><h2 style="margin:0">Milestones and rewards</h2><button class="btn pri sm" data-act="newQuest">+ New milestone</button></div></div>';
  for (const grp of skillsByGroup()) {
    const ids = grp.skills.map(s => s.id), qs = res.quests.filter(q => ids.includes(q.skill));
    if (!qs.length) continue;
    h += '<div class="card" style="margin-bottom:12px;border-top:3px solid ' + gcol(grp.g) + '"><h2 style="color:' + gcol(grp.g) + '">' + esc(grp.g) + '</h2>' + qs.map(q => questRow(q, false)).join('') + '</div>';
  }
  const orphan = res.quests.filter(q => !skillOf(q.skill)); if (orphan.length) h += '<div class="card"><h2>Other</h2>' + orphan.map(q => questRow(q, false)).join('') + '</div>';
  return h;
}

/* ---------- check-in ---------- */
function recentLoad(type, date) {
  const ds = Object.keys(state.logs).filter(d => d < date).sort(); const a = [];
  for (const d of ds) { const w = state.logs[d].v && state.logs[d].v.workout; if (w && w.type === type && E.num(w.load) > 0) a.push(Number(w.load)); }
  const l = a.slice(-5); return l.length >= 2 ? l.reduce((x, y) => x + y, 0) / l.length : null;
}
function mealPrompt(v) {
  const S = S_();
  return 'Estimate the calories (kcal) and protein (g) for the food I ate on ' + ui.date + '. Give one total for the day and a short breakdown per meal. My daily targets are about ' + S.kcal + ' kcal and ' + S.protein + ' g protein (' + S.phase + ').\n\nWhat I ate:\n' + (v.meal_text || '(describe your meals here)');
}
function partControl(ind, day) {
  const id = ind.id, slot = slotsOf(ind).includes(ui.slot) ? ui.slot : ind.slot, a = 'data-id="' + id + '" data-slot="' + slot + '"';
  const tgt = ind.kind === 'bar' ? (ind.targetKey ? S_()[ind.targetKey] : ind.target) : ind.target, u = ind.unit || (ind.kind === 'effort' ? 'min' : ''), cur = partVal(day, ind, slot);
  const taps = ind.kind === 'bar' ? (ind.tap ? [-ind.tap, ind.tap, ind.tap * 2] : []) : [15, 30, 45, 60, 90];
  const tot = day.v && day.v[id] != null ? Number(day.v[id]) : 0;
  return taps.map(n => '<button class="chp ' + (n > 0 ? 'on' : '') + '" data-act="addpart" ' + a + ' data-val="' + n + '">' + (n > 0 ? '+' : '') + n + '</button>').join('') +
    '<input type="number" step="' + (ind.step || (ind.kind === 'effort' ? 5 : 1)) + '" ' + a + ' data-in="part" value="' + (cur == null ? '' : cur) + '"><span class="unit">' + esc(u) + '</span>' +
    '<span class="unit ptot">today <b>' + fmt(tot) + '</b> / ' + fmt(tgt) + '</span>';
}
function control(ind, v, day) {
  const id = ind.id, x = v[id], a = 'data-id="' + id + '"';
  if (isPart(ind)) return partControl(ind, day || { v });
  const chips = (vals, cur, fmtf) => vals.map(c => '<button class="chp ' + (String(cur) === String(c) ? 'on' : '') + '" data-act="set" data-num="1" ' + a + ' data-val="' + c + '">' + (fmtf ? fmtf(c) : c) + '</button>').join('');
  const r = res.days[ui.date];
  switch (ind.kind) {
    case 'binary': { if (ind.invert) return '<button class="chp ' + (id in v && !x ? 'on' : '') + '" data-act="setbool" ' + a + ' data-val="false">No</button><button class="chp bad ' + (id in v && x ? 'on' : '') + '" data-act="setbool" ' + a + ' data-val="true">Yes</button>'; const val = id in v ? !!x : ind.defaultVal === true; return '<button class="chp ' + (val ? 'on' : '') + '" data-act="toggle" ' + a + '>' + (ind.defaultVal === true ? (val ? 'Yes' : 'No') : (val ? 'Done' : 'Not yet')) + '</button>'; }
    case 'zone': return (ind.id === 'sleep_dur' ? chips([6, 7, 7.5, 8, 8.5, 9], x) : '') + '<input type="number" step="' + (ind.step || 1) + '" ' + a + ' data-in="num" value="' + (x == null ? '' : x) + '"><span class="unit">' + esc(ind.unit || '') + '</span>';
    case 'ceil': return chips([0, 10, 20, 40, 60], x, c => c) + '<input type="number" step="' + (ind.step || 1) + '" ' + a + ' data-in="num" value="' + (x == null ? '' : x) + '"><span class="unit">' + esc(ind.unit || '') + '</span>';
    case 'bar': { const tgt = ind.targetKey ? S_()[ind.targetKey] : ind.target; return (ind.tap ? '<button class="chp" data-act="add" ' + a + ' data-val="-' + ind.tap + '">-' + ind.tap + '</button><button class="chp on" data-act="add" ' + a + ' data-val="' + ind.tap + '">+' + ind.tap + '</button>' : '') + '<input type="number" step="' + (ind.step || 1) + '" ' + a + ' data-in="num" value="' + (x == null ? '' : x) + '"><span class="unit">/ ' + fmt(tgt) + ' ' + esc(ind.unit || '') + '</span>'; }
    case 'time': return ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'].map(c => '<button class="chp ' + (x === c ? 'on' : '') + '" data-act="set" ' + a + ' data-val="' + c + '">' + c + '</button>').join('') + '<input type="text" inputmode="numeric" autocomplete="off" class="tin" ' + a + ' data-in="time" placeholder="10:30" value="' + (x || '') + '"><span class="unit">type 1030 or 10:30, then Enter</span>';
    case 'tier': {
      let h = ind.options.map(o => '<button class="chp ' + (o.s < 0 ? 'bad ' : '') + (x === o.id ? 'on' : '') + '" data-act="set" ' + a + ' data-val="' + o.id + '">' + esc(o.label) + '</button>').join('');
      if (ind.cost && x) h += '<div class="sub"><span class="unit">cost</span>' + E.COSTS.map(c => '<button class="chp ' + (v[id + '_cost'] === c.id ? 'on' : '') + '" data-act="setc" ' + a + ' data-val="' + c.id + '">' + esc(c.label) + '</button>').join('') + '</div>';
      return h;
    }
    case 'effort': return chips([0, 15, 30, 45, 60, 90, 120, 180], x) + '<input type="number" step="5" ' + a + ' data-in="num" value="' + (x == null ? '' : x) + '"><span class="unit">min, target ' + ind.target + (ind.everyN > 1 ? ' every ' + ind.everyN + ' days' : '') + '</span>';
    case 'workout': {
      const w = x || null, type = w ? w.type : null, T = E.WORKOUT_TYPES.find(t => t.id === type);
      let h = '<button class="chp ' + (!w ? 'on' : '') + '" data-act="wnone">Rest / none</button>' + E.WORKOUT_TYPES.map(t => '<button class="chp ' + (type === t.id ? 'on' : '') + '" data-act="wtype" data-val="' + t.id + '">' + esc(t.label) + '</button>').join('');
      if (w) { const rl = recentLoad(type, ui.date); h += '<div class="sub"><input type="number" data-in="wmin" value="' + (w.min == null ? '' : w.min) + '"><span class="unit">min</span>' + (T && T.loadLabel ? '<input type="number" data-in="wload" value="' + (w.load == null ? '' : w.load) + '" placeholder="load"><span class="unit">' + esc(T.loadLabel) + (rl ? ', recent avg ' + fmt(rl) : '') + '</span>' : '') + (type === 'gym' ? '<input type="number" step="2.5" data-in="wsquat" value="' + (w.squat == null ? '' : w.squat) + '" placeholder="squat"><span class="unit">top squat (kg), optional</span>' : '') + '</div>'; }
      return h;
    }
    case 'count': return '<button class="chp" data-act="add" ' + a + ' data-val="-1">-</button><b style="min-width:2ch;text-align:center">' + (E.num(x) || 0) + '</b><button class="chp on" data-act="add" ' + a + ' data-val="1">+1</button>';
    case 'rating': return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => '<button class="chp r ' + (Number(x) === c ? 'on' : '') + '" data-act="set" data-num="1" ' + a + ' data-val="' + c + '">' + c + '</button>').join('');
    case 'need': { const cur = Array.isArray(x) ? x : []; const L = r && r.need ? r.need[id] : null; return ind.events.map(e => '<button class="chp ' + (cur.includes(e.id) ? 'on' : '') + '" data-act="ev" ' + a + ' data-val="' + e.id + '">' + esc(e.label) + ' <small>+' + e.fill + '</small></button>').join('') + (L != null ? '<span class="unit">bar ' + Math.round(L) + '%</span>' : ''); }
    case 'rooms': {
      const cur = Array.isArray(x) ? x : []; const rd = r && r.rooms && r.rooms[id];
      return ind.tasks.map(t => '<button class="chp ' + (cur.includes(t.id) ? 'on' : '') + '" data-act="ev" ' + a + ' data-val="' + t.id + '">' + esc(t.label) + '</button>').join('') +
        (rd ? '<div class="sub unit">' + ind.rooms.map(rm => esc(rm.name) + ' ' + Math.round(rd.rooms[rm.id])).join(' | ') + ' | total ' + Math.round(rd.total) + '%</div>' : '');
    }
    case 'cashflow': return chips([0, 10, 20, 40], v.spent, c => c).replace(/data-id="cashflow"/g, 'data-id="spent"') + '<span class="unit">spent</span><input type="number" step="1" data-id="spent" data-in="num" value="' + (v.spent == null ? '' : v.spent) + '"><span class="unit">earned or saved</span><input type="number" step="1" data-id="earned" data-in="num" value="' + (v.earned == null ? '' : v.earned) + '">';
    case 'foodcost': return '<span class="unit">' + (r && r.foodEur ? 'Estimated food spend EUR ' + Math.round(r.foodEur) : 'Set a cost tag on each meal') + '</span>';
    case 'macros': {
      const m = x || {};
      return '<div class="full"><textarea data-in="str" data-id="meal_text" placeholder="Describe what you ate today, for example: 3 eggs, 2 slices of bread, chicken rice bowl, 30 g whey.">' + esc(v.meal_text || '') + '</textarea></div>' +
        '<div class="full"><button class="chp" data-act="dictate">Dictate</button><button class="chp" data-act="copyPrompt">Copy prompt for Claude</button><span class="unit">Paste the prompt into Claude, then enter its estimate below.</span></div>' +
        '<input type="number" data-in="mac" data-k="kcal" value="' + (m.kcal == null ? '' : m.kcal) + '" placeholder="kcal"><span class="unit">kcal (about ' + fmt(S_().kcal) + ')</span><input type="number" data-in="mac" data-k="protein" value="' + (m.protein == null ? '' : m.protein) + '" placeholder="protein"><span class="unit">g protein (at least ' + S_().protein + ')</span>';
    }
    case 'amount': case 'weight': return '<input type="number" step="' + (ind.step || 1) + '" ' + a + ' data-in="num" value="' + (x == null ? '' : x) + '"><span class="unit">' + esc(ind.unit || '') + '</span>';
    case 'savings': { const ym = E.monthOf(ui.date), m = state.months[ym] || {}; const rate = E.num(m.net) > 0 && E.num(m.saved) != null ? Math.round(m.saved / m.net * 100) + '%' : ''; return '<span class="unit">' + ym + ' net income EUR</span><input type="number" data-in="month" data-k="net" value="' + (m.net == null ? '' : m.net) + '"><span class="unit">saved EUR</span><input type="number" data-in="month" data-k="saved" value="' + (m.saved == null ? '' : m.saved) + '"><b>' + rate + '</b>'; }
    default: return '';
  }
}
const ctlFor = (ind, v, day) => control(ind, v, day);
function actValue(ind, v) {
  const x = v[ind.id];
  if (ind.kind === 'workout') return x ? ((E.WORKOUT_TYPES.find(t => t.id === x.type) || {}).label || x.type || 'done') + (x.min ? ' ' + x.min : '') : '';
  if (ind.kind === 'count') return E.num(x) > 0 ? String(E.num(x)) : '';
  return E.num(x) > 0 ? String(E.num(x)) : '';
}
function actCard(cat, members, v, day) {
  const open = ui.actOpen === cat.id;
  const sel = members.find(i => i.id === ui.actSel[cat.id]) || members.find(i => actValue(i, v)) || members[0];
  const done = members.map(i => { const t = actValue(i, v); return t ? shortName(i) + ' ' + t : ''; }).filter(Boolean);
  let h = '<div class="act' + (open ? ' open' : '') + (done.length ? ' has' : '') + '" style="--gc:' + scol(members[0].skill) + '"><button class="actb" data-act="actopen" data-id="' + cat.id + '"><b>' + esc(cat.label) + '</b><span class="unit">' + (done.length ? esc(done.join(', ')) : 'nothing yet') + '</span><i class="car"></i></button>';
  if (open) {
    const wk = res.weekly.find(w => w.id === sel.id);
    h += '<div class="actp">' + (members.length > 1 ? '<select data-in="actsel" data-cat="' + cat.id + '">' + members.map(i => opt(i.id, shortName(i), sel.id)).join('') + '</select>' : '<b>' + esc(shortName(sel)) + '</b>') +
      '<div class="ctl">' + ctlFor(sel, v, day) + (wk ? '<span class="unit">week ' + wk.count + ' / ' + wk.goal + '</span>' : '') + '</div></div>';
  }
  return h + '</div>';
}
function binRow(list, v) {
  const on = i => (i.id in v) && !!v[i.id];
  return '<div class="ind chips"><div class="ctl">' + list.map(i => '<button class="chp ' + (on(i) ? 'on' : '') + '" data-act="toggle" data-id="' + i.id + '">' + esc(shortName(i)) + '</button>').join('') +
    (list.length > 3 ? '<button class="chp" data-act="allon" data-ids="' + list.map(i => i.id).join(',') + '">' + (list.every(on) ? 'None' : 'All') + '</button>' : '') + '</div></div>';
}
function vCheckin() {
  const d = ui.date, day = state.logs[d] || { v: {}, slots: {} }, v = day.v || {}, r = res.days[d], S = S_();
  const late = E.diffDays(TODAY, d);
  let h = '';
  if (late > 0) h += '<div class="note warn">Logging <b>' + late + '</b> day' + (late > 1 ? 's' : '') + ' late: positive XP x' + E.backfillFactor(late, S) + ' (penalties are never discounted).</div>';
  h += '<div class="slots">' + E.SLOTS.map(s => { const sl = day.slots && day.slots[s]; return '<button class="' + (ui.slot === s ? 'on' : '') + '" style="--sc:' + SCOL[s] + '" data-act="slot" data-id="' + s + '">' + cap(s) + ' <small>' + (sl ? 'logged' : 'open') + '</small></button>'; }).join('') + '<button class="' + (ui.slot === 'total' ? 'on' : '') + '" style="--sc:#8a929e" data-act="slot" data-id="total">Day total <small>' + (res.days[d] ? sg(dayXp(d)) + ' XP' : '-') + '</small></button></div>';
  if (ui.slot === 'total') return h + vTotal(d, day, v, r);
  h += '<div class="slotpane" style="--sc:' + SCOL[ui.slot] + '"><div class="slotlabel">' + cap(ui.slot) + ' check-in &middot; ' + dlabel(d) + '</div>';
  if (ui.slot === 'morning') {
    const modes = ['normal', 'sick', 'travel', 'holiday'], md = day.mode || 'normal';
    h += '<details class="card ds"' + (md !== 'normal' || day.token ? ' open' : '') + '><summary>Day settings &middot; ' + cap(md) + (day.token ? ', life token' : '') + '</summary><div class="row" style="margin-top:8px">' +
      '<label class="mu">Mode</label><select data-in="mode">' + modes.map(m => opt(m, cap(m), md)).join('') + '</select>' +
      '<label class="mu"><input type="checkbox" data-in="token"' + (day.token ? ' checked' : '') + (!day.token && res.tokens.left === 0 ? ' disabled' : '') + '> life token (' + res.tokens.left + ' left)</label></div>' +
      '<div class="row" style="margin-top:8px"><span class="mu">Set mode for the next</span><input type="number" id="mrN" value="3" min="1" max="60" style="width:64px"><span class="mu">days:</span><select id="mrM"><option>sick</option><option>travel</option><option>holiday</option><option>normal</option></select><button class="btn sm" data-act="modeRange">Apply</button></div></details>';
  }
  const inds = cfg().indicators.filter(i => !i.off && shownIn(i, ui.slot)), groups = {};
  inds.forEach(i => (groups[i.skill] = groups[i.skill] || []).push(i));
  // activity buttons (night): fitness / study / career, each with a dropdown
  const catOf = {}; if (ui.slot === 'night') ACT_CATS.forEach(c => c.skills.forEach(sk => { catOf[sk] = c; }));
  const catMembers = {}; inds.forEach(i => { const c = catOf[i.skill]; if (c && i.kind !== 'binary') (catMembers[c.id] = catMembers[c.id] || []).push(i); });
  const acts = ACT_CATS.filter(c => catMembers[c.id]).map(c => actCard(c, catMembers[c.id], v, day)).join('');
  if (acts) h += '<div class="grp"><h3>Activities</h3>' + acts + '</div>';
  const order = skillsByGroup().flatMap(x => x.skills.map(s => s.id)).concat(Object.keys(groups).filter(k => !skillOf(k)));
  for (const sid of order) {
    if (!groups[sid]) continue; const sk = skillOf(sid) || { name: 'Other' };
    const list = groups[sid].filter(i => !(catOf[sid] && i.kind !== 'binary'));
    if (!list.length) continue;
    const bins = list.filter(i => i.kind === 'binary' && !i.invert && i.defaultVal !== true), rest = list.filter(i => !bins.includes(i));
    let inner = bins.length ? binRow(bins, v) : '';
    inner += rest.map(ind => {
      const o = r && r.inds[ind.id], logged = day.slots && slotsOf(ind).some(s => day.slots[s]);
      const badge = o && logged ? (Math.abs(o.xp) < 0.5 ? '<span class="xp z">0</span>' : '<span class="xp ' + (o.xp > 0 ? 'p' : 'n') + '" title="' + esc(o.note) + '">' + sg(o.xp) + '</span>') : '';
      return '<div class="ind" style="--gc:' + scol(ind.skill) + '"><div class="il"><b title="' + esc(ind.hint || '') + '">' + esc(ind.name) + '</b></div><div class="ctl">' + control(ind, v, day) + badge + '</div></div>';
    }).join('');
    h += '<div class="grp"><h3 style="color:' + scol(sid) + '">' + esc(sk.name) + '</h3>' + inner + '</div>';
  }
  if (!inds.length) h += '<p class="mu">Nothing to log in this check-in.</p>';
  if (ui.slot === 'night') h += '<div class="grp"><h3>Day note</h3><div class="ind"><div class="ctl" style="flex-basis:100%"><div class="full"><textarea data-in="note" placeholder="Optional note about today.">' + esc(day.note || '') + '</textarea></div></div></div></div>';
  h += '</div>';
  const logged = day.slots && day.slots[ui.slot];
  h += '<div class="row savebar" style="margin-top:10px"><button class="btn pri" data-act="saveSlot">' + (logged ? 'Update ' : 'Save ') + ui.slot + ' check-in</button>' + (logged ? '<button class="btn sm" data-act="clearSlot">Clear</button>' : '') + '</div>';
  return h;
}

function valText(ind, v, r) {
  const x = v[ind.id], o = r && r.inds[ind.id];
  if (ind.kind === 'cashflow') return (v.spent == null && v.earned == null) ? '-' : 'spent ' + (v.spent || 0) + ', earned ' + (v.earned || 0);
  if (ind.kind === 'macros') return x ? (x.kcal || '?') + ' kcal, ' + (x.protein || '?') + ' g protein' : '-';
  if (ind.kind === 'rooms' || ind.kind === 'need') return Array.isArray(x) && x.length ? x.length + ' done' : '-';
  if (ind.kind === 'workout') return x ? (x.type || '') + ' ' + (x.min || '') + ' min' : 'rest';
  if (ind.kind === 'tier') { const op = (ind.options || []).find(p => p.id === x); return op ? op.label : '-'; }
  if (ind.kind === 'binary') return !(ind.id in v) ? '-' : x ? 'yes' : 'no';
  if (ind.kind === 'savings' || ind.kind === 'foodcost') return o && o.note ? o.note : '-';
  return x == null || x === '' ? '-' : String(x) + (ind.unit ? ' ' + ind.unit : '');
}
function vTotal(d, day, v, r) {
  let h = '<div class="card" style="margin-bottom:12px"><h2>Day total &middot; ' + dlabel(d) + '</h2>';
  const parts = cfg().indicators.filter(i => !i.off && isPart(i));
  h += '<div class="scroll"><table class="tt"><thead><tr><th>Added up over the day</th>' + E.SLOTS.map(s => '<th style="color:' + SCOL[s] + '">' + ({ morning: 'Morn', afternoon: 'Aft', night: 'Night' })[s] + '</th>').join('') + '<th>Total / target</th><th>XP</th></tr></thead><tbody>' +
    parts.map(i => {
      const tgt = i.kind === 'bar' ? (i.targetKey ? S_()[i.targetKey] : i.target) : i.target, tot = v[i.id] != null ? Number(v[i.id]) : 0, o = r && r.inds[i.id];
      return '<tr style="--gc:' + scol(i.skill) + '"><td class="nm2">' + esc(i.name) + '</td>' + E.SLOTS.map(s => slotsOf(i).includes(s) ? '<td><input type="number" step="' + (i.step || (i.kind === 'effort' ? 5 : 1)) + '" data-in="part" data-id="' + i.id + '" data-slot="' + s + '" value="' + (partVal(day, i, s) == null ? '' : partVal(day, i, s)) + '"></td>' : '<td class="mu">-</td>').join('') +
        '<td><b class="' + (tot >= tgt ? 'up' : '') + '">' + fmt(tot) + '</b> <small>/ ' + fmt(tgt) + ' ' + esc(i.unit || (i.kind === 'effort' ? 'min' : '')) + '</small></td><td class="' + (o && o.xp < 0 ? 'dn' : 'up') + '">' + (o ? sg(o.xp) : '-') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
  const rest = cfg().indicators.filter(i => !i.off && !isPart(i) && !['macros'].includes(i.kind) || (i.kind === 'macros' && !i.off));
  h += '<div class="card"><h2>Everything today</h2><div class="scroll"><table class="tt"><thead><tr><th>Indicator</th><th>Value</th><th>XP</th><th></th></tr></thead><tbody>' +
    rest.filter(i => !isPart(i)).map(i => { const o = r && r.inds[i.id]; return '<tr style="--gc:' + scol(i.skill) + '"><td class="nm2">' + esc(i.name) + ' <small>' + esc(slotsOf(i).map(s => s.slice(0, 3)).join('/')) + '</small></td><td>' + esc(valText(i, v, r)) + '</td><td class="' + (o && o.xp < 0 ? 'dn' : 'up') + '">' + (o && Math.abs(o.xp) >= 0.5 ? sg(o.xp) : '-') + '</td><td><button class="btn sm" data-act="openSlot" data-id="' + i.slot + '">Edit</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
  h += '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="saveDay">Save all check-ins for this day</button></div>';
  return h;
}

/* ---------- to-dos ---------- */
const TODO_SIZES = [{ id: 'quick', label: 'Quick (5 min)', xp: 15 }, { id: 'normal', label: 'Normal (an hour)', xp: 40 }, { id: 'big', label: 'Big (half a day+)', xp: 100 }];
const todoXp = t => (TODO_SIZES.find(s => s.id === t.size) || TODO_SIZES[1]).xp;
const todoSort = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.created || '').localeCompare(b.created || '');
function todoRow(t) {
  const sk = skillOf(t.skill) || { name: '?' }, late = t.due && t.due < TODAY, soon = t.due && !late && E.diffDays(t.due, TODAY) <= 2;
  return '<div class="todo' + (t.done ? ' done' : '') + '" style="--gc:' + scol(t.skill) + '">' +
    (t.done ? '<button class="chp on" data-act="undoTodo" data-id="' + t.id + '" title="Mark as not done">Undo</button>' : '<button class="chp pri2" data-act="doneTodo" data-id="' + t.id + '">Done</button>') +
    '<div class="tdx"><div class="tdt">' + esc(t.text) + '</div><div class="tdm"><span class="tag">' + esc(sk.name) + '</span> <span>+' + todoXp(t) + ' XP</span>' + (t.due ? ' <span class="' + (late && !t.done ? 'dn' : soon && !t.done ? 'warnc' : '') + '">' + (t.done ? '' : late ? 'overdue, ' : 'due ') + dlabel(t.due) + '</span>' : '') + (t.reward ? ' <span>Reward: ' + esc(t.reward) + '</span>' : '') + (t.done ? ' <span>done ' + dlabel(t.done) + '</span>' : '') + '</div></div>' +
    '<button class="btn sm danger" data-act="delTodo" data-id="' + t.id + '" aria-label="Delete">x</button></div>';
}
function vTodos() {
  const open = state.todos.filter(t => !t.done).sort(todoSort), done = state.todos.filter(t => t.done).sort((a, b) => b.done.localeCompare(a.done));
  const weekAgo = E.addDays(TODAY, -6), wkDone = done.filter(t => t.done >= weekAgo).length, wkXp = done.filter(t => t.done >= weekAgo).reduce((x, t) => x + todoXp(t), 0);
  let h = '<div class="card">' + momentumBar(TODAY) + '</div><div class="card" style="margin-top:12px"><h2>Add a to-do</h2><div class="fld">' +
    '<label>What</label><input type="text" id="tdText" placeholder="Repot the plant, buy train tickets, visit grandma" maxlength="140">' +
    '<label>Skill that gets the XP</label><select id="tdSkill">' + skillsByGroup().map(g => '<optgroup label="' + esc(g.g) + '">' + g.skills.map(s => opt(s.id, s.name, 'household')).join('') + '</optgroup>').join('') + '</select>' +
    '<label>Size</label><select id="tdSize">' + TODO_SIZES.map(s => opt(s.id, s.label + ', +' + s.xp + ' XP', 'normal')).join('') + '</select>' +
    '<label>Due (optional)</label><input type="date" id="tdDue" min="' + TODAY + '">' +
    '<label>Reward (optional)</label><input type="text" id="tdReward" placeholder="A coffee out, an hour of games" maxlength="80"></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="addTodo">Add to-do</button></div></div>';
  h += '<div class="card" style="margin-top:12px"><div class="row sp"><h2 style="margin:0">Open &middot; ' + open.length + '</h2><span class="unit">last 7 days: ' + wkDone + ' done, +' + wkXp + ' XP</span></div><div style="margin-top:10px">' + (open.length ? open.map(todoRow).join('') : '<p class="mu">Nothing open. Add whatever is on your mind.</p>') + '</div></div>';
  if (done.length) h += '<details class="card" style="margin-top:12px"' + (open.length ? '' : ' open') + '><summary>Done &middot; ' + done.length + '</summary><div style="margin-top:10px">' + done.slice(0, 25).map(todoRow).join('') + (done.length > 25 ? '<p class="hint">Showing the latest 25.</p>' : '') + '</div></details>';
  return h;
}
function momentumBar(d) {
  const r = res.days[d], n = r ? r.todosDone : 0, m = r ? r.momentum : 0, tiers = E.MOMENTUM || [0, 0.1, 0.18, 0.25], nxt = n < tiers.length - 1 ? tiers[n + 1] : null;
  return '<div class="mom"><div class="momh"><b>Momentum ' + (m ? '+' + Math.round(m * 100) + '%' : 'off') + '</b><span>' + n + ' to-do' + (n === 1 ? '' : 's') + ' done ' + (d === TODAY ? 'today' : 'that day') + '</span></div><div class="momt">' + tiers.slice(1).map((x, i) => '<i class="' + (n >= i + 1 ? 'on' : '') + '"><b>' + (i + 1 === tiers.length - 1 ? (i + 1) + '+' : i + 1) + '</b>+' + Math.round(x * 100) + '%</i>').join('') + '</div></div>';
}
function todoCard() {
  const open = state.todos.filter(t => !t.done).sort(todoSort); if (!open.length) return '<div class="card" style="margin-top:12px">' + momentumBar(TODAY) + '<div class="row sp" style="margin-top:10px"><h2 style="margin:0">To-dos</h2><button class="btn sm" data-act="tab" data-id="todos">Add one</button></div></div>';
  const late = open.filter(t => t.due && t.due < TODAY).length;
  return '<div class="card" style="margin-top:12px">' + momentumBar(TODAY) + '<div class="row sp" style="margin-top:10px"><h2 style="margin:0">To-dos &middot; ' + open.length + ' open' + (late ? ', <span class="dn">' + late + ' overdue</span>' : '') + '</h2><button class="btn sm" data-act="tab" data-id="todos">Open list</button></div><div style="margin-top:10px">' + open.slice(0, 4).map(todoRow).join('') + '</div></div>';
}

/* ---------- skills ---------- */
function fedBy(s) {
  const S = S_(), names = cfg().indicators.filter(i => i.skill === s.id && !i.off).map(i => i.name);
  let t = names.join(', ');
  if (s.id === 'awareness') t = 'Logging check-ins: +' + S.slotLogXp + ' XP for each check-in saved (full XP within 48 h), and -' + (S.assumedBad * S.slotLogXp).toFixed(0) + ' XP for each past check-in left empty. It rewards honest tracking, not good behaviour.' + (names.length ? ' Also: ' + t + '.' : '');
  if (s.id === 'hygiene') t += '. Teeth and showering are tracked here.';
  return t || 'No indicators yet. Add one in Settings.';
}
function nextMilestone(s) {
  const mine = q => { const m = (cfg().quests.find(x => x.id === q.id) || {}).metric || {}; const ind = m.ind ? indOf(m.ind) : null; return q.skill === s.id || (ind && ind.skill === s.id) || (m.type === 'level' && m.skill === s.id); };
  const c = (res.quests || []).filter(q => q.period !== 'day' && !q.claimed && mine(q) && q.mtype !== 'meta');
  c.sort((a, b) => (b.done - a.done) || ((b.value / (b.target || 1)) - (a.value / (a.target || 1))));
  return c[0] || null;
}
function skillCard(s, r) {
  const k = res.skills[s.id]; if (!k) return '';
  const a = r ? r.skills[s.id] : null, dx = a ? a.gain - a.loss : 0, lo = k.cur, hi = k.next, pct = hi ? Math.max(0, Math.min(100, (k.xp - lo) / (hi - lo) * 100)) : 100;
  const q = nextMilestone(s), qp = q ? Math.max(0, Math.min(100, q.value / (q.target || 1) * 100)) : 0;
  const lw = k.lastWeekR == null ? 0 : Math.round(k.lastWeekR * 100);
  return '<div class="sk" style="--gc:' + gcol(s.group) + '"><div class="skh"><span class="skn">' + esc(s.name) + '</span><span class="skl"><small>LV</small> ' + k.level + '</span></div>' +
    '<div class="xpbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    '<div class="xpt"><span>' + fmt(k.xp - lo) + ' / ' + (hi ? fmt(hi - lo) : 'max') + ' XP</span><span>' + (hi ? fmt(hi - k.xp) + ' to level ' + (k.level + 1) : 'max level') + '</span></div>' +
    '<div class="skstats"><span>Form <b class="' + (k.form >= 1 ? 'up' : 'dn') + '">' + k.form.toFixed(2) + 'x</b></span><span>Last week <b>' + (k.lastWeekR == null ? '-' : lw + '%') + '</b></span><span>Good weeks <b>' + k.weekStreak + '</b></span><span>' + (ui.date === TODAY ? 'Today' : dlabel(ui.date)) + ' <b class="' + (dx >= 0 ? 'up' : 'dn') + '">' + sg(dx) + '</b></span></div>' +
    (q ? '<div class="nxt"><div class="nmh"><small>NEXT MILESTONE</small>' + (q.done ? '<button class="btn pri sm" data-act="claim" data-id="' + q.id + '">Done, claim</button>' : '') + '</div><div class="nmn">' + esc(q.name) + '</div><div class="xpbar thin"><i style="width:' + qp.toFixed(0) + '%"></i></div><div class="xpt"><span>' + Math.round(Math.min(q.value, q.done ? q.target : q.value) * 10) / 10 + ' / ' + q.target + '</span><span>' + (q.reward ? 'Reward: ' + esc(q.reward) : 'no reward set') + '</span></div></div>'
      : '<div class="nxt"><small>NEXT MILESTONE</small><div class="xpt"><span>none yet</span><button class="btn sm" data-act="newQuestFor" data-id="' + s.id + '">+ Milestone</button></div></div>') +
    '<details><summary>Fed by</summary><p class="hint">' + esc(fedBy(s)) + '</p></details></div>';
}
function vSkills() {
  const d = ui.date, r = res.days[d];
  let h = '';
  for (const grp of skillsByGroup()) h += '<div class="gh2" style="--gc:' + gcol(grp.g) + '">' + esc(grp.g) + '</div><div class="skgrid">' + grp.skills.map(s => skillCard(s, r)).join('') + '</div>';
  h += '<div class="card" style="margin-top:12px"><h2>Why did I get this XP? &middot; ' + dlabel(d) + '</h2>';
  if (!r) h += '<p class="mu">Nothing recorded for this date.</p>';
  else {
    if (r.priority) h += '<div class="note good">Priority bonus +' + Math.round(r.priority.bonus) + ' XP on ' + esc((indOf(r.priority.id) || {}).name) + '</div>';
    if (r.catchUp) h += '<div class="note info">Catch-up complete: ' + r.catchUp.days.map(dlabel).join(' and ') + ' penalties cancelled.</div>';
    for (const s of cfg().skills) {
      const rows = cfg().indicators.filter(i => i.skill === s.id && r.inds[i.id] && (r.inds[i.id].xp !== 0 || ['miss', 'unlogged', 'blank'].includes(r.inds[i.id].state)));
      const a = r.skills[s.id]; if (!rows.length && !a.cons && !a.flat && !(s.id === 'awareness' && (a.pos || a.neg))) continue;
      h += '<div class="grp"><h3>' + esc(s.name) + ' <span class="state">form ' + a.form.toFixed(2) + 'x, net ' + sg(a.gain - a.loss) + '</span></h3><table><tbody>' + rows.map(i => { const o = r.inds[i.id]; return '<tr><td>' + esc(i.name) + '<span class="state">' + (STATE_LABEL[o.state] || '') + (o.note ? ', ' + esc(o.note) : '') + '</span></td><td class="' + (o.xp >= 0 ? 'pos' : 'neg') + '">' + sg(o.xp) + '</td></tr>'; }).join('') +
        (s.id === 'awareness' ? '<tr><td>Check-in logging<span class="state">+' + S_().slotLogXp + ' per saved check-in, small penalty for skipped ones</span></td><td class="' + (a.pos + a.neg >= 0 ? 'pos' : 'neg') + '">' + sg(a.pos + a.neg) + '</td></tr>' : '') +
        (a.cons ? '<tr><td>Weekly consistency bonus</td><td class="pos">+' + Math.round(a.cons) + '</td></tr>' : '') + (a.flat ? '<tr><td>Milestone bonus</td><td class="pos">+' + Math.round(a.flat) + '</td></tr>' : '') + (a.loss < -a.neg - 0.5 ? '<tr><td>Loss cap applied<span class="state">penalties are limited to a third of a level per week</span></td><td class="mu">' + sg(-a.loss) + '</td></tr>' : '') + '</tbody></table></div>';
    }
  }
  return h + '</div>';
}

/* ---------- simulate ---------- */
function totalLevelSeries(rs) { const ids = Object.keys(rs.skills), n = rs.skills[ids[0]].series.length, out = []; for (let t = 0; t < n; t++) out.push([t, ids.reduce((x, id) => x + rs.skills[id].series[t].level, 0)]); return out; }
const PCOL = { consistent: '#6fae7e', chaotic: '#c97a7a', burnout: '#c9a25a', ghost: '#a595c4', casual: '#7aa7d9' };
function vSim() {
  let h = '<div class="card"><h2>Simulate</h2><p class="mu">Runs fake people through the real scoring engine so you can see how levelling, penalties and form behave. Nothing here touches your own data.</p><div class="grid g3">' +
    Object.entries(E.PERSONAS).map(([id, p]) => '<button class="persona ' + (ui.simPersona === id ? 'on' : '') + '" data-act="simp" data-id="' + id + '"><b>' + esc(p.label) + '</b><small>' + esc(p.desc) + '</small></button>').join('') + '</div>' +
    '<div class="row" style="margin-top:12px"><label class="mu">Days</label><select data-in="simdays">' + [30, 90, 180, 365, 730].map(n => opt(n, n + ' days', ui.simDays)).join('') + '</select><button class="btn pri" data-act="runSim">Run simulation</button><button class="btn" data-act="runAll">Compare all personas</button><button class="btn" data-act="loadDemo">Load as demo data in the dashboard</button></div></div>';
  if (ui.simAll) {
    const a = ui.simAll;
    h += '<div class="card" style="margin-top:12px"><h2>All personas, total level over ' + a.days + ' days</h2>' + svgLines(a.outs.map(o => ({ name: E.PERSONAS[o.id].label, color: PCOL[o.id], pts: totalLevelSeries(o.out.res) })), { h: 180 }) +
      '<div class="scroll"><table style="margin-top:8px"><thead><tr><th>Persona</th><th>Total level</th><th>Total XP</th><th>XP / day / skill</th></tr></thead><tbody>' + a.outs.map(o => '<tr><td>' + esc(E.PERSONAS[o.id].label) + '</td><td class="lvl">' + o.out.res.totalLevel + '</td><td>' + fmt(o.out.res.totalXp) + '</td><td>' + fmt(o.out.res.totalXp / a.days / cfg().skills.length) + '</td></tr>').join('') + '</tbody></table></div></div>';
  }
  if (ui.sim) {
    const s = ui.sim, rs = s.out.res, cols = E.SNAP_DAYS.filter(x => x <= s.days);
    h += '<div class="card" style="margin-top:12px"><h2>' + esc(E.PERSONAS[s.persona].label) + ', levels over time</h2><div class="scroll"><table><thead><tr><th>Skill</th>' + cols.map(c => '<th>day ' + c + '</th>').join('') + '<th>final XP</th><th>form</th></tr></thead><tbody>' +
      cfg().skills.map(sk => rs.skills[sk.id] ? '<tr><td>' + esc(sk.name) + '</td>' + cols.map(c => '<td class="lvl">' + s.out.snap[sk.id][c] + '</td>').join('') + '<td>' + fmt(rs.skills[sk.id].xp) + '</td><td>' + rs.skills[sk.id].form.toFixed(2) + 'x</td></tr>' : '').join('') + '</tbody></table></div>' +
      '<h2 style="margin-top:14px">Total level over time</h2>' + svgLines([{ color: PCOL[s.persona], pts: totalLevelSeries(rs) }]) + '</div>';
  }
  return h;
}
function runOne(pid, n) { return E.runSim(pid, n, { start: '2026-01-05', seed: 7 }); }

/* ---------- settings ---------- */
function numField(label, path, val, step) { return '<label>' + label + '</label><input type="number" step="' + (step || 1) + '" data-in="cfg" data-path="' + path + '" data-type="num" value="' + val + '">'; }
const fmtFill = (tk, home) => Object.entries(tk.fill).map(([k, n]) => k + ':' + n).join(', ');
function householdCard() {
  const home = homeInd(); if (!home) return '';
  return '<div class="card" style="margin-top:12px"><div class="row sp"><h2 style="margin:0">Household rooms and tasks</h2><div class="row"><button class="btn sm" data-act="newRoom">+ Room</button><button class="btn sm" data-act="newTask">+ Task</button></div></div>' +
    '<p class="hint">Each room says how often it needs cleaning: after that many days it sits at 50% (the "needs attention" point). Weight says how much it counts in the household bar. A task adds its fill points to the rooms it lists (format room:points). Bigger XP pays for bigger jobs. The roll-up is a weighted harmonic mean, so a neglected heavy room (bathroom) drags the total down most.</p>' +
    '<div class="scroll"><table><thead><tr><th>Room</th><th>Needs cleaning every (days)</th><th>Weight</th><th></th></tr></thead><tbody>' + home.rooms.map(r => '<tr><td><input type="text" data-in="room" data-id="' + r.id + '" data-k="name" value="' + esc(r.name) + '"></td><td><input type="number" step="1" min="1" data-in="room" data-id="' + r.id + '" data-k="days" value="' + Math.round(50 / r.decay) + '"></td><td><input type="number" step="0.5" min="0.5" data-in="room" data-id="' + r.id + '" data-k="w" value="' + (r.w || 1) + '"></td><td><button class="btn sm danger" data-act="delRoom" data-id="' + r.id + '">Remove</button></td></tr>').join('') + '</tbody></table></div>' +
    '<div class="scroll" style="margin-top:10px"><table><thead><tr><th>Task</th><th>XP</th><th>Fills (room:points)</th><th></th></tr></thead><tbody>' + home.tasks.map(t => '<tr><td><input type="text" data-in="task" data-id="' + t.id + '" data-k="label" value="' + esc(t.label) + '"></td><td><input type="number" data-in="task" data-id="' + t.id + '" data-k="xp" value="' + t.xp + '"></td><td><input type="text" style="width:260px" data-in="taskfill" data-id="' + t.id + '" value="' + esc(fmtFill(t, home)) + '"></td><td><button class="btn sm danger" data-act="delTask" data-id="' + t.id + '">Remove</button></td></tr>').join('') + '</tbody></table></div></div>';
}
function vSettings() {
  const S = S_(), t = E.levelTable(S.curve);
  let h = '<div class="grid g2"><div class="card"><h2>Goals and targets</h2><div class="fld">' +
    '<label>Diet phase</label><select data-in="cfg" data-path="phase" data-type="str">' + ['cut', 'maintain', 'bulk'].map(p => opt(p, p === 'cut' ? 'Cut (lean)' : p === 'bulk' ? 'Bulk (lean)' : 'Maintain', S.phase)).join('') + '</select>' +
    numField('Calorie target (kcal)', 'kcal', S.kcal, 50) + numField('Protein target (g)', 'protein', S.protein, 5) + numField('Water (ml)', 'water', S.water, 250) +
    '<label>Out of bed by</label><input type="text" inputmode="numeric" class="tin" data-in="cfgtime" data-path="wakeBy" value="' + S.wakeBy + '" placeholder="07:30">' +
    numField('Unhealthy meals allowed / week', 'treatsPerWeek', S.treatsPerWeek) + numField('Fun-day free unhealthy meals', 'funTreats', S.funTreats) + numField('Life tokens / month', 'tokensPerMonth', S.tokensPerMonth) + numField('Check-in log bonus (XP)', 'slotLogXp', S.slotLogXp) +
    numField('Spend weight (x vs earning)', 'spendWeight', S.spendWeight, 0.05) + numField('Late wake penalty per 30 min', 'wakePenalty', S.wakePenalty, 0.05) + numField('Food cost, low (EUR/meal)', 'foodCost.low', S.foodCost.low, 0.5) + numField('Food cost, high (EUR/meal)', 'foodCost.high', S.foodCost.high, 0.5) + '</div>' +
    '<p class="hint">Waking up by the time above earns full XP. Every started 30 minutes later removes the late-wake penalty fraction from it (0.3 means 70%, 40%, 10%, then negative, floored at -40%). Changing phase or targets only changes how new days are scored. XP and levels stay. Spend weight 1.2 means a euro spent costs 20% more XP than a euro earned earns, which pushes you to save more than you spend. The monthly savings target (20%) is on the Finance indicator below.</p></div>';
  h += '<div class="card"><h2>Weekly rhythm</h2><div class="fld">' + [1, 2, 3, 4, 5, 6, 0].map(dw => '<label>' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dw] + '</label><select data-in="rhythm" data-id="' + dw + '">' + opt('normal', 'Normal', S.rhythm[dw] || 'normal') + opt('rest', 'Rest day', S.rhythm[dw] || 'normal') + opt('fun', 'Fun day', S.rhythm[dw] || 'normal') + opt('cheat', 'Cheat evening', S.rhythm[dw] || 'normal') + '</select>').join('') + '<label>Cheat evening starts</label><input type="text" inputmode="numeric" class="tin" data-in="cfgtime" data-path="cheatFrom" value="' + esc(S.cheatFrom) + '" placeholder="17:00">' + '</div>' +
    '<p class="hint">Rest: study and job targets relaxed, resting earns ' + Math.round(S.restCredit * 100) + '%. Fun: free unhealthy meals, relaxed targets, double spending limit, gentler sober-sleep penalty the next morning.</p>' +
    '<h2 style="margin-top:16px">Levelling curve</h2><div class="fld">' + numField('XP scale (a)', 'curve.a', S.curve.a, 1) + numField('Steepness (p)', 'curve.p', S.curve.p, 0.05) + '</div><p class="hint">XP to reach: ' + [5, 10, 25, 50, 75, 99].map(L => 'L' + L + ' = ' + fmt(t[L])).join(' | ') + '. A perfect day earns about 100-130 XP per skill.</p>' +
    '<button class="btn sm" data-act="resetCurve">Reset curve</button></div></div>';
  h += householdCard();
  h += '<div class="card" style="margin-top:12px"><div class="row sp"><h2 style="margin:0">Indicators</h2><button class="btn pri sm" data-act="newInd">+ Add indicator</button></div><p class="hint">XP is shared inside a skill: adding an indicator rebalances the others so one skill never out-earns the rest. Optional ones give bonus XP and are never penalised.</p><div class="scroll"><table><thead><tr><th>Indicator</th><th>Skill</th><th>When</th><th>Type</th><th>Weight</th><th>XP/day*</th><th></th></tr></thead><tbody>' +
    cfg().indicators.map(i => { const sk = skillOf(i.skill) || { name: '?' }; return '<tr style="' + (i.off ? 'opacity:.45' : '') + '"><td>' + esc(i.name) + (i.optional ? ' <span class="badge">bonus</span>' : '') + (i.off ? ' <span class="badge">off</span>' : '') + '</td><td>' + esc(sk.name) + '</td><td>' + i.slot + '</td><td>' + i.kind + '</td><td>' + (i.abs ? i.unitXp + ' XP each' : i.w) + '</td><td>' + (i.abs ? '-' : fmt(res.full[i.id])) + '</td><td><button class="btn sm" data-act="editInd" data-id="' + i.id + '">Edit</button></td></tr>'; }).join('') +
    '</tbody></table></div><p class="hint">*XP for a perfect result on that indicator (weekly and monthly ones are paid out over the week or month).</p></div>';
  h += '<div class="card" style="margin-top:12px"><div class="row sp"><h2 style="margin:0">Skills</h2><button class="btn sm" data-act="newSkill">+ Add skill</button></div><div class="row" style="margin-top:10px">' + cfg().skills.map(s => '<button class="btn sm" data-act="editSkill" data-id="' + s.id + '">' + esc(s.name) + ' <small>(' + esc(s.group) + ')</small></button>').join('') + '</div></div>';
  h += syncCard();
  h += '<div class="card" style="margin-top:12px"><h2>Your data</h2><p class="hint">App version: ' + esc(window.LT_BUILD || 'dev') + '. Phones fetch a new version automatically the next time you open the app online. Your data is separate from the app, so updates never touch it, and the app keeps a copy before it changes an older data format.</p><p class="mu">Everything is stored in this browser (localStorage), and in your cloud copy when sync is on. ' + (state.lastBackup ? 'Last backup: ' + state.lastBackup + '.' : 'No backup yet.') + ' Settings and logs are parts of one JSON file, so moving to a phone or server later means moving that file.</p><div class="row"><button class="btn pri" data-act="export">Back up now (share to Drive)</button><button class="btn" data-act="download">Download file</button><button class="btn" data-act="importBtn">Import backup</button><input type="file" id="impFile" accept="application/json,.json" hidden data-in="importFile"><button class="btn danger" data-act="reset">Reset everything</button></div></div>';
  return h;
}
