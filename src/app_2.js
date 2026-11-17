
/* ---------- modal forms ---------- */
const TPL = {
  habit: ['Yes / No habit', () => ({ kind: 'binary' })],
  minutes: ['Daily minutes (study, practice)', () => ({ kind: 'effort', unit: 'min', target: 30, everyN: 1, relax: true, def: 30 })],
  target: ['Daily number to reach (pages, glasses...)', () => ({ kind: 'bar', unit: '', target: 10, step: 1, def: 10 })],
  zone: ['Ideal range (for example hours)', () => ({ kind: 'zone', unit: 'h', step: 0.25, lo: 7, hi: 9, min: 5, max: 11, def: 8 })],
  weekly: ['Weekly count goal', () => ({ kind: 'count', goal: 3 })],
  bonus: ['Bonus counter (fixed XP each)', () => ({ kind: 'count', abs: true, optional: true, unitXp: 10, dayCap: 3 })],
  rating: ['1-10 rating', () => ({ kind: 'rating' })],
  limit: ['Daily limit (lower is better)', () => ({ kind: 'ceil', unit: 'EUR', step: 5, ideal: 20, zero: 40, bad: 90, def: 15 })]
};
function fld(label, name, val, type, extra) { return '<label>' + label + '</label><input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '>'; }
const btns = (del, delAct, id, saveAct) => '<div class="row sp"><div>' + (del ? '<button class="btn danger sm" data-act="' + delAct + '" data-id="' + id + '">Delete</button>' : '') + '</div><div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="' + saveAct + '">Save</button></div></div>';
function indForm(ind, isNew, tplKey) {
  const k = ind.kind;
  let f = fld('Name', 'name', ind.name) +
    '<label>Skill</label><select name="skill">' + cfg().skills.map(s => opt(s.id, s.name, ind.skill)).join('') + '</select>' +
    '<label>Main check-in</label><select name="slot">' + E.SLOTS.map(s => opt(s, s, ind.slot)).join('') + '</select>' +
    '<label>Can be entered in</label><div class="row">' + E.SLOTS.map(s => '<label class="mu"><input type="checkbox" name="sl_' + s + '"' + (slotsOf(ind).includes(s) ? ' checked' : '') + '> ' + s + '</label>').join('') + '</div>';
  if (!ind.abs) f += fld('Weight (importance)', 'w', ind.w, 'number', 'step="0.5" min="0.5"');
  if (k === 'effort') f += fld('Target (min)', 'target', ind.target, 'number') + fld('Do it every N days', 'everyN', ind.everyN || 1, 'number', 'min="1" max="7"') + '<label>Relaxed on rest/fun days</label><input type="checkbox" name="relax"' + (ind.relax ? ' checked' : '') + '>';
  if (k === 'bar') f += fld('Daily target', 'target', ind.target, 'number') + fld('Unit', 'unit', ind.unit);
  if (k === 'zone') f += fld('Ideal from', 'lo', ind.lo, 'number', 'step="any"') + fld('Ideal to', 'hi', ind.hi, 'number', 'step="any"') + fld('Zero XP below', 'min', ind.min, 'number', 'step="any"') + fld('Zero XP above', 'max', ind.max, 'number', 'step="any"') + fld('Unit', 'unit', ind.unit);
  if (k === 'ceil') f += fld('Full XP up to', 'ideal', ind.ideal, 'number') + fld('Zero XP at', 'zero', ind.zero, 'number') + fld('Max penalty from', 'bad', ind.bad, 'number') + fld('Unit', 'unit', ind.unit);
  if (k === 'cashflow') f += fld('Full XP up to (EUR/day)', 'ideal', ind.ideal, 'number');
  if (k === 'savings') f += fld('Target savings rate (0.2 = 20%)', 'target', ind.target, 'number', 'step="0.01"');
  if (k === 'tier') f += '<label>Ask for a cost tag</label><input type="checkbox" name="cost"' + (ind.cost ? ' checked' : '') + '>';
  if (k === 'count' && !ind.abs) f += fld('Weekly goal', 'goal', ind.goal, 'number', 'min="1"');
  if (k === 'count' && ind.abs) f += fld('XP each', 'unitXp', ind.unitXp, 'number') + fld('Max per day', 'dayCap', ind.dayCap, 'number');
  if (k === 'workout') f += fld('Weekly goal (sessions)', 'goal', ind.goal, 'number') + fld('Target minutes', 'target', ind.target, 'number');
  if (k === 'rating') f += '<label>Never penalise (feelings)</label><input type="checkbox" name="noPenalty"' + (ind.noPenalty ? ' checked' : '') + '>';
  if (!ind.abs && !['need', 'rooms', 'savings'].includes(k)) f += '<label>Bonus only (no penalty)</label><input type="checkbox" name="optional"' + (ind.optional ? ' checked' : '') + '>';
  f += '<label>Enabled</label><input type="checkbox" name="on"' + (ind.off ? '' : ' checked') + '>';
  return '<h2>' + (isNew ? 'New indicator' : 'Edit indicator') + '</h2><form id="mform" data-id="' + esc(ind.id) + '" data-new="' + (isNew ? 1 : 0) + '" data-tpl="' + esc(tplKey || '') + '"><div class="fld">' + f + '</div></form>' + btns(!isNew, 'delInd', ind.id, 'saveInd');
}
function questForm(q, isNew) {
  const m = q.metric || {};
  const indOpts = sel => cfg().indicators.map(i => opt(i.id, i.name, sel)).join('') + opt('spent', 'Spending (EUR)', sel) + opt('earned', 'Earned / saved (EUR)', sel);
  const inds = indOpts(m.ind);
  const extra = (m.and ? [m.and] : []).concat(m.all || []);
  const condRow = n => { const c = extra[n - 1]; return '<label>Also require (' + n + ')</label><div class="row" style="flex-wrap:nowrap"><select name="c' + n + 'ind"><option value="">none</option>' + indOpts(c ? c.ind : '') + '</select><select name="c' + n + 'op">' + opt('>=', 'at least', c ? c.op : '') + opt('<=', 'at most', c ? c.op : '') + opt('==', 'equals', c ? c.op : '') + '</select><input type="number" name="c' + n + 'val" step="any" style="width:80px" value="' + (c ? (c.val === true ? 1 : c.val === false ? 0 : c.val) : '') + '"></div>'; };
  return '<h2>' + (isNew ? 'New milestone' : 'Edit milestone') + '</h2><form id="mform" data-id="' + esc(q.id) + '" data-new="' + (isNew ? 1 : 0) + '"><div class="fld">' + fld('Name', 'name', q.name) + fld('Reward (real life)', 'reward', q.reward) +
    '<label>What to count</label><select name="mtype">' + opt('days', 'Days a habit was done (or a condition met)', m.type) + opt('sum', 'Sum of values over the period', m.type) + opt('avg', 'Average of values', m.type) + opt('wk_best', 'Best single session value (for example squat kg)', m.type === 'wk_max' ? 'wk_best' : m.type) + opt('wk_count', 'Number of sessions', m.type) + opt('weeks', 'Weeks in a row with enough sessions', m.type) + opt('level', 'Reach a skill level', m.type) + opt('meta', 'All of several milestones done (big reward)', m.type) + '</select>' +
    '<label>Indicator</label><select name="mind">' + inds + '</select>' +
    '<label>Skill (for level)</label><select name="mskill">' + cfg().skills.map(s => opt(s.id, s.name, m.skill)).join('') + '</select>' +
    '<label>Session field (best)</label><select name="field">' + opt('squat', 'Top squat (kg)', m.field) + opt('load', 'Load / distance', m.field) + opt('min', 'Minutes', m.field) + '</select>' +
    '<label>Workout type</label><select name="wtype">' + opt('', 'Any', m.wtype || '') + E.WORKOUT_TYPES.map(t => opt(t.id, t.label, m.wtype)).join('') + '</select>' +
    fld('Min sessions per week', 'minper', m.min || 1, 'number', 'min="1"') +
    '<label>Condition (days)</label><select name="op">' + opt('', 'None, count XP-earning days', m.op || '') + opt('>=', 'value at least', m.op) + opt('<=', 'value at most', m.op) + opt('==', 'value equals (1 = yes)', m.op) + '</select>' + fld('Condition value', 'val', m.val === true ? 1 : (m.val == null ? '' : m.val), 'number', 'step="any"') +
    '<label>Weekdays only</label><input type="checkbox" name="weekdays"' + (m.weekdays ? ' checked' : '') + '>' + condRow(1) + condRow(2) + condRow(3) +
    '<label>Milestones (for big reward)</label><select name="mids" multiple size="5">' + cfg().quests.filter(x => x.id !== q.id && !(x.metric && x.metric.type === 'meta')).map(x => '<option value="' + esc(x.id) + '"' + ((m.ids || []).includes(x.id) ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>' +
    fld('Target', 'target', q.target, 'number', 'step="any"') +
    '<label>Period</label><select name="period">' + opt('day', 'Each day', q.period) + opt('week', 'Each week', q.period) + opt('month', 'Each month', q.period) + opt('all', 'All time (one-off milestone)', q.period) + '</select>' + fld('Bonus XP', 'xp', q.xp, 'number') +
    '<label>Bonus goes to</label><select name="skill">' + cfg().skills.map(s => opt(s.id, s.name, q.skill)).join('') + '</select></div><p class="hint">Only the fields that match "what to count" are used. Composite rewards: use "Days a habit was done" and add up to three "also require" conditions (for example teeth brushed twice and smoked = equals 0). Big rewards: choose "All of several milestones" and pick them in the list (hold Ctrl or Cmd to select several).</p></form>' + btns(!isNew, 'delQuest', q.id, 'saveQuest');
}
function skillForm(s, isNew) {
  return '<h2>' + (isNew ? 'New skill' : 'Edit skill') + '</h2><form id="mform" data-id="' + esc(s.id) + '" data-new="' + (isNew ? 1 : 0) + '"><div class="fld">' + fld('Name', 'name', s.name) + '<label>Group</label><select name="group">' + groupList().map(g => opt(g, g, s.group)).join('') + '</select></div></form>' + btns(!isNew, 'delSkill', s.id, 'saveSkill');
}
const fv = n => { const el = $('#mform').elements[n]; return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
const rid = p => p + '_' + Math.random().toString(36).slice(2, 6);
function parseFill(str, home) {
  const out = {};
  String(str || '').split(',').forEach(part => {
    const [k, n] = part.split(':').map(x => x.trim()); if (!k || !isFinite(Number(n))) return;
    const room = home.rooms.find(r => r.id === k.toLowerCase() || r.name.toLowerCase() === k.toLowerCase()); if (room) out[room.id] = Number(n);
  });
  return out;
}

/* ---------- actions ---------- */
const ACT = {
  tab: t => { ui.tab = t.dataset.id; render(); },
  slot: t => { ui.slot = t.dataset.id; render(); },
  openSlot: t => { ui.tab = 'checkin'; ui.slot = t.dataset.id; render(); },
  goBackfill: t => { ui.date = t.dataset.id; ui.tab = 'checkin'; const r = res.days[ui.date]; ui.slot = E.SLOTS.find(s => r && !r.slots[s].logged) || 'morning'; render(); },
  dprev: () => { ui.date = E.addDays(ui.date, -1); render(); },
  dnext: () => { if (ui.date < TODAY) { ui.date = E.addDays(ui.date, 1); render(); } },
  dtoday: () => { ui.date = TODAY; render(); },
  set: t => { const day = getDay(ui.date), id = t.dataset.id; const val = t.dataset.num ? Number(t.dataset.val) : t.dataset.val; if (day.v[id] === val) delete day.v[id]; else day.v[id] = val; persist(); },
  setc: t => { const day = getDay(ui.date), k = t.dataset.id + '_cost'; if (day.v[k] === t.dataset.val) delete day.v[k]; else day.v[k] = t.dataset.val; persist(); },
  setbool: t => { const day = getDay(ui.date), id = t.dataset.id, val = t.dataset.val === 'true'; if (id in day.v && day.v[id] === val) delete day.v[id]; else day.v[id] = val; persist(); },
  skopen: t => { ui.skOpen = ui.skOpen === t.dataset.id ? null : t.dataset.id; render(); },
  quickWater: () => { const ind = indOf('water'); if (!ind) return; const day = getDay(TODAY), h = new Date().getHours(), slot = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'night', slots = slotsOf(ind), sl = slots.includes(slot) ? slot : slots[slots.length - 1]; setPart(day, ind, sl, (partVal(day, ind, sl) || 0) + (ind.tap || 250)); persist(); },
  actopen: t => { ui.actOpen = ui.actOpen === t.dataset.id ? null : t.dataset.id; render(); },
  allon: t => { const day = getDay(ui.date), ids = t.dataset.ids.split(','), all = ids.every(id => day.v[id] === true); ids.forEach(id => { if (all) delete day.v[id]; else day.v[id] = true; }); persist(); },
  toggle: t => { const day = getDay(ui.date), id = t.dataset.id, ind = indOf(id); const cur = id in day.v ? !!day.v[id] : ind.defaultVal === true; day.v[id] = !cur; persist(); },
  add: t => { const day = getDay(ui.date), id = t.dataset.id; const n = (E.num(day.v[id]) || 0) + Number(t.dataset.val); day.v[id] = Math.max(0, n); persist(); },
  ev: t => { const day = getDay(ui.date), id = t.dataset.id, a = Array.isArray(day.v[id]) ? day.v[id].slice() : [], i = a.indexOf(t.dataset.val); if (i >= 0) a.splice(i, 1); else a.push(t.dataset.val); day.v[id] = a; persist(); },
  wtype: t => { const day = getDay(ui.date); const w = day.v.workout || { min: 60 }; w.type = t.dataset.val; day.v.workout = w; persist(); },
  wnone: () => { delete getDay(ui.date).v.workout; persist(); },
  dictate: () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('Dictation is not supported in this browser. Type instead.'); return; }
    const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false;
    rec.onresult = e => { const txt = Array.from(e.results).map(r => r[0].transcript).join(' '); const v = getDay(ui.date).v; v.meal_text = ((v.meal_text ? v.meal_text + ' ' : '') + txt).trim(); persist(); };
    rec.onerror = () => toast('Could not capture audio'); rec.onstart = () => toast('Listening...'); try { rec.start(); } catch (e) { toast('Could not start dictation'); }
  },
  copyPrompt: () => {
    const txt = mealPrompt(getDay(ui.date).v);
    const done = () => toast('Prompt copied. Paste it into Claude.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => { prompt('Copy this prompt', txt); });
    else prompt('Copy this prompt', txt);
  },
  saveSlot: () => {
    const d = ui.date, day = getDay(d), slot = ui.slot, before = res;
    for (const i of cfg().indicators) if (!i.off && i.slot === slot && i.kind === 'binary' && !i.invert && !(i.id in day.v)) day.v[i.id] = i.defaultVal === true;
    const was = !!day.slots[slot]; if (!was) day.slots[slot] = { at: TODAY };
    save(); const after = E.compute(state, { today: TODAY, viewDate: d }); res = after;
    const r = after.days[d], items = cfg().indicators.filter(i => !i.off && i.slot === slot && r.inds[i.id] && Math.abs(r.inds[i.id].xp) >= 0.5);
    const sl = r.slots[slot], logBonus = was ? 0 : S_().slotLogXp * sl.factor;
    const total = items.reduce((x, i) => x + r.inds[i.id].xp, 0) + logBonus;
    const ups = cfg().skills.filter(s => after.skills[s.id].level > before.skills[s.id].level).map(s => '<div class="lvup">' + esc(s.name) + ' reached level ' + after.skills[s.id].level + '</div>').join('');
    openModal('<h2>' + (was ? 'Updated' : 'Saved') + ' &middot; ' + slot + ' check-in</h2><div class="big ' + (total >= 0 ? 'pos' : 'neg') + '">' + sg(total) + ' XP</div>' + (sl.factor < 1 ? '<p class="mu">Backfill: positive XP x' + sl.factor + '</p>' : '') + ups +
      '<ul class="sum">' + items.map(i => '<li><span>' + esc(i.name) + (r.inds[i.id].note ? '<small> (' + esc(r.inds[i.id].note) + ')</small>' : '') + '</span><b class="' + (r.inds[i.id].xp >= 0 ? 'pos' : 'neg') + '">' + sg(r.inds[i.id].xp) + '</b></li>').join('') + (logBonus ? '<li><span>Logged this check-in</span><b class="pos">+' + Math.round(logBonus) + '</b></li>' : '') + '</ul><p class="hint">Skill XP also scales with your current form (0.7x to 1.3x). The Skills tab has the real totals.</p>' +
      '<div class="row"><button class="btn pri" data-act="closeModal">Close</button><button class="btn" data-act="nextSlot">Next check-in</button></div>');
    render();
  },
  nextSlot: () => { closeModal(); const i = E.SLOTS.indexOf(ui.slot); if (i < 2) ui.slot = E.SLOTS[i + 1]; else { ui.tab = 'dashboard'; } render(); },
  addpart: t => { const day = getDay(ui.date), ind = indOf(t.dataset.id), slot = t.dataset.slot; if (!ind) return; setPart(day, ind, slot, Math.max(0, (partVal(day, ind, slot) || 0) + Number(t.dataset.val))); persist(); },
  newQuestFor: t => { const sid = t.dataset.id, ind = cfg().indicators.find(i => i.skill === sid && !i.off && i.kind !== 'rooms'); openModal(questForm({ id: rid('q'), name: '', reward: '', metric: { type: 'days', ind: ind ? ind.id : 'workout' }, target: 10, period: 'month', xp: 200, skill: sid }, true)); },
  saveDay: () => {
    const d = ui.date, day = getDay(d), before = res; let n = 0;
    for (const slot of E.SLOTS) {
      for (const i of cfg().indicators) if (!i.off && i.slot === slot && i.kind === 'binary' && !i.invert && !(i.id in day.v)) day.v[i.id] = i.defaultVal === true;
      if (!day.slots[slot]) { day.slots[slot] = { at: TODAY }; n++; }
    }
    save(); const after = E.compute(state, { today: TODAY, viewDate: d }); res = after; const r = after.days[d];
    const items = cfg().indicators.filter(i => !i.off && r.inds[i.id] && Math.abs(r.inds[i.id].xp) >= 0.5), total = dayXp(d);
    const ups = cfg().skills.filter(s => after.skills[s.id].level > before.skills[s.id].level).map(s => '<div class="lvup">' + esc(s.name) + ' reached level ' + after.skills[s.id].level + '</div>').join('');
    openModal('<h2>Day saved &middot; ' + dlabel(d) + '</h2><div class="big ' + (total >= 0 ? 'pos' : 'neg') + '">' + sg(total) + ' XP</div><p class="mu">' + n + ' check-in' + (n === 1 ? '' : 's') + ' newly logged.</p>' + ups + '<ul class="sum">' + items.map(i => '<li><span>' + esc(i.name) + '</span><b class="' + (r.inds[i.id].xp >= 0 ? 'pos' : 'neg') + '">' + sg(r.inds[i.id].xp) + '</b></li>').join('') + '</ul><button class="btn pri" data-act="closeModal">Close</button>');
    render();
  },
  addTodo: () => {
    const text = ($('#tdText').value || '').trim(); if (!text) { toast('Write what needs doing'); return; }
    state.todos.push({ id: rid('td'), text, skill: ($('#tdSkill') || {}).value || 'household', size: ($('#tdSize') || {}).value || 'normal', due: ($('#tdDue') || {}).value || null, reward: (($('#tdReward') || {}).value || '').trim(), created: TODAY, done: null });
    persist(); toast('Added'); const el = $('#tdText'); if (el) el.focus();
  },
  doneTodo: t => {
    const td = state.todos.find(x => x.id === t.dataset.id); if (!td || td.done) return; const before = res;
    td.done = TODAY; state.bonuses.push({ date: TODAY, skill: td.skill, xp: todoXp(td), label: 'To-do: ' + td.text, todo: td.id }); save(); res = E.compute(state, { today: TODAY, viewDate: ui.date });
    const lv = res.skills[td.skill] && before.skills[td.skill] && res.skills[td.skill].level > before.skills[td.skill].level;
    if (td.reward || lv) openModal('<h2>To-do done</h2><p><b>' + esc(td.text) + '</b></p><div class="big pos">+' + todoXp(td) + ' XP</div>' + (lv ? '<div class="lvup">' + esc((skillOf(td.skill) || {}).name) + ' reached level ' + res.skills[td.skill].level + '</div>' : '') + (td.reward ? '<p>Your reward: <b>' + esc(td.reward) + '</b></p>' : '') + '<button class="btn pri" data-act="closeModal">Nice</button>'); else toast('+' + todoXp(td) + ' XP, momentum ' + (res.days[TODAY].momentum ? '+' + Math.round(res.days[TODAY].momentum * 100) + '%' : 'off'));
    render();
  },
  undoTodo: t => { const td = state.todos.find(x => x.id === t.dataset.id); if (!td) return; td.done = null; state.bonuses = state.bonuses.filter(b => b.todo !== td.id); persist(); },
  delTodo: t => { const td = state.todos.find(x => x.id === t.dataset.id); if (!td) return; if (td.done && !confirm('Delete a finished to-do? Its XP is removed too.')) return; state.bonuses = state.bonuses.filter(b => b.todo !== td.id); state.todos = state.todos.filter(x => x.id !== td.id); persist(); },
  clearSlot: () => { delete getDay(ui.date).slots[ui.slot]; persist(); },
  modeRange: () => { const n = Math.max(1, Math.min(60, Number($('#mrN').value) || 1)), m = $('#mrM').value; for (let i = 0; i < n; i++) { const d = E.addDays(ui.date, i); getDay(d).mode = m; } persist(); toast('Mode "' + m + '" set for ' + n + ' day(s)'); },
  claim: t => { const q = cfg().quests.find(x => x.id === t.dataset.id); if (q && E.claimQuest(state, q, ui.date)) { persist(); openModal('<h2>Milestone complete</h2><p><b>' + esc(q.name) + '</b></p><p>' + (q.reward ? 'Your reward: <b>' + esc(q.reward) + '</b>' : 'No reward was set for this one. You can add one when editing it.') + '</p>' + (q.xp ? '<div class="lvup">+' + q.xp + ' bonus XP</div>' : '') + '<button class="btn pri" data-act="closeModal">Claimed</button>'); } },
  closeModal: closeModal,
  ovclick: (t, e) => { if (e.target === t) closeModal(); },
  startFresh: () => { state.welcomed = true; persist(); },
  startDemo: () => { ACT.loadDemoWith('consistent', 90); },
  loadDemo: () => ACT.loadDemoWith(ui.simPersona, ui.simDays),
  loadDemoWith: (pid, n) => {
    const out = E.runSim(pid, n, { start: E.addDays(TODAY, -(n - 1)), seed: 7 });
    state = migrate(out.state); state.welcomed = true; appMode = 'demo'; lsSet(KEYS.mode, 'demo'); save(); ui.tab = 'dashboard'; ui.date = TODAY; render(); toast('Demo loaded: ' + E.PERSONAS[pid].label);
  },
  exitDemo: () => { appMode = 'real'; lsSet(KEYS.mode, 'real'); state = loadState(); syncRebase(); ui.date = TODAY; render(); syncNow(); },
  simp: t => { ui.simPersona = t.dataset.id; render(); },
  runSim: () => { ui.sim = { persona: ui.simPersona, days: ui.simDays, out: runOne(ui.simPersona, ui.simDays) }; render(); },
  runAll: () => { ui.simAll = { days: ui.simDays, outs: Object.keys(E.PERSONAS).map(id => ({ id, out: runOne(id, ui.simDays) })) }; render(); },
  resetCurve: () => { S_().curve = Object.assign({}, E.DEFAULT_CURVE); persist(); },
  export: () => {
    state.lastBackup = TODAY; save(); const text = JSON.stringify(state, null, 1), name = 'life-tracker-backup-' + TODAY + '.json';
    const file = (typeof File === 'function') ? new File([text], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) { navigator.share({ files: [file], title: 'Life Tracker backup' }).then(() => toast('Backup shared'), e => { if (e && e.name !== 'AbortError') toast('Sharing failed, use Download instead'); }); render(); return; }
    ACT.download();
  },
  download: () => { state.lastBackup = TODAY; save(); const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'life-tracker-backup-' + TODAY + '.json'; document.body.appendChild(a); a.click(); a.remove(); render(); toast('Backup downloaded'); },
  importBtn: () => $('#impFile').click(),
  reset: () => { if (confirm('Delete ALL data in this browser and start over?' + (syncSigned() ? ' You are signed in to sync, so the cloud copy will restore it on the next sync. Sign out first to truly start over.' : ' Export a backup first if unsure.'))) { state = E.defaultState(TODAY); persist(); toast('Reset done'); } },
  newInd: () => openModal('<h2>New indicator</h2><p class="mu">Pick the kind of thing you want to track:</p><div class="grid">' + Object.entries(TPL).map(([k, v]) => '<button class="persona" data-act="pickTpl" data-id="' + k + '"><b>' + v[0] + '</b></button>').join('') + '</div><div class="row" style="margin-top:12px"><button class="btn" data-act="closeModal">Cancel</button></div>'),
  pickTpl: t => { const k = t.dataset.id, base = Object.assign({ id: rid('c'), name: '', skill: cfg().skills[0].id, slot: 'afternoon', w: 1, off: false, optional: false }, TPL[k][1]()); openModal(indForm(base, true, k)); },
  editInd: t => { const ind = indOf(t.dataset.id); if (ind) openModal(indForm(ind, false)); },
  saveInd: () => {
    const f = $('#mform'), isNew = f.dataset.new === '1'; let ind = isNew ? null : indOf(f.dataset.id);
    if (isNew) { ind = Object.assign({ id: f.dataset.id, off: false, optional: false, w: 1 }, TPL[f.dataset.tpl][1]()); }
    const name = (fv('name') || '').trim(); if (!name) { toast('Give it a name'); return; }
    ind.name = name; ind.skill = fv('skill'); ind.slot = fv('slot'); ind.off = !fv('on');
    { const chk = E.SLOTS.filter(s => fv('sl_' + s)); if (chk.length <= 1) { if (chk.length) ind.slot = chk[0]; delete ind.slots; } else { ind.slots = chk; if (!chk.includes(ind.slot)) ind.slot = chk[0]; } }
    const nm = (n, key) => { const x = fv(n); if (x !== undefined && x !== '') ind[key || n] = Number(x); };
    if (!ind.abs) nm('w'); ['target', 'everyN', 'lo', 'hi', 'min', 'max', 'ideal', 'zero', 'bad', 'goal', 'unitXp', 'dayCap'].forEach(n => nm(n));
    if (fv('unit') !== undefined) ind.unit = fv('unit'); if (fv('relax') !== undefined) ind.relax = fv('relax'); if (fv('noPenalty') !== undefined) ind.noPenalty = fv('noPenalty'); if (fv('optional') !== undefined) ind.optional = fv('optional'); if (fv('cost') !== undefined) ind.cost = fv('cost');
    if (ind.kind === 'effort') ind.def = ind.target;
    if (isNew) cfg().indicators.push(ind);
    closeModal(); persist(); toast(isNew ? 'Indicator added, the skill XP was rebalanced' : 'Saved');
  },
  delInd: t => { if (confirm('Delete this indicator? Past XP stays; you can also just disable it.')) { cfg().indicators = cfg().indicators.filter(i => i.id !== t.dataset.id); closeModal(); persist(); } },
  newQuest: () => openModal(questForm({ id: rid('q'), name: '', reward: '', metric: { type: 'days', ind: 'workout' }, target: 10, period: 'month', xp: 200, skill: cfg().skills[0].id }, true)),
  editQuest: t => { const q = cfg().quests.find(x => x.id === t.dataset.id); if (q) openModal(questForm(q, false)); },
  saveQuest: () => {
    const f = $('#mform'), isNew = f.dataset.new === '1'; const q = isNew ? { id: f.dataset.id } : cfg().quests.find(x => x.id === f.dataset.id);
    if (!(fv('name') || '').trim()) { toast('Give it a name'); return; }
    const old = isNew ? null : q.metric, t = fv('mtype'), m = { type: t };
    if (t === 'level') m.skill = fv('mskill'); else if (t !== 'meta') m.ind = fv('mind');
    if (t === 'meta') m.ids = Array.from($('#mform').elements.mids.selectedOptions).map(o => o.value);
    if (t === 'days') { if (fv('op')) { m.op = fv('op'); m.val = Number(fv('val')); if (m.op === '==' && (m.val === 0 || m.val === 1)) m.val = m.val === 1; } if (fv('weekdays')) m.weekdays = true; const all = []; for (let n = 1; n <= 3; n++) { const ci = fv('c' + n + 'ind'); if (!ci) continue; const op = fv('c' + n + 'op') || '>='; let val = Number(fv('c' + n + 'val')); if (op === '==' && (val === 0 || val === 1)) val = val === 1; all.push({ ind: ci, op, val }); } if (all.length) m.all = all; }
    if (t === 'wk_best') { m.field = fv('field') || 'load'; if (fv('wtype')) m.wtype = fv('wtype'); }
    if (t === 'wk_count' || t === 'weeks') { if (fv('wtype')) m.wtype = fv('wtype'); if (t === 'weeks') m.min = Number(fv('minper')) || 1; }
    Object.assign(q, { name: fv('name').trim(), reward: fv('reward') || '', metric: m, target: Number(fv('target')) || (t === 'meta' ? m.ids.length : 1), period: fv('period'), xp: Number(fv('xp')) || 0, skill: fv('skill') });
    if (isNew) cfg().quests.push(q); closeModal(); persist();
  },
  delQuest: t => { if (confirm('Delete this milestone?')) { cfg().quests = cfg().quests.filter(q => q.id !== t.dataset.id); closeModal(); persist(); } },
  newSkill: () => openModal(skillForm({ id: rid('s'), name: '', group: 'Lifestyle' }, true)),
  editSkill: t => { const s = skillOf(t.dataset.id); if (s) openModal(skillForm(s, false)); },
  saveSkill: () => {
    const f = $('#mform'), isNew = f.dataset.new === '1'; const s = isNew ? { id: f.dataset.id } : skillOf(f.dataset.id);
    if (!(fv('name') || '').trim()) { toast('Give it a name'); return; }
    Object.assign(s, { name: fv('name').trim(), group: fv('group') || 'Lifestyle' }); if (isNew) cfg().skills.push(s); closeModal(); persist();
  },
  delSkill: t => { const used = cfg().indicators.some(i => i.skill === t.dataset.id); if (used) { toast('Move or delete its indicators first'); return; } if (confirm('Delete this skill and its XP history?')) { cfg().skills = cfg().skills.filter(s => s.id !== t.dataset.id); closeModal(); persist(); } },
  newRoom: () => openModal('<h2>New room</h2><form id="mform"><div class="fld">' + fld('Name', 'name', '') + fld('Needs cleaning every (days)', 'days', 7, 'number', 'min="1"') + fld('Weight', 'w', 1, 'number', 'step="0.5" min="0.5"') + '</div></form><div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="saveRoom">Add</button></div>'),
  saveRoom: () => { const n = (fv('name') || '').trim(); if (!n) { toast('Give it a name'); return; } homeInd().rooms.push({ id: rid('r'), name: n, decay: Math.round(5000 / (Number(fv('days')) || 7)) / 100, w: Number(fv('w')) || 1, start: 70 }); closeModal(); persist(); },
  delRoom: t => { const h = homeInd(); if (h.rooms.length <= 1) { toast('Keep at least one room'); return; } h.rooms = h.rooms.filter(r => r.id !== t.dataset.id); h.tasks.forEach(k => delete k.fill[t.dataset.id]); persist(); },
  newTask: () => openModal('<h2>New household task</h2><form id="mform"><div class="fld">' + fld('Label', 'label', '') + fld('XP', 'xp', 10, 'number') + fld('Fills (room:points)', 'fill', '', 'text', 'placeholder="kitchen:60, hallway:20"') + '</div></form><p class="hint">Rooms: ' + esc(homeInd().rooms.map(r => r.name).join(', ')) + '</p><div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="saveTask">Add</button></div>'),
  saveTask: () => { const l = (fv('label') || '').trim(); if (!l) { toast('Give it a label'); return; } const h = homeInd(); const fill = parseFill(fv('fill'), h); if (!Object.keys(fill).length) { toast('List at least one room, e.g. kitchen:60'); return; } h.tasks.push({ id: rid('t'), label: l, xp: Number(fv('xp')) || 0, fill }); closeModal(); persist(); },
  delTask: t => { const h = homeInd(); h.tasks = h.tasks.filter(k => k.id !== t.dataset.id); persist(); }
};
const INP = {
  actsel: t => { ui.actSel[t.dataset.cat] = t.value; render(); },
  date: t => { if (t.value && t.value <= TODAY) { ui.date = t.value; render(); } },
  time: t => { const day = getDay(ui.date); if (t.value.trim() === '') { delete day.v[t.dataset.id]; persist(); return; } const p = parseTime(t.value); if (!p) { toast('Could not read that time. Try 10:30 or 1030.'); render(); return; } day.v[t.dataset.id] = p; persist(); },
  cfgtime: t => { const p = parseTime(t.value); if (!p) { toast('Could not read that time. Try 07:30 or 0730.'); render(); return; } S_()[t.dataset.path] = p; persist(); },
  parttotal: t => { const day = getDay(ui.date), ind = indOf(t.dataset.id); if (!ind) return; const slot = t.dataset.slot, cur = partVal(day, ind, slot) || 0, tot = day.v[ind.id] != null ? Number(day.v[ind.id]) : 0, other = Math.max(0, tot - cur); setPart(day, ind, slot, t.value === '' ? null : Math.max(0, Number(t.value) - other)); persist(); },
  part: t => { const day = getDay(ui.date), ind = indOf(t.dataset.id); if (!ind) return; setPart(day, ind, t.dataset.slot, t.value === '' ? null : Number(t.value)); persist(); },
  num: t => { const day = getDay(ui.date); if (t.value === '') delete day.v[t.dataset.id]; else day.v[t.dataset.id] = Number(t.value); persist(); },
  str: t => { const day = getDay(ui.date); if (!t.value) delete day.v[t.dataset.id]; else day.v[t.dataset.id] = t.value; persist(); },
  note: t => { getDay(ui.date).note = t.value; persist(); },
  mode: t => { getDay(ui.date).mode = t.value; persist(); },
  priority: t => { getDay(ui.date).priority = t.value || null; persist(); },
  token: t => { getDay(ui.date).token = t.checked; persist(); },
  wmin: t => { const day = getDay(ui.date), w = day.v.workout; if (!w) return; if (t.value === '' || Number(t.value) <= 0) delete day.v.workout; else w.min = Number(t.value); persist(); },
  wload: t => { const w = getDay(ui.date).v.workout; if (!w) return; if (t.value === '') delete w.load; else w.load = Number(t.value); persist(); },
  wsquat: t => { const w = getDay(ui.date).v.workout; if (!w) return; if (t.value === '') delete w.squat; else w.squat = Number(t.value); persist(); },
  mac: t => { const day = getDay(ui.date), m = day.v.macros || {}; if (t.value === '') delete m[t.dataset.k]; else m[t.dataset.k] = Number(t.value); if (Object.keys(m).length) day.v.macros = m; else delete day.v.macros; persist(); },
  month: t => { const ym = E.monthOf(ui.date), m = state.months[ym] || {}; if (t.value === '') delete m[t.dataset.k]; else m[t.dataset.k] = Number(t.value); state.months[ym] = m; persist(); },
  simdays: t => { ui.simDays = Number(t.value); render(); },
  rhythm: t => { const S = S_(); if (t.value === 'normal') delete S.rhythm[t.dataset.id]; else S.rhythm[t.dataset.id] = t.value; persist(); },
  room: t => { const r = homeInd().rooms.find(x => x.id === t.dataset.id); if (!r) return; const k = t.dataset.k; if (k === 'name') { if (t.value.trim()) r.name = t.value.trim(); } else { const n = Number(t.value); if (isFinite(n) && n > 0) { if (k === 'days') r.decay = Math.round(5000 / n) / 100; else r[k] = n; } } persist(); },
  task: t => { const k = homeInd().tasks.find(x => x.id === t.dataset.id); if (!k) return; if (t.dataset.k === 'label') { if (t.value.trim()) k.label = t.value.trim(); } else { const n = Number(t.value); if (isFinite(n)) k[t.dataset.k] = n; } persist(); },
  taskfill: t => { const h = homeInd(), k = h.tasks.find(x => x.id === t.dataset.id); if (!k) return; const f = parseFill(t.value, h); if (Object.keys(f).length) k.fill = f; else toast('Use room:points, for example kitchen:60'); persist(); },
  cfg: t => {
    const S = S_(), path = t.dataset.path.split('.'); let o = S; for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    const v = t.dataset.type === 'num' ? Number(t.value) : t.value; if (t.dataset.type === 'num' && !isFinite(v)) return; o[path[path.length - 1]] = v; persist();
  },
  importFile: t => {
    const f = t.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { const s = JSON.parse(rd.result); if (!s.config || !s.logs) throw new Error('not a Life Tracker backup'); if (!(s.v >= 2)) throw new Error('this backup is from the first version and cannot be imported'); if (!confirm('Replace the current data with this backup?')) return; state = migrate(s); appMode = 'real'; lsSet(KEYS.mode, 'real'); persist(); toast('Backup imported'); } catch (e) { toast('Import failed: ' + e.message); } };
    rd.readAsText(f); t.value = '';
  }
};
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t || t.disabled) return; const f = ACT[t.dataset.act]; if (f) f(t, e); });
document.addEventListener('change', e => { const t = e.target.closest('[data-in]'); if (!t) return; const f = INP[t.dataset.in]; if (f) f(t, e); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'tdText') ACT.addTodo(); if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

Object.assign(ACT, SYNC_ACT);
state = loadState();
render();
syncInit();
window.__lifetracker = { get state() { return state; }, get res() { return res; }, ui, ACT, INP, render };
})();
