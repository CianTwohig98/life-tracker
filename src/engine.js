/* Life Tracker engine: pure JS, no DOM. Replays the daily logs into XP, levels, form and bars. */
(function (root) {
'use strict';

/* ---------- helpers ---------- */
const DAY = 86400000;
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fd = dt => dt.toISOString().slice(0, 10);
const addDays = (s, n) => fd(new Date(pd(s).getTime() + n * DAY));
const diffDays = (a, b) => Math.round((pd(a) - pd(b)) / DAY);
const dowOf = s => pd(s).getUTCDay();                       // 0 = Sunday
const weekStart = s => addDays(s, -((dowOf(s) + 6) % 7));    // Monday
const monthOf = s => s.slice(0, 7);
const lastOfMonth = ym => { const [y, m] = ym.split('-').map(Number); return fd(new Date(Date.UTC(y, m, 0))); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = x => (x === undefined || x === null || x === '' || isNaN(Number(x))) ? null : Number(x);
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const SLOTS = ['morning', 'afternoon', 'night'];

/* ---------- levelling curve ---------- */
const DEFAULT_CURVE = { a: 17, p: 2.0, b: 0, c: 20 };
const _tables = {};
function levelTable(curve) {
  const key = JSON.stringify(curve);
  if (_tables[key]) return _tables[key];
  const t = [0, 0];
  for (let L = 2; L <= 99; L++) {
    const n = L - 1;
    t[L] = Math.round(curve.a * Math.pow(n, curve.p) + (curve.b || 0) * (Math.pow(2, n / (curve.c || 20)) - 1));
  }
  return (_tables[key] = t);
}
function levelInfo(xp, curve) {
  const t = levelTable(curve || DEFAULT_CURVE);
  let L = 1; while (L < 99 && t[L + 1] <= xp) L++;
  const cur = t[L], next = L < 99 ? t[L + 1] : null;
  return { level: L, xp, cur, next, into: xp - cur, need: next ? next - cur : 0, pct: next ? (xp - cur) / (next - cur) : 1 };
}

/* ---------- default configuration ---------- */
const MEAL = [
  { id: 'clean', label: 'Healthy', s: 1, bar: 1 },
  { id: 'okay', label: 'OK, a bit unhealthy', s: 0.4, bar: 0.6 },
  { id: 'treat', label: 'Unhealthy', s: -0.4, bar: 0.15 }
];
const COSTS = [{ id: 'low', label: 'Low cost' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High cost' }];
const WORKOUT_TYPES = [
  { id: 'gym', label: 'Gym', loadLabel: 'Total volume (kg lifted), optional' },
  { id: 'swim', label: 'Swim', loadLabel: 'Distance (m)' },
  { id: 'run', label: 'Run', loadLabel: 'Distance (km)' },
  { id: 'physio', label: 'Physio (ACL)', loadLabel: null },
  { id: 'other', label: 'Other', loadLabel: null }
];
const SOCIAL_EVENTS = [
  { id: 'friends', label: 'Friends', fill: 35 },
  { id: 'family', label: 'Family dinner', fill: 30 },
  { id: 'partner', label: 'Partner time', fill: 35 },
  { id: 'call', label: 'Call a friend', fill: 12 },
  { id: 'discord', label: 'Discord sesh', fill: 10 },
  { id: 'event', label: 'Party / event', fill: 40 }
];
const GROUPS = ['Health', 'Career & upskilling', 'Lifestyle'];
const HOME_ROOMS = [
  { id: 'kitchen', name: 'Kitchen', decay: 16.7, w: 2, start: 70 },
  { id: 'bathroom', name: 'Bathroom', decay: 3.6, w: 3, start: 70 },
  { id: 'living', name: 'Living room', decay: 7.1, w: 1.5, start: 70 },
  { id: 'bedroom', name: 'Bedroom', decay: 16.7, w: 2, start: 70 },
  { id: 'office', name: 'Office', decay: 3.6, w: 1, start: 70 },
  { id: 'hallway', name: 'Hallway', decay: 3.6, w: 1, start: 70 },
  { id: 'laundry', name: 'Laundry', decay: 16.7, w: 1.5, start: 70 }
];
// room decay is points per day; a room that needs attention (50%) after N days has decay 50 / N
const HOME_TASKS = [
  { id: 't_bath', label: 'Clean bathroom', fill: { bathroom: 85 }, xp: 60 },
  { id: 't_kitchen', label: 'Deep clean kitchen', fill: { kitchen: 70 }, xp: 30 },
  { id: 't_bed', label: 'Change bedding, tidy bedroom', fill: { bedroom: 70 }, xp: 30 },
  { id: 't_hoover', label: 'Hoover (whole flat)', fill: { living: 40, bedroom: 30, office: 35, hallway: 35 }, xp: 20 },
  { id: 't_wash', label: 'Wash clothes', fill: { laundry: 45 }, xp: 10 },
  { id: 't_dry', label: 'Dry and put away clothes', fill: { laundry: 45 }, xp: 10 },
  { id: 't_office', label: 'Tidy office', fill: { office: 30 }, xp: 8 },
  { id: 't_trash', label: 'Take out trash', fill: { kitchen: 15, bathroom: 10 }, xp: 6 },
  { id: 't_living', label: 'Tidy living room', fill: { living: 30 }, xp: 6 },
  { id: 't_dishes', label: 'Dishes, wipe counters', fill: { kitchen: 25 }, xp: 5 },
  { id: 't_hall', label: 'Tidy hallway', fill: { hallway: 30 }, xp: 5 }
];
const REV = 7;
const ALL3 = ['morning', 'afternoon', 'night'], PN = ['afternoon', 'night'];
const MULTI = { study_de: ALL3, study_or: ALL3, job_time: ALL3, reading: ALL3, walk: ALL3, water: ALL3, workout: ALL3, home: PN, cashflow: PN, roles_found: PN, apps_sent: PN, org_browsed: PN, uni_browsed: PN, coffee_chat: PN, outreach: PN, avoided: PN };

function defaultConfig() {
  const settings = {
    phase: 'cut', kcal: 2300, protein: 150, wakeBy: '07:30', steps: 8000, water: 2500,
    rhythm: { 0: 'rest', 5: 'cheat', 6: 'fun' }, cheatFrom: '17:00',
    treatsPerWeek: 2, funTreats: 2, tokensPerMonth: 2,
    skillBudget: 100, slotLogXp: 20, restCredit: 0.5, priorityCap: 40, priorityMult: 0.5,
    spendWeight: 1.2, wakePenalty: 0.3, foodCost: { low: 4, high: 10 },
    modeScale: { normal: 1, sick: 0.5, travel: 0.75, holiday: 0.75 },
    backfill: [{ max: 2, f: 1 }, { max: 7, f: 0.7 }, { max: 1e9, f: 0.5 }],
    lossCapFrac: 0.33, formAlpha: 2 / 15, assumedBad: 0.2,
    catchUp: { on: true, skill: 'fitness', indicator: 'walk', minMin: 30 },
    curve: Object.assign({}, DEFAULT_CURVE)
  };
  const sk = (id, name, group) => ({ id, name, group });
  const skills = [
    sk('sleep', 'Sleep', 'Health'), sk('fitness', 'Fitness', 'Health'), sk('nutrition', 'Nutrition', 'Health'),
    sk('supplements', 'Supplements', 'Health'), sk('hygiene', 'Hygiene', 'Health'), sk('wellbeing', 'Wellbeing', 'Health'),
    sk('career', 'Career', 'Career & upskilling'), sk('german', 'German', 'Career & upskilling'),
    sk('or', 'Operations Research', 'Career & upskilling'), sk('reading', 'Reading', 'Career & upskilling'),
    sk('finance', 'Finance', 'Lifestyle'), sk('household', 'Household', 'Lifestyle'), sk('social', 'Social', 'Lifestyle'),
    sk('looks', 'Looks', 'Lifestyle'), sk('focus', 'Focus', 'Lifestyle'), sk('awareness', 'Self-awareness', 'Lifestyle')
  ];
  const I = o => Object.assign({ off: false, optional: false, w: 1 }, o);
  const indicators = [
    // ---- Sleep
    I({ id: 'sleep_dur', name: 'Sleep duration', skill: 'sleep', slot: 'morning', kind: 'zone', w: 3, unit: 'h', step: 0.25, def: 8, lo: 7.5, hi: 8.5, min: 5.5, max: 10.5, hint: 'Hours slept last night. 8 h is ideal.' }),
    I({ id: 'wake', name: 'Out of bed by target time', skill: 'sleep', slot: 'morning', kind: 'time', w: 2.5, hint: 'Ideal time is set in Settings (default 07:30). Each 30 minutes later costs XP.' }),
    I({ id: 'read_bed', name: 'Read before bed', skill: 'sleep', slot: 'night', kind: 'binary', w: 1, hint: 'A book in bed instead of a screen.' }),
    I({ id: 'sober', name: 'Sober sleep', skill: 'sleep', slot: 'morning', kind: 'binary', w: 1, defaultVal: true, falseScore: -0.4, funHalf: true, modifies: { id: 'sleep_dur', mult: 0.6 }, hint: 'No alcohol or substances last night. Otherwise sleep XP is reduced.' }),
    // ---- Fitness
    I({ id: 'workout', name: 'Workout', skill: 'fitness', slot: 'night', kind: 'workout', w: 4, goal: 4, target: 60, hint: 'Goal: 4 sessions of about 60 min per week. Beating your recent average earns a bonus.' }),
    I({ id: 'stretch_ham', name: 'Hamstring stretches', skill: 'fitness', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 5 }),
    I({ id: 'walk', name: 'Walk', skill: 'fitness', slot: 'night', kind: 'effort', w: 1, unit: 'min', target: 30, everyN: 1, relax: true, def: 30, hint: 'Low-XP side goal: 30 min.' }),
    // ---- Nutrition
    I({ id: 'meal_b', name: 'Breakfast', skill: 'nutrition', slot: 'morning', kind: 'tier', w: 1, options: MEAL, foodTreat: true, cost: true }),
    I({ id: 'meal_l', name: 'Lunch', skill: 'nutrition', slot: 'afternoon', kind: 'tier', w: 1, options: MEAL, foodTreat: true, cost: true }),
    I({ id: 'meal_d', name: 'Dinner', skill: 'nutrition', slot: 'night', kind: 'tier', w: 1, options: MEAL, foodTreat: true, cost: true }),
    I({ id: 'water', name: 'Hydration', skill: 'nutrition', slot: 'night', kind: 'bar', w: 1, unit: 'ml', step: 250, targetKey: 'water', def: 2000, tap: 250 }),
    I({ id: 'macros', name: 'Estimated macros', skill: 'nutrition', slot: 'night', kind: 'macros', w: 1.5, optional: true, hint: 'kcal and protein, estimated from a description of what you ate. Bonus XP.' }),
    // ---- Supplements
    I({ id: 'supp_multi', name: 'Multivitamin', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    I({ id: 'supp_d3', name: 'Vitamin D3', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    I({ id: 'supp_zinc', name: 'Zinc', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    I({ id: 'supp_creatine', name: 'Creatine 5 g', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    I({ id: 'supp_water', name: 'Water 0.5 L with supplements', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    I({ id: 'supp_protein', name: 'Protein 30 g', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    I({ id: 'supp_mag', name: 'Magnesium', skill: 'supplements', slot: 'morning', kind: 'binary', abs: true, optional: true, unitXp: 1 }),
    // ---- Hygiene
    I({ id: 'teeth_am', name: 'Brush teeth (morning)', skill: 'hygiene', slot: 'morning', kind: 'binary' }),
    I({ id: 'teeth_pm', name: 'Brush teeth (night)', skill: 'hygiene', slot: 'night', kind: 'binary' }),
    I({ id: 'shower', name: 'Shower', skill: 'hygiene', slot: 'morning', kind: 'binary' }),
    // ---- Wellbeing
    I({ id: 'smoked', name: 'Smoked today', skill: 'wellbeing', slot: 'night', kind: 'binary', invert: true, w: 2, falseScore: -0.5, alsoDebuff: { skill: 'fitness', xp: -5 }, hint: 'Answer honestly. Not smoking earns XP, smoking costs a little.' }),
    I({ id: 'mood', name: 'How are you feeling?', skill: 'wellbeing', slot: 'night', kind: 'rating', w: 2, noPenalty: true, hint: 'Honest answers never cost XP.' }),
    I({ id: 'weight', name: 'Weight (kg)', skill: 'wellbeing', slot: 'morning', kind: 'weight', w: 1, optional: true, unit: 'kg', step: 0.1, def: 80 }),
    // ---- Career
    I({ id: 'job_time', name: 'Job / PhD applications', skill: 'career', slot: 'afternoon', kind: 'effort', w: 3, unit: 'min', target: 120, everyN: 1, relax: true, def: 120, hint: 'Target: 2 h per day of searching and applying.' }),
    I({ id: 'roles_found', name: 'Suitable roles found', skill: 'career', slot: 'afternoon', kind: 'count', w: 2, goal: 10, hint: 'Weekly goal: 10' }),
    I({ id: 'apps_sent', name: 'Applications sent', skill: 'career', slot: 'afternoon', kind: 'count', w: 3, goal: 2, hint: 'Weekly goal: at least 2' }),
    I({ id: 'org_browsed', name: 'Browsed an entire organisation', skill: 'career', slot: 'afternoon', kind: 'count', abs: true, optional: true, unitXp: 8, dayCap: 3 }),
    I({ id: 'uni_browsed', name: 'Browsed an entire university', skill: 'career', slot: 'afternoon', kind: 'count', abs: true, optional: true, unitXp: 25, dayCap: 2 }),
    I({ id: 'coffee_chat', name: 'Coffee with an experienced person', skill: 'career', slot: 'afternoon', kind: 'count', abs: true, optional: true, unitXp: 40, dayCap: 1 }),
    I({ id: 'outreach', name: 'Reached out to someone at a target organisation', skill: 'career', slot: 'afternoon', kind: 'count', abs: true, optional: true, unitXp: 15, dayCap: 3 }),
    // ---- German / OR / Reading
    I({ id: 'study_de', name: 'German study', skill: 'german', slot: 'afternoon', kind: 'effort', w: 1, unit: 'min', target: 60, everyN: 1, relax: true, def: 60 }),
    I({ id: 'study_or', name: 'Operations Research study', skill: 'or', slot: 'afternoon', kind: 'effort', w: 1, unit: 'min', target: 60, everyN: 1, relax: true, def: 60 }),
    I({ id: 'reading', name: 'Reading', skill: 'reading', slot: 'night', kind: 'effort', w: 1, unit: 'min', target: 60, everyN: 1, relax: true, def: 60, hint: 'Books, literature, newspaper, websites.' }),
    // ---- Finance
    I({ id: 'cashflow', name: 'Cashflow today', skill: 'finance', slot: 'night', kind: 'cashflow', w: 3, goal: 100, ref: 25, ideal: 20, hint: 'Spending counts 1.2x against earnings. Earned includes saved or invested.' }),
    I({ id: 'food_cost', name: 'Food cost', skill: 'finance', slot: 'night', kind: 'foodcost', w: 1, optional: true, sources: ['meal_b', 'meal_l', 'meal_d'], hint: 'From the cost tags on your meals. Cheap and clean is the goal.' }),
    I({ id: 'avoided', name: 'Unnecessary expenses avoided', skill: 'finance', slot: 'night', kind: 'count', abs: true, optional: true, unitXp: 6, dayCap: 3 }),
    I({ id: 'savings', name: 'Monthly savings rate', skill: 'finance', slot: 'night', kind: 'savings', w: 2, target: 0.2, hint: 'Full XP at 20% of net income saved.' }),
    // ---- Household / Social / Looks / Focus
    I({ id: 'home', name: 'Household', skill: 'household', slot: 'night', kind: 'rooms', w: 3, taskCap: 80, taskXpScale: 0.5, rooms: HOME_ROOMS.map(r => Object.assign({}, r)), tasks: HOME_TASKS.map(t => Object.assign({}, t, { fill: Object.assign({}, t.fill) })), hint: 'Tap the tasks you completed. Each room decays daily.' }),
    I({ id: 'social', name: 'Time with people', skill: 'social', slot: 'night', kind: 'need', w: 1, decay: 10, start: 60, events: SOCIAL_EVENTS }),
    I({ id: 'skincare', name: 'Skincare routine', skill: 'looks', slot: 'morning', kind: 'binary' }),
    I({ id: 'sunscreen', name: 'Sunscreen', skill: 'looks', slot: 'morning', kind: 'binary' }),
    I({ id: 'outfit', name: 'Outfit score (1-10)', skill: 'looks', slot: 'morning', kind: 'rating', w: 3, hint: 'Rate how you looked today. Tracked over time, XP uses your 7-day average.' }),
    I({ id: 'no_social', name: 'Stayed off Reddit / social media', skill: 'focus', slot: 'night', kind: 'binary', w: 1 })
  ];
  indicators.forEach(i => { if (MULTI[i.id]) i.slots = MULTI[i.id].slice(); });
  const suppIds = ['supp_multi', 'supp_d3', 'supp_zinc', 'supp_creatine', 'supp_water', 'supp_protein', 'supp_mag'];
  const bars = [
    { id: 'b_sleep', name: 'Sleep', src: ['sleep_dur'] },
    { id: 'b_food', name: 'Nutrition', src: ['meal_b', 'meal_l', 'meal_d'] },
    { id: 'b_water', name: 'Hydration', src: ['water'] },
    { id: 'b_move', name: 'Movement', src: ['walk'] },
    { id: 'b_supp', name: 'Supplements', src: suppIds },
    { id: 'b_hyg', name: 'Hygiene', src: ['teeth_am', 'teeth_pm', 'shower'] },
    { id: 'b_home', name: 'Household', src: ['home'] },
    { id: 'b_social', name: 'Social', src: ['social'] },
    { id: 'b_mood', name: 'Mood', src: ['mood'] }
  ];
  const Q = (id, name, reward, metric, target, period, xp, skill) => ({ id, name, reward, metric, target, period, xp, skill });
  const clean8 = { ind: 'sleep_dur', op: '>=', val: 7.5, and: { ind: 'sober', op: '==', val: true } };
  const plan = [{ ind: 'study_de', op: '>=', val: 60 }, { ind: 'study_or', op: '>=', val: 60 }];
  const quests = [
    Q('q_free_eve', 'Daily plan done: free evening', 'Free evening: play games with friends', { type: 'days', ind: 'job_time', op: '>=', val: 120, all: plan }, 1, 'day', 0, 'career'),
    Q('q_night_out', 'Full day: night out', 'Night out: cinema or a bar with friends', { type: 'days', ind: 'job_time', op: '>=', val: 120, all: plan.concat([{ ind: 'walk', op: '>=', val: 30 }, { ind: 'smoked', op: '==', val: false }, { ind: 'read_bed', op: '==', val: true }]) }, 1, 'day', 0, 'career'),
    Q('q_train_wk', 'Training week: 4 sessions', 'Cinema night', { type: 'wk_count', ind: 'workout' }, 4, 'week', 100, 'fitness'),
    Q('q_sleep_wk', 'Clean 8 h sleep, Monday to Friday', '', Object.assign({ type: 'days', weekdays: true }, clean8), 5, 'week', 150, 'sleep'),
    Q('q_sleep_one', 'First clean 8 h night', '', Object.assign({ type: 'days' }, clean8), 1, 'all', 50, 'sleep'),
    Q('q_sleep_book', 'Clean sleep and reading in bed, 15 weeknights this month', 'A new book to read before bed', { type: 'days', weekdays: true, ind: 'sleep_dur', op: '>=', val: 7.5, all: [{ ind: 'sober', op: '==', val: true }, { ind: 'read_bed', op: '==', val: true }] }, 15, 'month', 150, 'sleep'),
    Q('q_sober', 'Sober sleep, 25 nights this month', '', { type: 'days', ind: 'sober' }, 25, 'month', 200, 'sleep')
  ];
  [50, 60, 70, 80, 90, 100].forEach(k => quests.push(Q('q_sq' + k, 'Squat ' + k + ' kg', '', { type: 'wk_max', ind: 'workout', field: 'squat' }, k, 'all', 100 + (k - 50) * 5, 'fitness')));
  quests.push(
    Q('q_run1', 'Run again (return to running)', '', { type: 'wk_count', ind: 'workout', wtype: 'run' }, 1, 'all', 200, 'fitness'),
    Q('q_run5', 'Run 5 km in one session', '', { type: 'wk_best', ind: 'workout', field: 'load', wtype: 'run' }, 5, 'all', 250, 'fitness'),
    Q('q_wk4', '4+ sessions per week, 4 weeks in a row', 'Massage gun', { type: 'weeks', ind: 'workout', min: 4 }, 4, 'all', 300, 'fitness'),
    Q('q_wk8', '4+ sessions per week, 8 weeks in a row', '', { type: 'weeks', ind: 'workout', min: 4 }, 8, 'all', 500, 'fitness'),
    Q('q_swim4', 'Swim every week, 4 weeks in a row', '', { type: 'weeks', ind: 'workout', wtype: 'swim', min: 1 }, 4, 'all', 250, 'fitness'),
    Q('q_bleach', 'Teeth bleaching: 60 days brushed twice and smoke free', 'Get teeth bleached', { type: 'days', ind: 'teeth_am', op: '==', val: true, all: [{ ind: 'teeth_pm', op: '==', val: true }, { ind: 'smoked', op: '==', val: false }] }, 60, 'all', 300, 'hygiene'),
    Q('q_lvl_career', 'Career level 20', '', { type: 'level', skill: 'career' }, 20, 'all', 200, 'career'),
    Q('q_lvl_german', 'German level 20', '', { type: 'level', skill: 'german' }, 20, 'all', 200, 'german'),
    Q('q_holiday', 'Big one: holiday', 'Book a holiday', { type: 'meta', ids: ['q_bleach', 'q_wk8', 'q_lvl_career', 'q_lvl_german'] }, 4, 'all', 600, 'wellbeing'),
    Q('q_apps', 'Applications sent this month', '', { type: 'sum', ind: 'apps_sent' }, 8, 'month', 250, 'career'),
    Q('q_de', 'German on 20 days this month', '', { type: 'days', ind: 'study_de' }, 20, 'month', 200, 'german'),
    Q('q_read', 'Reading on 20 days this month', '', { type: 'days', ind: 'reading' }, 20, 'month', 200, 'reading'),
    Q('q_focus', 'Off social media, 20 days this month', '', { type: 'days', ind: 'no_social' }, 20, 'month', 150, 'focus')
  );
  return { rev: REV, settings, skills, indicators, bars, quests };
}

/* Momentum: every to-do finished on a day lifts that day's positive habit XP (to-do XP itself is not boosted). */
const MOMENTUM = [0, 0.10, 0.18, 0.25];
const momentumFor = (n, S) => { const t = (S && S.momentum) || MOMENTUM; return t[Math.max(0, Math.min(n, t.length - 1))] || 0; };
function upgradeConfig(cfg) {
  if (!cfg || (cfg.rev || 0) >= REV) return cfg;
  const def = defaultConfig(), byId = {}; def.indicators.forEach(i => { byId[i.id] = i; });
  const from = cfg.rev || 0;
  if (from < 7) {
    for (const i of (cfg.indicators || [])) { const d = byId[i.id]; if (d && d.abs && d.kind === 'binary') { i.abs = true; i.optional = true; i.unitXp = d.unitXp; } }
    const sm = (cfg.indicators || []).find(i => i.id === 'smoked'); if (sm && !sm.alsoDebuff) sm.alsoDebuff = { skill: 'fitness', xp: -5 };
    const so = (cfg.indicators || []).find(i => i.id === 'social' && i.kind === 'need');
    if (so && Array.isArray(so.events) && !so.events.some(e => e.id === 'discord')) { const at = so.events.findIndex(e => e.id === 'call'); so.events.splice(at >= 0 ? at + 1 : so.events.length, 0, { id: 'discord', label: 'Discord sesh', fill: 10 }); }
  }
  if (from < 6) { const b = (cfg.indicators || []).find(i => i.id === 'meal_b'); if (b && b.slot === 'afternoon') b.slot = 'morning'; }
  if (from < 5 && cfg.settings) { cfg.settings.rhythm = cfg.settings.rhythm || {}; if (cfg.settings.rhythm[5] == null) cfg.settings.rhythm[5] = 'cheat'; cfg.settings.cheatFrom = cfg.settings.cheatFrom || '17:00'; }
  if (from < 4 && !(cfg.indicators || []).some(i => i.id === 'stretch_ham')) { const ni = JSON.parse(JSON.stringify(byId.stretch_ham)), at = (cfg.indicators || []).findIndex(i => i.id === 'walk'); if (at >= 0) cfg.indicators.splice(at, 0, ni); else cfg.indicators.push(ni); }
  if (from < 3) for (const i of (cfg.indicators || [])) {
    const d = byId[i.id]; if (!d) continue;
    if (['supp_protein', 'supp_mag', 'outfit'].includes(i.id)) i.slot = d.slot;
    if (d.slots) i.slots = d.slots.slice();
    if (i.kind === 'tier' && d.kind === 'tier') { for (const o of d.options) { const mine = (i.options || []).find(x => x.id === o.id); if (mine) mine.label = o.label; } }
    if (i.kind === 'rooms' && d.kind === 'rooms') {
      for (const r of d.rooms) { const mine = i.rooms.find(x => x.id === r.id); if (mine) { mine.decay = r.decay; mine.w = r.w; } else i.rooms.push(Object.assign({}, r)); }
      for (const t of d.tasks) { const mine = i.tasks.find(x => x.id === t.id); if (mine) mine.xp = t.xp; else i.tasks.push(Object.assign({}, t, { fill: Object.assign({}, t.fill) })); }
      i.taskXpScale = d.taskXpScale;
    }
  }
  cfg.rev = REV; return cfg;
}
function defaultState(today) {
  return { v: 2, config: defaultConfig(), logs: {}, months: {}, bonuses: [], claims: {}, todos: [], startDate: today };
}

/* ---------- kinds ---------- */
// bad: unlogged / blank counts as "assumed bad" for required indicators
const KIND_META = {
  binary: { bad: true }, zone: { bad: true }, ceil: { bad: true }, tier: { bad: true }, time: { bad: true },
  effort: { bad: true }, bar: { bad: true }, macros: {}, rating: {}, amount: {}, cashflow: { bad: true }, foodcost: {}, rooms: { always: true },
  need: { always: true }, count: { weekly: true }, workout: { weekly: true },
  weight: { always: true, weekly: true }, savings: { always: true, monthly: true }
};

function zoneScore(x, lo, hi, mn, mx) {
  if (x >= lo && x <= hi) return 1;
  if (x < lo) { const t = (x - mn) / (lo - mn); return t >= 0 ? t : Math.max(-0.4, t * 0.4); }
  const t = (mx - x) / (mx - hi); return t >= 0 ? t : Math.max(-0.4, t * 0.4);
}
function ceilScore(x, ideal, zero, bad) {
  if (x <= ideal) return 1;
  if (x <= zero) return 1 - (x - ideal) / (zero - ideal);
  if (x <= bad) return -0.4 * (x - zero) / (bad - zero);
  return -0.4;
}
function kcalBand(S) {
  const k = S.kcal;
  if (S.phase === 'bulk') return { lo: k, hi: k + 300, mn: k - 500, mx: k + 900 };
  if (S.phase === 'maintain') return { lo: k - 150, hi: k + 150, mn: k - 700, mx: k + 700 };
  return { lo: k - 300, hi: k, mn: k - 1000, mx: k + 500 };
}
const indTarget = (ind, S) => (ind.targetKey ? S[ind.targetKey] : ind.target);

/* ---------- handlers: return { xp, state, note } ---------- */
const H = {};
H.binary = (ind, c) => {
  if (ind.abs) { const on = (ind.id in c.v) && !!c.v[ind.id]; return { xp: on ? (ind.unitXp || 0) : 0, state: on ? 'ok' : 'none' }; }
  const F = c.full(ind);
  if (ind.invert) {
    if (!(ind.id in c.v)) return { xp: -c.S.assumedBad * F, state: 'blank' };
    return c.v[ind.id] ? { xp: F * (ind.falseScore != null ? ind.falseScore : -0.4), state: 'miss' } : { xp: F, state: 'ok' };
  }
  const val = (ind.id in c.v) ? !!c.v[ind.id] : (ind.defaultVal === true);
  if (val) return { xp: F, state: 'ok' };
  let neg = ind.defaultVal === true ? (ind.falseScore != null ? ind.falseScore : -0.4) : (ind.missScore != null ? ind.missScore : -0.15);
  if (ind.funHalf && c.prevDayType === 'fun') neg *= 0.5;
  return { xp: F * neg, state: 'miss' };
};
H.zone = (ind, c) => {
  const x = num(c.v[ind.id]); const F = c.full(ind);
  if (x == null) return { xp: -c.S.assumedBad * F, state: 'blank' };
  const s = zoneScore(x, ind.lo, ind.hi, ind.min, ind.max);
  return { xp: F * s, state: s >= 0.5 ? 'ok' : s >= 0 ? 'partial' : 'miss' };
};
H.ceil = (ind, c) => {
  const x = num(c.v[ind.id]); const F = c.full(ind);
  if (x == null) return { xp: -c.S.assumedBad * F, state: 'blank' };
  const k = (c.dayType === 'fun' && ind.funScale) ? ind.funScale : 1;
  const s = ceilScore(x, ind.ideal * k, ind.zero * k, ind.bad * k);
  return { xp: F * s, state: s >= 0.5 ? 'ok' : s >= 0 ? 'partial' : 'miss' };
};
H.tier = (ind, c) => {
  const opt = ind.options.find(o => o.id === c.v[ind.id]); const F = c.full(ind);
  if (!opt) return { xp: -c.S.assumedBad * F, state: 'blank' };
  let s = opt.s, note = '';
  if (ind.foodTreat && opt.id === 'treat') {
    if (c.dayType === 'cheat' && ind.id === 'meal_d') { s = 0; note = 'cheat evening'; }
    else if (c.dayType === 'fun' && c.T.funLeft > 0) { c.T.funLeft--; s = 0; note = 'fun-day allowance'; }
    else if (c.T.treatsLeft > 0) { c.T.treatsLeft--; s = 0; note = 'planned allowance'; }
    else note = 'over the weekly allowance';
  }
  return { xp: F * s, state: s >= 0.3 ? 'ok' : s >= 0 ? 'neutral' : 'miss', note };
};

H.time = (ind, c) => {
  const F = c.full(ind); const t = c.v[ind.id];
  if (!t) return { xp: -c.S.assumedBad * F, state: 'blank' };
  const late = toMin(t) - toMin(c.S.wakeBy);
  const steps = late <= 0 ? 0 : Math.ceil(late / 30);
  const s = Math.max(-0.4, 1 - steps * (c.S.wakePenalty != null ? c.S.wakePenalty : 0.3));
  return { xp: F * s, state: s >= 0.5 ? 'ok' : s >= 0 ? 'partial' : 'miss', note: late <= 0 ? 'on time' : late + ' min late' };
};
H.effort = (ind, c) => {
  const F = c.full(ind); const tgt = ind.target * c.tScale;
  const x = num(c.v[ind.id]) || 0;
  const n = ind.everyN || 1;
  const last = c.T.lastDone[ind.id];
  const since = last ? diffDays(c.d, last) : n;
  if (x > 0) {
    const r = x / tgt;
    const g = r <= 1 ? r : r <= 2 ? 1 + 0.8 * (r - 1) : 1.8 + 0.6 * (Math.min(r, 4) - 2);
    const span = Math.min(n, Math.max(1, since));
    if (r >= 0.5) c.T.lastDone[ind.id] = c.d;
    return { xp: F * g * span, state: r >= 0.6 ? 'ok' : 'partial', note: span > 1 ? 'covers ' + span + ' days' : '' };
  }
  if (ind.relax && c.dayType === 'rest') return { xp: F * c.S.restCredit, state: 'rest', note: 'planned rest' };
  if (ind.relax && c.dayType === 'fun') return { xp: 0, state: 'neutral', note: 'fun day' };
  if (n > 1 && last && since < n) return { xp: 0, state: 'neutral', note: 'not due yet' };
  return { xp: F * (ind.missScore != null ? ind.missScore : -0.15), state: 'miss' };
};
H.bar = (ind, c) => {
  const F = c.full(ind); const x = num(c.v[ind.id]);
  if (x == null) return { xp: -c.S.assumedBad * F, state: 'blank' };
  const r = x / (indTarget(ind, c.S) * c.tScale);
  if (r < 0.25) return { xp: F * (ind.missScore != null ? ind.missScore : -0.2), state: 'miss' };
  return { xp: F * Math.min(r, 1), state: r >= 1 ? 'ok' : 'partial' };
};
H.macros = (ind, c) => {
  const e = c.v[ind.id]; const F = c.full(ind);
  if (!e || (num(e.kcal) == null && num(e.protein) == null)) return { xp: 0, state: 'none' };
  const pr = num(e.protein), kc = num(e.kcal);
  const pS = pr == null ? 0.5 : clamp(pr / c.S.protein, 0, 1);
  let kS = 0.5; if (kc != null) { const b = kcalBand(c.S); kS = zoneScore(kc, b.lo, b.hi, b.mn, b.mx); }
  const s = 0.5 * pS + 0.5 * kS;
  return { xp: F * s, state: s >= 0.6 ? 'ok' : s >= 0 ? 'partial' : 'miss', note: 'verified' };
};
H.workout = (ind, c) => {
  const e = c.v[ind.id];
  if (!e || !(num(e.min) > 0)) return { xp: 0, state: 'none' };
  const F = c.full(ind), goal = ind.goal, unit = F * 7 / goal;
  const mins = num(e.min), tgt = ind.target * c.tScale, r = mins / tgt;
  const g = r <= 1 ? r : r <= 2 ? 1 + 0.4 * (r - 1) : 1.4 + 0.2 * (Math.min(r, 3) - 2);
  const hist = c.T.hist.workout[ind.id] || (c.T.hist.workout[ind.id] = {});
  const type = e.type || 'other'; const arr = hist[type] || (hist[type] = []);
  let m = 1, note = '';
  const load = num(e.load);
  if (load > 0) {
    const base = arr.slice(-5);
    if (base.length >= 2) { m = 1 + clamp((load / mean(base) - 1) * 2.5, 0, 0.5); if (m > 1.001) note = 'overload ×' + m.toFixed(2); }
    arr.push(load);
  }
  const cnt = (c.T.weekCount[ind.id] || 0) + 1; c.T.weekCount[ind.id] = cnt;
  const wm = cnt <= goal ? 1 : cnt <= goal + 2 ? 0.5 : 0.2;
  if (wm < 1) note += (note ? ', ' : '') + 'beyond weekly goal';
  c.sess = { min: mins, type };
  return { xp: unit * g * m * wm, state: r >= 0.6 ? 'ok' : 'partial', note };
};
H.count = (ind, c) => {
  const n = Math.max(0, Math.floor(num(c.v[ind.id]) || 0));
  if (ind.abs) { const k = Math.min(n, ind.dayCap || 99); return { xp: (ind.unitXp || 0) * k, state: k ? 'ok' : 'none' }; }
  if (!n) return { xp: 0, state: 'none' };
  const F = c.full(ind), goal = ind.goal, unit = F * 7 / goal, before = c.T.weekCount[ind.id] || 0;
  let xp = 0; for (let k = 1; k <= n; k++) { const cc = before + k; xp += unit * (cc <= goal ? 1 : cc <= 2 * goal ? 0.5 : 0.2); }
  c.T.weekCount[ind.id] = before + n;
  return { xp, state: 'ok' };
};
H.rating = (ind, c) => {
  const x = num(c.v[ind.id]);
  if (x == null) return { xp: 0, state: 'none' };
  const arr = c.T.hist.rating[ind.id] || (c.T.hist.rating[ind.id] = []);
  arr.push(x);
  const last7 = arr.slice(-7), prior = arr.slice(-35, -7);
  const ema = mean(last7), fl = ind.floor != null ? ind.floor : 4, ce = ind.ceil != null ? ind.ceil : 9;
  const lo = ind.noPenalty ? 0 : -0.4;
  const abs = clamp((ema - fl) / (ce - fl), lo, 1);
  const trend = prior.length >= 5 ? clamp((ema - mean(prior)) / 3, -0.1, 0.15) : 0;
  const s = clamp(abs + trend, lo, 1);
  return { xp: c.full(ind) * s, state: s >= 0.5 ? 'ok' : 'partial', note: '7-day avg ' + ema.toFixed(1) };
};
H.amount = (ind, c) => {
  const x = num(c.v[ind.id]);
  if (!(x > 0)) return { xp: 0, state: 'none' };
  return { xp: Math.min(ind.cap || 60, (ind.unitXp || 12) * Math.log2(1 + x / (ind.ref || 25))), state: 'ok' };
};
H.need = (ind, c) => {
  let L = c.T.need[ind.id] != null ? c.T.need[ind.id] : (ind.start != null ? ind.start : 60);
  if (!c.waive) L -= ind.decay;
  if (c.logged) for (const id of (c.v[ind.id] || [])) { const ev = ind.events.find(e => e.id === id); if (ev) L += ev.fill; }
  L = clamp(L, 0, 100); c.T.need[ind.id] = L; c.needLevel[ind.id] = L;
  const s = clamp((L - 15) / 55, -0.4, 1);
  return { xp: c.full(ind) * s, state: s >= 0.5 ? 'ok' : s >= 0 ? 'partial' : 'miss', note: 'bar ' + Math.round(L) + '%' };
};
H.weight = (ind, c) => {            // daily: just remember the value; weekly review happens separately
  const x = num(c.v[ind.id]);
  if (x != null && x > 0) { (c.T.hist.weight[ind.id] || (c.T.hist.weight[ind.id] = [])).push({ d: c.d, v: x }); }
  return { xp: 0, state: x != null ? 'ok' : 'none' };
};
H.savings = () => ({ xp: 0, state: 'none' });
const wharm = a => a.reduce((s, p) => s + p[1], 0) / a.reduce((s, p) => s + p[1] / Math.max(p[0], 5), 0);
H.rooms = (ind, c) => {
  const R = c.T.rooms[ind.id] || (c.T.rooms[ind.id] = {});
  for (const r of ind.rooms) {
    if (R[r.id] == null) R[r.id] = r.start != null ? r.start : 70;
    if (!c.waive) R[r.id] -= r.decay;
  }
  const gained = {}; let bonus = 0; const done = c.logged ? (c.v[ind.id] || []) : [];
  for (const tid of done) {
    const tk = ind.tasks.find(t => t.id === tid); if (!tk) continue;
    for (const rid in tk.fill) gained[rid] = (gained[rid] || 0) + tk.fill[rid];
    bonus += (tk.xp || 0) * (ind.taskXpScale != null ? ind.taskXpScale : 0.5) * (c.sf || 1);
  }
  const cap = ind.taskCap || 80;
  for (const r of ind.rooms) { R[r.id] = clamp(R[r.id] + Math.min(gained[r.id] || 0, cap), 0, 100); }
  const levels = {}; for (const r of ind.rooms) levels[r.id] = R[r.id];
  const total = wharm(ind.rooms.map(r => [R[r.id], r.w || 1]));
  let low = ind.rooms[0]; for (const r of ind.rooms) if (R[r.id] < R[low.id]) low = r;
  c.roomTotals[ind.id] = total; c.roomDetail[ind.id] = { rooms: levels, total, lowest: low.id };
  const s = clamp((total - 50) / 35, -0.4, 1);
  return { xp: c.full(ind) * s + bonus, state: total >= 60 ? 'ok' : total >= 30 ? 'partial' : 'miss', note: 'household ' + Math.round(total) + '%, lowest ' + low.name + ' ' + Math.round(R[low.id]) + '%' };
};
H.cashflow = (ind, c) => {
  const F = c.full(ind), w = c.S.spendWeight != null ? c.S.spendWeight : 1.2;
  const sp = num(c.v.spent), er = num(c.v.earned) || 0;
  const ideal = ind.ideal || 20, zero = ind.zero || ideal * 2, bad = ind.bad || ideal * 4.5;
  const k = c.dayType === 'fun' ? (ind.funScale || 2) : 1;
  const earn = Math.min(ind.earnCap || 60, (ind.earnUnit || 12) * Math.log2(1 + er / (ind.ref || 25)));
  let xp, st, note = '';
  if (sp == null) { xp = -c.S.assumedBad * F; st = 'blank'; }
  else { let s = ceilScore(sp, ideal * k, zero * k, bad * k); if (s < 0) s *= w; xp = F * s; st = s >= 0.5 ? 'ok' : s >= 0 ? 'partial' : 'miss'; }
  if (earn > 0) { xp += earn; note = 'earned/saved ' + Math.round(er); if (st === 'blank') st = 'partial'; }
  c.cash = { spent: sp, earned: er };
  return { xp, state: st, note };
};
H.foodcost = (ind, c) => {
  const F = c.full(ind), sc = { low: 1, medium: 0.35, high: -0.3 }, eur = c.S.foodCost || { low: 4, high: 10 };
  let sum = 0, n = 0, euro = 0;
  for (const src of (ind.sources || [])) {
    const cost = c.v[src + '_cost']; if (!cost || c.v[src] == null) continue;
    let s = sc[cost]; if (c.v[src] === 'treat' && s > 0) s *= 0.5;
    sum += s; n++; euro += cost === 'low' ? eur.low : cost === 'high' ? eur.high : (eur.low + eur.high) / 2;
  }
  c.foodEur = euro;
  if (!n) return { xp: 0, state: 'none' };
  const s = clamp(sum / n, -0.4, 1);
  return { xp: F * s, state: s >= 0.5 ? 'ok' : s >= 0 ? 'partial' : 'miss', note: 'est. food cost EUR ' + Math.round(euro) };
};

function weightScore(rate, phase) {
  if (phase === 'bulk') return rate >= 0.1 && rate <= 0.5 ? 1 : (rate > 0 && rate < 0.1) || (rate > 0.5 && rate < 0.8) ? 0.5 : rate >= 0.8 ? 0.1 : -0.1;
  if (phase === 'maintain') { const a = Math.abs(rate); return a <= 0.3 ? 1 : a <= 0.6 ? 0.5 : 0; }
  if (rate <= -0.25 && rate >= -1.0) return 1;
  if (rate < -1.0) return rate >= -1.5 ? 0.3 : -0.1;
  if (rate < 0) return 0.5;
  return rate <= 0.3 ? 0 : -0.2;
}

/* ---------- normalisation: every skill hands out ~skillBudget XP on a perfect day ---------- */
function normalise(cfg) {
  const B = cfg.settings.skillBudget, req = {}, all = {}, full = {};
  for (const i of cfg.indicators) {
    if (i.off) continue;
    all[i.skill] = (all[i.skill] || 0) + i.w;
    if (!i.optional && !i.abs) req[i.skill] = (req[i.skill] || 0) + i.w;
  }
  for (const i of cfg.indicators) { const den = req[i.skill] || all[i.skill] || 1; full[i.id] = B * i.w / den; }
  return full;
}
const backfillFactor = (delay, S) => { for (const b of S.backfill) if (delay <= b.max) return b.f; return 0.5; };

/* ---------- main replay ---------- */
function compute(state, opts) {
  opts = opts || {};
  const cfg = state.config, S = cfg.settings, today = opts.today;
  const logs = state.logs || {};
  const inds = cfg.indicators.filter(i => !i.off);
  const skillIds = cfg.skills.map(s => s.id);
  const FULL = normalise(cfg);
  const logDates = Object.keys(logs).sort();
  let first = state.startDate || logDates[0] || today;
  if (logDates[0] && logDates[0] < first) first = logDates[0];
  if (first > today) first = today;

  const T = { weekCount: {}, weekWaive: 0, treatsLeft: S.treatsPerWeek, funLeft: 0, lastDone: {}, need: {}, tokensUsed: 0,
    rooms: {}, hist: { rating: {}, weight: {}, workout: {} } };
  const days = {};
  let prevType = 'normal';

  for (let d = first; d <= today; d = addDays(d, 1)) {
    const dw = dowOf(d);
    if (dw === 1) { T.weekCount = {}; T.weekWaive = 0; T.treatsLeft = S.treatsPerWeek; }
    if (d.slice(8) === '01') T.tokensUsed = 0;
    const day = logs[d] || {}, v = day.v || {};
    const dayType = S.rhythm[dw] || 'normal';
    T.funLeft = dayType === 'fun' ? S.funTreats : 0;
    const mode = day.mode || 'normal';
    let tokenOk = false;
    if (day.token && T.tokensUsed < S.tokensPerMonth) { T.tokensUsed++; tokenOk = true; }
    const waive = mode !== 'normal' || tokenOk;
    if (waive) T.weekWaive++;
    const isToday = d === today;

    const slots = {};
    for (const sl of SLOTS) {
      const rec = day.slots && day.slots[sl];
      if (rec) { const delay = Math.max(0, diffDays(rec.at || d, d)); slots[sl] = { logged: true, delay, factor: backfillFactor(delay, S) }; }
      else slots[sl] = { logged: false, delay: null, factor: 1 };
    }

    const ctx = { d, v, S, T, dayType, prevDayType: prevType, waive, tScale: waive ? (S.modeScale[mode] || 1) : 1,
      full: ind => FULL[ind.id], needLevel: {}, sess: null, logged: false, sf: 1, roomTotals: {}, roomDetail: {}, cash: null, foodEur: 0 };
    const out = {};
    for (const ind of inds) {
      const meta = KIND_META[ind.kind] || {};
      let sl = slots[ind.slot] || { logged: false, factor: 1 }, partial = false;
      if (!sl.logged && ind.slots && ind.slots.length > 1 && (ind.id in v)) {
        const hit = ind.slots.map(x => slots[x]).filter(x => x && x.logged);
        if (hit.length) { sl = { logged: true, factor: Math.max(...hit.map(x => x.factor)) }; partial = true; }
      }
      ctx.logged = sl.logged; ctx.sf = sl.factor || 1;
      let r;
      if (!sl.logged && !meta.always && !meta.weekly) {
        if (ind.optional || !meta.bad) r = { xp: 0, state: 'none' };
        else if (isToday) r = { xp: 0, state: 'pending' };
        else r = { xp: -S.assumedBad * FULL[ind.id], state: 'unlogged' };
      } else r = H[ind.kind] ? H[ind.kind](ind, ctx) : { xp: 0, state: 'none' };
      if (partial && isToday && r.xp < 0) r = { xp: 0, state: 'pending' };
      if (r.xp < 0 && waive) { r = { xp: 0, state: 'waived', note: r.note }; }
      const f = (r.xp > 0 && !meta.always) ? sl.factor : 1;
      out[ind.id] = { xp: r.xp * f, raw: r.xp, f, state: r.state, note: r.note || '', skill: ind.skill };
      if (f < 1) out[ind.id].note += (out[ind.id].note ? ', ' : '') + 'backfill ×' + f;
      if (ind.id === 'workout' && ctx.sess) out[ind.id].sess = ctx.sess;
    }

    // modifiers (e.g. non-sober sleep dampens sleep XP)
    for (const ind of inds) {
      if (!ind.modifies || !out[ind.id] || out[ind.id].state !== 'miss') continue;
      const tgt = out[ind.modifies.id]; if (!tgt) continue;
      let mult = ind.modifies.mult; if (ind.funHalf && prevType === 'fun') mult = (1 + mult) / 2;
      if (tgt.xp > 0) { tgt.note += (tgt.note ? ', ' : '') + 'non-sober ×' + mult.toFixed(2); tgt.xp *= mult; }
    }

    // daily priority (counts only if the morning check-in was done on the day itself)
    let priority = null;
    if (day.priority && out[day.priority] && slots.morning.logged && slots.morning.delay === 0 && out[day.priority].xp > 0) {
      const o = out[day.priority];
      const bonus = Math.min(o.xp * S.priorityMult, S.priorityCap);
      priority = { id: day.priority, bonus, skill: o.skill };
    }

    // periodic reviews (after the week / month is over)
    if (dw === 0 && d < today) {
      for (const ind of inds) {
        const o = out[ind.id]; if (!o) continue;
        if ((ind.kind === 'count' && !ind.abs) || ind.kind === 'workout') {
          const eff = ind.goal * Math.max(0, 7 - T.weekWaive) / 7;
          if (eff >= 1) {
            const cnt = T.weekCount[ind.id] || 0, pot = FULL[ind.id] * 7;
            const pen = cnt === 0 ? -0.2 * pot : cnt / eff < 0.5 ? -0.08 * pot : 0;
            if (pen) { o.xp += pen; o.note += (o.note ? ', ' : '') + 'weekly goal missed (' + cnt + '/' + ind.goal + ')'; o.weeklyPen = pen; }
          }
        }
        if (ind.kind === 'weight') {
          const h = T.hist.weight[ind.id] || [];
          const cur = h.filter(e => e.d <= d && e.d > addDays(d, -7)).map(e => e.v);
          const prev = h.filter(e => e.d <= addDays(d, -7) && e.d > addDays(d, -14)).map(e => e.v);
          if (cur.length >= 3 && prev.length >= 3) {
            const rate = (mean(cur) / mean(prev) - 1) * 100;
            const s = weightScore(rate, S.phase);
            const xp = FULL[ind.id] * 7 * s;
            o.xp += (xp > 0 && waive) ? xp : (xp < 0 && waive ? 0 : xp);
            o.note += (o.note ? ', ' : '') + 'weekly trend ' + (rate >= 0 ? '+' : '') + rate.toFixed(2) + '%';
          }
        }
      }
    }
    if (d < today && d === lastOfMonth(monthOf(d))) {
      const rec = (state.months || {})[monthOf(d)];
      const ind = inds.find(i => i.kind === 'savings');
      if (ind && rec && num(rec.net) > 0 && num(rec.saved) != null) {
        const rate = rec.saved / rec.net;
        const s = rate >= 0 ? Math.min(rate / (ind.target || 0.3), 1) : Math.max(rate / (ind.target || 0.3), -0.4);
        let xp = FULL[ind.id] * 30 * s; if (xp < 0 && waive) xp = 0;
        out[ind.id].xp += xp; out[ind.id].note = 'savings rate ' + Math.round(rate * 100) + '%'; out[ind.id].state = xp >= 0 ? 'ok' : 'miss';
      }
    }

    // catch-up: a real workout cancels two missed movement days in a row
    let catchUp = null;
    const cu = S.catchUp;
    if (cu && cu.on && out.workout && out.workout.sess && out.workout.sess.min >= cu.minMin) {
      const r1 = days[addDays(d, -1)], r2 = days[addDays(d, -2)];
      const miss = r => r && r.inds[cu.indicator] && r.inds[cu.indicator].state === 'miss' && !(r.inds.workout && r.inds.workout.sess);
      if (miss(r1) && miss(r2)) {
        for (const r of [r1, r2]) {
          const o = r.inds[cu.indicator]; const back = -o.xp;
          r.skills[cu.skill].neg += back; o.xp = 0; o.state = 'madeup'; o.note = 'made up by a workout';
        }
        catchUp = { days: [addDays(d, -2), addDays(d, -1)] };
      }
    }

    // accumulate per skill
    const sk = {};
    for (const id of skillIds) sk[id] = { pos: 0, neg: 0, flat: 0 };
    for (const ind of inds) { const o = out[ind.id]; if (!sk[o.skill]) continue; if (o.xp > 0) sk[o.skill].pos += o.xp; else sk[o.skill].neg += o.xp; }
    for (const ind of inds) {   // side effects on another skill (smoking dents fitness a little)
      const a = ind.alsoDebuff, o = out[ind.id]; if (!a || !o || o.state !== 'miss' || waive || !sk[a.skill]) continue;
      sk[a.skill].neg += a.xp; o.also = { skill: a.skill, xp: a.xp }; o.note += (o.note ? ', ' : '') + a.xp + ' ' + a.skill;
    }
    if (priority && sk[priority.skill]) sk[priority.skill].pos += priority.bonus;
    if (sk.awareness) {
      let a = 0;
      for (const sl of SLOTS) {
        if (slots[sl].logged) a += S.slotLogXp * slots[sl].factor;
        else if (!isToday && !waive) a -= S.assumedBad * S.slotLogXp;
      }
      if (a > 0) sk.awareness.pos += a; else sk.awareness.neg += a;
    }
    for (const b of (state.bonuses || [])) if (b.date === d && sk[b.skill]) sk[b.skill].flat += b.xp;

    const todosDone = (state.todos || []).filter(t => t.done === d).length, momentum = momentumFor(todosDone, S);
    days[d] = { d, dow: dw, todosDone, momentum, dayType, mode, tokenOk, tokenWanted: !!day.token, waive, slots, inds: out, skills: sk, priority, catchUp, need: Object.assign({}, T.need, ctx.roomTotals), rooms: ctx.roomDetail, cash: ctx.cash, foodEur: ctx.foodEur };
    prevType = dayType;
  }

  /* ---- pass 2: skill XP, form, loss cap, weekly consistency ---- */
  const curve = S.curve || DEFAULT_CURVE;
  const SK = {};
  for (const s of cfg.skills) SK[s.id] = { id: s.id, xp: 0, ema: 0.5, loss: [], weekRaw: 0, weekDays: 0, weekStreak: 0, series: [], lastR: null };
  const order = Object.keys(days).sort();
  for (const d of order) {
    const day = days[d];
    for (const s of cfg.skills) {
      const a = day.skills[s.id], k = SK[s.id];
      const form = 0.7 + 0.6 * clamp(k.ema, 0, 1);
      const gainForm = a.pos * form * (1 + (day.momentum || 0));
      const info = levelInfo(k.xp, curve);
      const gap = info.next ? info.next - info.cur : levelTable(curve)[99] - levelTable(curve)[98];
      const recent = k.loss.slice(-6).reduce((x, y) => x + y, 0);
      const allowed = Math.max(0, S.lossCapFrac * gap - recent);
      const loss = Math.min(-a.neg, allowed);
      k.loss.push(loss); if (k.loss.length > 7) k.loss.shift();
      let gain = gainForm + a.flat;
      const raw = a.pos + a.neg;
      if (!day.waive) { k.weekRaw += raw; k.weekDays++; k.ema += S.formAlpha * (clamp(raw / S.skillBudget, -0.5, 1.2) - k.ema); }
      let cons = 0;
      if (day.dow === 0 && d < today) {
        if (k.weekDays >= 3) {
          const r = k.weekRaw / (k.weekDays * S.skillBudget);
          cons = S.skillBudget * k.weekDays * 0.12 * clamp((r - 0.5) / 0.5, 0, 1);
          k.weekStreak = r >= 0.6 ? k.weekStreak + 1 : 0; k.lastR = r;
        }
        k.weekRaw = 0; k.weekDays = 0;
      }
      gain += cons;
      k.xp = Math.max(0, k.xp + gain - loss);
      a.gain = gain; a.loss = loss; a.form = form; a.cons = cons; a.p = clamp(raw / S.skillBudget, -0.5, 1.2);
      const li = levelInfo(k.xp, curve);
      k.series.push({ d, xp: k.xp, level: li.level });
    }
  }
  const skills = {};
  let totalLevel = 0, totalXp = 0;
  for (const s of cfg.skills) {
    const k = SK[s.id], li = levelInfo(k.xp, curve);
    skills[s.id] = Object.assign({ id: s.id, form: 0.7 + 0.6 * clamp(k.ema, 0, 1), ema: k.ema, weekStreak: k.weekStreak, lastWeekR: k.lastR, series: k.series }, li);
    totalLevel += li.level; totalXp += k.xp;
  }

  /* ---- today's derived info ---- */
  const t = days[today] || null;
  const todayXp = t ? cfg.skills.reduce((x, s) => x + (t.skills[s.id].gain - t.skills[s.id].loss), 0) : 0;
  const wk = weekStart(today), weekly = [];
  for (const ind of inds) {
    if (!((ind.kind === 'count' && !ind.abs) || ind.kind === 'workout')) continue;
    let cnt = 0;
    for (let d = wk; d <= today; d = addDays(d, 1)) {
      const dl = logs[d]; if (!dl || !dl.v) continue;
      const x = dl.v[ind.id]; cnt += (x && typeof x === 'object') ? (num(x.min) > 0 ? 1 : 0) : (Math.floor(num(x) || 0));
    }
    weekly.push({ id: ind.id, name: ind.name, count: cnt, goal: ind.goal, skill: ind.skill });
  }
  const tokens = { per: S.tokensPerMonth, used: 0, left: S.tokensPerMonth };
  for (const d of order) if (monthOf(d) === monthOf(today) && days[d].tokenOk) tokens.used++;
  tokens.left = Math.max(0, tokens.per - tokens.used);

  const alerts = [];
  const cu = S.catchUp;
  if (cu && cu.on && days[addDays(today, -1)] && days[addDays(today, -2)]) {
    const m = r => r.inds[cu.indicator] && r.inds[cu.indicator].state === 'miss' && !(r.inds.workout && r.inds.workout.sess);
    if (m(days[addDays(today, -1)]) && m(days[addDays(today, -2)]) && !(t && t.inds.workout && t.inds.workout.sess && t.inds.workout.sess.min >= cu.minMin))
      alerts.push({ type: 'catchup', text: 'Catch-up quest: two days without movement. A ' + cu.minMin + '+ minute workout today cancels both penalties.' });
  }
  const wkOut = weekly.find(w => w.id === 'workout');
  if (wkOut && wkOut.count > wkOut.goal + 1) alerts.push({ type: 'rest', text: 'You are past your weekly workout goal. Extra sessions earn less XP now, so recovery is the smart move.' });
  for (const back of [1, 2]) {
    const r = days[addDays(today, -back)];
    if (r) { const missing = SLOTS.filter(sl => !r.slots[sl].logged && !r.waive); if (missing.length) alerts.push({ type: 'backfill', text: (back === 1 ? 'Yesterday' : '2 days ago') + ': ' + missing.join(', ') + ' check-in not logged. Backfill within 48h for full XP.', date: r.d }); }
  }

  const res = { days, skills, totalLevel, totalXp, todayXp, weekly, tokens, alerts, today, first, full: FULL };
  res.bars = barsFor(state, res, opts.viewDate || today);
  { const byId = {}, qd = opts.viewDate || today; for (const q of (cfg.quests || [])) if (!q.metric || q.metric.type !== 'meta') byId[q.id] = evalQuest(q, state, res, qd, byId); for (const q of (cfg.quests || [])) if (q.metric && q.metric.type === 'meta') byId[q.id] = evalQuest(q, state, res, qd, byId); res.quests = (cfg.quests || []).map(q => byId[q.id]); }
  return res;
}

/* ---------- bars (live, read straight from today's values) ---------- */
function liveFraction(ind, v, S, needLevel) {
  const x = v[ind.id];
  switch (ind.kind) {
    case 'zone': { const n = num(x); return n == null ? 0 : clamp(zoneScore(n, ind.lo, ind.hi, ind.min, ind.max), 0, 1); }
    case 'bar': { const n = num(x); return n == null ? 0 : clamp(n / indTarget(ind, S), 0, 1); }
    case 'tier': { const o = ind.options.find(o => o.id === x); return o ? (o.bar != null ? o.bar : clamp(o.s, 0, 1)) : 0; }
    case 'binary': if (ind.invert) return (ind.id in v && !x) ? 1 : 0; return (ind.id in v ? !!x : ind.defaultVal === true) ? 1 : 0;
    case 'rating': { const n = num(x); return n == null ? 0 : n / 10; }
    case 'need': case 'rooms': return (needLevel != null ? needLevel : 0) / 100;
    default: return 0;
  }
}
function barsFor(state, res, date) {
  const cfg = state.config, day = (state.logs || {})[date] || {}, v = day.v || {};
  const dr = res.days[date];
  return (cfg.bars || []).map(b => {
    const srcs = b.src.map(id => cfg.indicators.find(i => i.id === id)).filter(i => i && !i.off);
    if (!srcs.length) return null;
    const vals = srcs.map(i => liveFraction(i, v, cfg.settings, dr && dr.need ? dr.need[i.id] : null));
    const pct = Math.round(100 * mean(vals));
    const any = srcs.some(i => i.kind === 'need' || i.kind === 'rooms' || (i.id in v) || (i.defaultVal === true && day.slots && day.slots[i.slot]));
    return { id: b.id, name: b.name, pct, any, kind: srcs[0].kind };
  }).filter(Boolean);
}

/* ---------- quests ---------- */
function questPeriod(q, today, state) {
  if (q.period === 'day') return { from: today, to: today, key: today };
  if (q.period === 'week') { const s = weekStart(today); return { from: s, to: addDays(s, 6), key: s }; }
  if (q.period === 'month') { const ym = monthOf(today); return { from: ym + '-01', to: lastOfMonth(ym), key: ym }; }
  if (q.period === 'all') return { from: (state && state.startDate) || today, to: today, key: 'all' };
  return { from: q.from || today, to: q.to || today, key: (q.from || '') + '_' + (q.to || '') };
}
const cmp = (x, op, val) => {
  if (x === undefined || x === null) return false;
  if (typeof val === 'boolean') return !!x === val;
  const n = Number(x); if (isNaN(n)) return false;
  return op === '>=' ? n >= val : op === '<=' ? n <= val : op === '>' ? n > val : op === '<' ? n < val : n === val;
};
function condValue(cfg, id, day) {
  const v = (day && day.v) || {};
  if (id in v) return v[id];
  const ind = cfg.indicators.find(i => i.id === id);
  if (ind && ind.kind === 'binary' && ind.defaultVal === true && day && day.slots && day.slots[ind.slot]) return true;
  return undefined;
}
function evalQuest(q, state, res, today, byId) {
  const cfg = state.config, P = questPeriod(q, today, state), m = q.metric, logs = state.logs || {};
  const end = P.to < res.today ? P.to : res.today;
  let val = 0, n = 0;
  const sessOf = (x, wt) => !!(x && typeof x === 'object' && num(x.min) > 0 && (!wt || x.type === wt));
  if (m.type === 'level') { const k = res.skills[m.skill]; val = k ? k.level : 0; }
  else if (m.type === 'meta') { for (const id of (m.ids || [])) { const sub = byId && byId[id]; if (sub && (sub.done || sub.claimed)) val++; } }
  else if (m.type === 'weeks') {
    let run = 0, best = 0; const cur = weekStart(res.today);
    for (let w = weekStart(P.from); w <= cur; w = addDays(w, 7)) {
      let cnt = 0;
      for (let d = w; d <= addDays(w, 6) && d <= res.today; d = addDays(d, 1)) {
        const x = logs[d] && logs[d].v ? logs[d].v[m.ind] : null;
        if (x && typeof x === 'object' ? sessOf(x, m.wtype) : num(x) > 0) cnt++;
      }
      if (cnt >= (m.min || 1)) { run++; best = Math.max(best, run); } else if (w !== cur) run = 0;
    }
    val = best;
  } else {
    for (let d = P.from; d <= end; d = addDays(d, 1)) {
      const dl = logs[d], r = res.days[d];
      if (!dl && m.type !== 'days') continue;
      const v = (dl && dl.v) || {};
      if (m.type === 'days') {
        if (m.weekdays && [0, 6].includes(dowOf(d))) continue;
        if (m.op) {
          if (!cmp(condValue(cfg, m.ind, dl), m.op, m.val)) continue;
          if (m.and && !cmp(condValue(cfg, m.and.ind, dl), m.and.op, m.and.val)) continue;
          if (m.all && m.all.some(c2 => !cmp(condValue(cfg, c2.ind, dl), c2.op, c2.val))) continue;
          val++;
        } else if (r && r.inds[m.ind] && r.inds[m.ind].xp > 0) val++;
      } else if (m.type === 'wk_max') { const x = num(v[m.ind] && v[m.ind][m.field]); if (x != null) val = Math.max(val, x); }
      else if (m.type === 'wk_best') { const w = v[m.ind]; if (sessOf(w, m.wtype)) { const x = num(w[m.field]); if (x != null) val = Math.max(val, x); } }
      else if (m.type === 'wk_count') { if (sessOf(v[m.ind], m.wtype)) val++; }
      else { let x = v[m.ind]; if (x && typeof x === 'object') x = num(x.min) > 0 ? 1 : 0; x = num(x); if (x != null) { val += x; n++; } }
    }
    if (m.type === 'avg') val = n ? val / n : 0;
  }
  const claim = (state.claims || {})[q.id + ':' + P.key];
  return { id: q.id, name: q.name, reward: q.reward, target: q.target, value: val, done: val >= q.target, claimed: !!claim, key: P.key, from: P.from, to: P.to, xp: q.xp, skill: q.skill, period: q.period, mtype: m.type };
}
function claimQuest(state, q, today) {
  const P = questPeriod(q, today, state), key = q.id + ':' + P.key;
  state.claims = state.claims || {}; if (state.claims[key]) return false;
  state.claims[key] = { date: today };
  if (q.xp) { state.bonuses = state.bonuses || []; state.bonuses.push({ date: today, skill: q.skill, xp: q.xp, label: 'Quest: ' + q.name }); }
  return true;
}


/* ---------- recommendations: a transparent planner over today's state ---------- */
function recommend(state, res, date, nowIn) {
  const cfg = state.config, S = cfg.settings, logs = state.logs || {};
  const day = logs[date] || {}, v = day.v || {}, dr = res.days[date];
  const dw = dowOf(date), dayType = S.rhythm[dw] || 'normal';
  const nowMin = nowIn == null ? 720 : (nowIn <= 24 ? nowIn * 60 : nowIn);
  const stage = nowMin < 720 ? 'morning' : nowMin < 1080 ? 'afternoon' : 'night';
  const ind = id => cfg.indicators.find(i => i.id === id && !i.off);
  const fmt = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const logged = sl => !!(day.slots && day.slots[sl]);
  const waived = !!(dr && dr.waive);
  const skillName = id => (cfg.skills.find(s => s.id === id) || {}).name || id;
  const wake = toMin(S.wakeBy), bedMin = ((wake - 8 * 60 - 15) + 1440) % 1440;
  const cheat = dayType === 'cheat', cF = toMin(S.cheatFrom || '17:00'), cheatOn = cheat && nowMin >= cF;
  const limit = cheat && nowMin < cF ? Math.min(bedMin - 60, cF) : bedMin - 60;   // flexible blocks must end before the wrap-up (and before a cheat evening)
  const wsum = res.weekly.find(w => w.id === 'workout');
  const scale = dayType === 'fun' ? 0.5 : 1;
  const rest = dayType === 'rest';

  const L = { A: [], B: [], C: [], D: [] };
  const blocks = (list, id, label, remain, skill, extra) => {
    let left = remain;
    while (left > 5) { const m = left <= 75 ? Math.max(15, Math.ceil(left / 15) * 15) : 60; list.push({ kind: 'work', id, mins: m, text: label + ', ' + m + ' min' + (extra ? ' (' + extra + ')' : ''), short: label.toLowerCase() + ' ' + m + ' min', skill }); left -= m; }
  };
  const left = (id, mult) => { const i = ind(id); return i ? Math.max(0, i.target * (mult == null ? scale : mult) - (E_num(v[id]) || 0)) : 0; };
  const E_num = x => (x === undefined || x === null || x === '' || isNaN(Number(x))) ? null : Number(x);
  if (!waived) {
    if (!rest && !cheatOn) {
      const wkc = k => { const w = res.weekly.find(x => x.id === k); return w ? k + ' ' + w.count + '/' + w.goal : ''; };
      const ji = ind('job_time'); if (ji) blocks(L.A, 'job_time', 'Applications and job search', left('job_time'), ji.skill, 'this week: ' + res.weekly.filter(w => ['roles_found', 'apps_sent'].includes(w.id)).map(w => w.name.toLowerCase() + ' ' + w.count + '/' + w.goal).join(', '));
      for (const id of ['study_de', 'study_or']) { const i = ind(id); if (i) blocks(L.B, id, id === 'study_de' ? 'German' : 'Operations Research', left(id), i.skill); }
    }
    const rd = ind('reading'); if (rd && !cheatOn) { const rem = left('reading', 1) - (ind('read_bed') && !(v.read_bed === true) ? 30 : 0); if (rem > 5) blocks(L.B, 'reading', 'Reading (book, literature, newspaper, websites)', rem, rd.skill); }
    const wo = ind('workout');
    if (wo && wsum && !(v.workout && E_num(v.workout.min) > 0) && !rest) {
      const need = wsum.goal - wsum.count, daysLeft = 7 - ((dw + 6) % 7);
      if (need > 0) { const b = { kind: 'body', id: 'workout', mins: wo.target || 60, text: 'Workout, ' + (wo.target || 60) + ' min (' + wsum.count + ' of ' + wsum.goal + ' sessions this week)', short: 'workout', skill: wo.skill }; if (need >= daysLeft) L.C.unshift(Object.assign(b, { urgent: true })); else L.C.push(b); }
    }
    const wk = ind('walk'); if (wk && !(E_num(v.walk) >= wk.target)) L.C.push({ kind: 'body', id: 'walk', mins: wk.target, text: 'Walk, ' + wk.target + ' min', short: 'walk', skill: wk.skill });
    const home = ind('home'), rd2 = dr && dr.rooms && dr.rooms.home;
    if (home && rd2 && rd2.total < 65 && !cheatOn) {
      const low = home.rooms.find(r => r.id === rd2.lowest); let best = null, g = 0; for (const tk of home.tasks) { const f = tk.fill[rd2.lowest] || 0; if (f > g) { g = f; best = tk; } }
      if (low) L.D.push({ kind: 'home', id: 'home', mins: rd2.total < 40 ? 60 : 30, text: 'Household: ' + (best ? best.label.toLowerCase() : 'clean') + ' (' + low.name.toLowerCase() + ' at ' + Math.round(rd2.rooms[low.id]) + '%)', short: 'clean ' + low.name.toLowerCase(), skill: home.skill });
    }
    const so = ind('social'); if (so && dr && dr.need && dr.need.social != null && dr.need.social < 30) L.D.push({ kind: 'home', id: 'social', mins: 30, text: 'Message or meet someone (social bar ' + Math.round(dr.need.social) + '%)', short: 'see someone', skill: so.skill });
  }

  // fixed anchors
  const sup = cfg.indicators.filter(i => !i.off && i.skill === 'supplements' && !(i.id in v) && (i.slot !== 'night' || stage === 'night'));
  const meals = [];
  for (const [id, at, dur, nm] of [['meal_b', 8 * 60, 30, 'breakfast'], ['meal_l', 12 * 60 + 30, 45, 'lunch'], ['meal_d', 18 * 60 + 45, 60, 'dinner']]) {
    const i = ind(id); if (!i || v[id] != null) continue; if (at < nowMin - 120) continue;
    meals.push({ kind: 'meal', id, at, mins: dur, text: (cheat && id === 'meal_d') ? 'Cheat dinner: eat whatever you like, it is free today' : 'Eat a healthy, low-cost ' + nm + (id === 'meal_d' ? ' (cooking included)' : ''), short: (cheat && id === 'meal_d') ? 'cheat dinner' : 'healthy ' + nm, skill: i.skill });
  }
  if (meals.length && sup.length) meals[0].text += '. Supplements: ' + sup.filter(i => i.slot !== 'night').map(i => i.name).join(', ');
  const sched = []; let cursor = Math.max(Math.ceil(nowMin / 15) * 15, stage === 'morning' ? wake : 0);
  const place = (b, at) => { const s = Math.max(at, cursor); sched.push(Object.assign({}, b, { start: fmt(s), end: fmt(s + b.mins), startMin: s })); cursor = s + b.mins; };
  const slotNow = stage;
  if (!logged(slotNow) && nowMin < bedMin - 30) place({ kind: 'checkin', id: 'ci', mins: 5, text: cap1(slotNow) + ' check-in', short: slotNow + ' check-in', skill: 'awareness' }, cursor);

  const order = []; const pat = ['B', 'A', 'C', 'B', 'A', 'D', 'B', 'C', 'A'];
  const urgent = L.C.findIndex(b => b.urgent); if (urgent >= 0) order.push(L.C.splice(urgent, 1)[0]);
  let guard = 0; while ((L.A.length || L.B.length || L.C.length || L.D.length) && guard++ < 60) for (const k of pat) if (L[k].length) order.push(L[k].shift());
  const overflow = [];
  while (order.length || meals.length) {
    const m = meals[0];
    if (m && cursor >= m.at - 20) { place(m, m.at); meals.shift(); continue; }
    if (!order.length) { if (m) { place(m, m.at); meals.shift(); continue; } break; }
    const b = order.shift();
    if (cursor + b.mins > limit) { overflow.push(b); continue; }
    place(b, cursor);
  }
  const tail = [];
  if (!logged('night') && nowMin < bedMin) tail.push({ kind: 'checkin', id: 'ci_n', mins: 15, text: 'Night check-in: log spending, social media, the day', short: 'night check-in', skill: 'awareness', start: fmt(bedMin - 60), end: fmt(bedMin - 45), startMin: bedMin - 60 });
  if (ind('read_bed') && v.read_bed !== true) tail.push({ kind: 'wind', id: 'read_bed', mins: 30, text: 'Read in bed (a book, no screen)', short: 'read in bed', skill: 'sleep', start: fmt(bedMin - 30), end: fmt(bedMin), startMin: bedMin - 30 });
  tail.push({ kind: 'wind', id: 'bed', mins: 0, text: 'Lights out for 8 h of sleep before ' + S.wakeBy, short: 'bed by ' + fmt(bedMin), skill: 'sleep', start: fmt(bedMin), end: fmt(bedMin), startMin: bedMin });
  if (cheat && nowMin < cF) { const mk = { kind: 'wind', id: 'cheat', mins: 0, text: 'Cheat evening starts: the work is done, dinner is free, enjoy it', short: 'cheat evening', skill: 'nutrition', start: fmt(cF), end: fmt(cF), startMin: cF }; const at = sched.findIndex(x => x.startMin > cF); if (at < 0) sched.push(mk); else sched.splice(at, 0, mk); }
  const schedule = sched.concat(tail).filter(x => x.startMin >= 0 || x.kind !== 'wind').map(x => Object.assign({ skillName: skillName(x.skill) }, x));

  const notes = [];
  if (cheat) notes.push({ text: cheatOn ? 'Cheat evening is on. Dinner is free and nothing else is planned except the wrap-up.' : 'Cheat evening from ' + fmt(cF) + ': get the work done before then, tonight\'s dinner is free.', skill: 'nutrition', skillName: skillName('nutrition') });
  const yd = addDays(date, -1), yr = res.days[yd];
  if (yr && !yr.waive) { const miss = SLOTS.filter(s => !yr.slots[s].logged); if (miss.length) notes.push({ text: 'Yesterday has no ' + miss.join(' / ') + ' check-in. Backfill within 48 h for full XP.', skill: 'awareness', skillName: skillName('awareness') }); }
  for (const q of (res.quests || [])) if (q.period !== 'all' && q.period !== 'day' && !q.done && q.mtype !== 'level' && q.mtype !== 'meta' && q.target > 0 && q.value / q.target >= 0.75) notes.push({ text: 'Milestone "' + q.name + '": ' + Math.round(q.value) + ' of ' + q.target + '.', skill: q.skill, skillName: skillName(q.skill) });
  const rewards = (res.quests || []).filter(q => q.period === 'day').map(q => ({ name: q.name, reward: q.reward, done: q.done, claimed: q.claimed, id: q.id }));
  const first = schedule.filter(x => x.kind !== 'checkin' && x.kind !== 'wind').slice(0, 5);
  const summary = first.length ? 'Plan: ' + first.map(x => x.start + ' ' + x.short).join(', then ') + '.' : (waived ? 'Planned off day, nothing scheduled.' : 'Nothing left to schedule. Wind down and sleep on time.');
  return { stage, cheatFrom: cheat && !cheatOn ? fmt(cF) : null, title: cheatOn ? 'Cheat evening' : stage === 'morning' ? 'This morning' : stage === 'afternoon' ? 'This afternoon' : 'This evening', schedule, overflow: overflow.map(b => b.short), notes, rewards, summary, dayType, bed: fmt(bedMin), from: fmt(Math.max(Math.ceil(nowMin / 15) * 15, 0)) };
}
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------- simulation ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PERSONAS = {
  consistent: { label: 'Consistent', desc: 'Steady ~85% discipline, logs almost everything on time.', disc: () => 0.85, logP: () => 0.97, noise: 0.08, late: 0.04 },
  chaotic: { label: 'Chaotic', desc: 'Weekly swings between great and awful, logs about 70% of the time, often late.', disc: (t, r, st) => { if (t % 7 === 0) st.wk = 0.2 + r() * 0.7; return st.wk; }, logP: () => 0.7, noise: 0.2, late: 0.3 },
  burnout: { label: 'Burnout, then recovery', desc: 'Great for a month, crashes over 3 weeks, bottoms out, then rebuilds.', disc: t => t < 30 ? 0.95 : t < 50 ? 0.95 - 0.8 * (t - 30) / 20 : t < 60 ? 0.15 : t < 90 ? 0.15 + 0.65 * (t - 60) / 30 : 0.8, logP: (t, dsc) => 0.15 + 0.85 * dsc, noise: 0.08, late: 0.1 },
  ghost: { label: 'Ghost (vanishes 2 weeks)', desc: 'Strong for 2 weeks, disappears for 14 days (behaviour unknown), then returns.', disc: t => (t >= 14 && t < 28) ? 0.35 : 0.85, logP: () => 0.97, noise: 0.08, late: 0.04, absent: t => t >= 14 && t < 28 },
  casual: { label: 'Casual', desc: 'Decent habits (~60%), logs most days.', disc: () => 0.6, logP: () => 0.85, noise: 0.15, late: 0.1 }
};
function generateLogs(personaId, cfg, start, n, seed) {
  const P = PERSONAS[personaId] || PERSONAS.consistent, S = cfg.settings;
  const rng = mulberry32(seed || 7), st = {};
  const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pois = lam => { let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1; };
  const logs = {}, months = {}, loadBase = { gym: 9000, swim: 1200, run: 5 };
  const freq = { t_bath: 0.8, t_hoover: 1.3, t_kitchen: 2.4, t_wash: 2.4, t_dry: 2.4, t_bed: 2.4, t_trash: 2.2, t_dishes: 4, t_living: 1.1, t_office: 0.6, t_hall: 0.6 };
  let trend = 84, sq = 42.5;
  for (let t = 0; t < n; t++) {
    const d = addDays(start, t), dw = dowOf(d);
    const disc = clamp(P.disc(t, rng, st) + gauss() * P.noise, 0, 1);
    const absent = P.absent && P.absent(t);
    const day = { v: {}, slots: {}, mode: 'normal' }; const v = day.v;
    const logP = P.logP(t, disc);
    for (const sl of SLOTS) {
      if (absent || rng() > logP) continue;
      const late = rng() < P.late ? Math.floor(1 + rng() * 8) : 0;
      day.slots[sl] = { at: addDays(d, late) };
    }
    for (const ind of cfg.indicators) {
      if (ind.off) continue;
      switch (ind.kind) {
        case 'binary': if (ind.id === 'smoked') v[ind.id] = rng() < (1 - disc) * 0.5; else if (ind.id === 'sober') v[ind.id] = rng() > 0.05 + (1 - disc) * 0.35 + (dw === 0 ? 0.15 : 0); else v[ind.id] = rng() < clamp(disc + 0.08, 0, 1); break;
        case 'zone': v[ind.id] = Math.round((6.2 + disc * 2.0 + gauss() * (0.4 + (1 - disc))) * 4) / 4; break;
        case 'time': { const late = (1 - disc) * 120 - 15 + gauss() * 25; const m = clamp(toMin(S.wakeBy) + late, 330, 720); v[ind.id] = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0'); break; }
        case 'tier': {
          const r = rng(), pc = disc * 0.8, pt = 0.06 + (1 - disc) * 0.4 + (dw === 6 ? 0.25 : 0);
          const q = r < pc ? 'clean' : r < pc + pt ? 'treat' : 'okay'; v[ind.id] = q;
          const rc = rng(); v[ind.id + '_cost'] = q === 'treat' ? (rc < 0.4 ? 'high' : 'medium') : q === 'clean' ? (rc < 0.2 + disc * 0.5 ? 'low' : 'medium') : (rc < 0.4 ? 'low' : 'medium');
          break;
        }
        case 'effort': { const pS = disc * 0.95 * (dw === 0 ? 0.2 : dw === 6 ? 0.5 : 1); v[ind.id] = rng() < pS ? Math.round(ind.target * clamp(0.6 + disc * 0.7 + gauss() * 0.25, 0.3, 1.8)) : 0; break; }
        case 'bar': v[ind.id] = ind.id === 'water' ? Math.max(0, Math.round(1200 + disc * 1500 + gauss() * 400)) : Math.max(0, Math.round(3000 + disc * 6500 + gauss() * 2000)); break;
        case 'workout': {
          if (rng() < disc * 0.78 * (dw === 0 ? 0.25 : 1)) {
            const r = rng(), type = r < 0.7 ? 'gym' : r < 0.9 ? 'swim' : 'run';
            if (rng() < 0.6) loadBase[type] *= 1.012;
            const e = { type, min: Math.round(50 + disc * 15 + gauss() * 10), load: Math.round(loadBase[type] * (0.9 + 0.2 * rng()) * 10) / 10 };
            if (type === 'gym') { if (rng() < 0.5) sq *= 1.006; e.squat = Math.round(sq * (0.97 + 0.06 * rng()) / 2.5) * 2.5; }
            v[ind.id] = e;
          } break;
        }
        case 'count': {
          const lam = ind.abs ? ({ org_browsed: 0.15, uni_browsed: 0.04, coffee_chat: 0.05, outreach: 0.1, avoided: 1.0 }[ind.id] || 0.1) * disc : (ind.goal / 7) * (0.35 + disc * 0.85) * (dw === 0 ? 0.3 : 1);
          v[ind.id] = pois(lam); break;
        }
        case 'rating': v[ind.id] = Math.round(clamp((ind.id === 'mood' ? 5.5 + 2.5 * disc : 6 + 2 * disc) + gauss() * 1.2, 1, 10)); break;
        case 'need': { const ev = []; const pAny = 0.22 + disc * 0.2 + ((dw === 5 || dw === 6) ? 0.25 : 0); if (rng() < pAny) ev.push(ind.events[Math.floor(rng() * ind.events.length)].id); v[ind.id] = ev; break; }
        case 'rooms': { const arr = []; for (const tk of ind.tasks) { const f = freq[tk.id] || 1; if (rng() < f / 7 * (0.35 + disc * 0.9)) arr.push(tk.id); } v[ind.id] = arr; break; }
        case 'cashflow': { const base = 55 - 35 * disc; v.spent = Math.round(Math.max(3, base * Math.exp(gauss() * 0.5) * (dw === 6 ? 1.8 : 1))); v.earned = (d.slice(8) === '25') ? 2400 : (rng() < 0.05 ? 40 : 0); break; }
        case 'ceil': { const base = 55 - 35 * disc; v[ind.id] = Math.round(Math.max(3, base * Math.exp(gauss() * 0.5) * (dw === 6 ? 1.8 : 1))); break; }
        case 'weight': trend += -0.08 * disc + 0.03 * (1 - disc); if (rng() < 0.7) v[ind.id] = Math.round((trend + gauss() * 0.25) * 10) / 10; break;
        case 'macros': if (rng() < disc * 0.5) v[ind.id] = { protein: Math.round(100 + disc * 70 + gauss() * 15), kcal: Math.round(2300 + (1 - disc) * 600 + gauss() * 150) }; break;
      }
    }
    if (disc > 0.7 && rng() < 0.3) day.priority = 'workout';
    if (!absent) logs[d] = day;
    if (d === lastOfMonth(monthOf(d))) months[monthOf(d)] = { net: 2400, saved: Math.round(2400 * clamp(0.05 + disc * 0.3 + gauss() * 0.05, -0.05, 0.5)) };
  }
  return { logs, months };
}

const SNAP_DAYS = [3, 7, 14, 30, 60, 90, 180, 365, 540, 730, 1095, 1825];
function runSim(personaId, nDays, opts) {
  opts = opts || {};
  const start = opts.start || '2026-01-05';
  const state = defaultState(start);
  if (opts.config) state.config = opts.config;
  const g = generateLogs(personaId, state.config, start, nDays, opts.seed || 7);
  state.logs = g.logs; state.months = g.months;
  const today = addDays(start, nDays - 1);
  const res = compute(state, { today });
  const snap = {};
  for (const sid of Object.keys(res.skills)) {
    const ser = res.skills[sid].series; snap[sid] = {};
    for (const dd of SNAP_DAYS) if (dd <= nDays) snap[sid][dd] = ser[dd - 1].level;
  }
  return { state, res, snap, today, start };
}

root.LifeRPG = { compute, defaultConfig, defaultState, levelInfo, levelTable, DEFAULT_CURVE, addDays, diffDays, dowOf, weekStart, monthOf, lastOfMonth, clamp, num,
  claimQuest, questPeriod, evalQuest, runSim, generateLogs, recommend, momentumFor, MOMENTUM, upgradeConfig, REV, MULTI, PERSONAS, SNAP_DAYS, SLOTS, MEAL, COSTS, GROUPS, HOME_ROOMS, HOME_TASKS, WORKOUT_TYPES, SOCIAL_EVENTS, KIND_META, zoneScore, kcalBand, backfillFactor, fd, pd };
if (typeof module !== 'undefined' && module.exports) module.exports = root.LifeRPG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
