// Mechanics checks for the engine. Usage: node unit_test.js
const E = require('../src/engine.js');
const toM = x => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL: ' + msg); } else console.log('  ok:   ' + msg); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const logSlots = (d, slots, at) => Object.fromEntries(slots.map(s => [s, { at: at || d }]));
function mk(start) { const s = E.defaultState(start); return s; }
const day = (s, d, v, slots, extra) => { s.logs[d] = Object.assign({ v: v || {}, slots: logSlots(d, slots || ['morning', 'afternoon', 'night']) }, extra || {}); return s.logs[d]; };

// 2026-11-02 is a Monday
console.log('1. perfect sleep gives full XP, sober modifier dampens it');
{
  const s = mk('2026-11-03'); const d = '2026-11-03';
  day(s, d, { sleep_dur: 8, wake: '07:20', sober: true }, ['morning']);
  let r = E.compute(s, { today: '2026-11-04' });
  const F = r.full.sleep_dur;
  ok(near(r.days[d].inds.sleep_dur.xp, F), 'sleep_dur = full (' + F.toFixed(1) + ')');
  ok(near(r.days[d].inds.wake.xp, r.full.wake), 'wake on time = full');
  s.logs[d].v.sober = false;
  r = E.compute(s, { today: '2026-11-04' });
  ok(near(r.days[d].inds.sleep_dur.xp, F * 0.6), 'non-sober: sleep XP x0.6 -> ' + r.days[d].inds.sleep_dur.xp.toFixed(1));
  ok(r.days[d].inds.sober.xp < 0, 'non-sober indicator itself is negative');
}
console.log('2. backfill factors (positives only)');
{
  const base = () => { const s = mk('2026-11-03'); return s; };
  const mkcase = at => { const s = base(); s.logs['2026-11-03'] = { v: { sleep_dur: 8, wake: '09:30' }, slots: { morning: { at } } }; return E.compute(s, { today: '2026-11-20' }); };
  const a = mkcase('2026-11-04'), b = mkcase('2026-11-07'), c = mkcase('2026-11-15');
  const F = a.full.sleep_dur;
  ok(near(a.days['2026-11-03'].inds.sleep_dur.xp, F), 'within 48h = 100%');
  ok(near(b.days['2026-11-03'].inds.sleep_dur.xp, F * 0.7), '4 days late = 70%');
  ok(near(c.days['2026-11-03'].inds.sleep_dur.xp, F * 0.5), '12 days late = 50%');
  ok(near(a.days['2026-11-03'].inds.wake.xp, c.days['2026-11-03'].inds.wake.xp), 'penalty (late wake) is not discounted by lateness of log');
}
console.log('3. unlogged past day = assumed bad, today = pending');
{
  const s = mk('2026-11-03'); const r = E.compute(s, { today: '2026-11-04' });
  ok(r.days['2026-11-03'].inds.teeth_am.state === 'unlogged' && r.days['2026-11-03'].inds.teeth_am.xp < 0, 'yesterday unlogged -> negative');
  ok(r.days['2026-11-04'].inds.teeth_am.state === 'pending' && r.days['2026-11-04'].inds.teeth_am.xp === 0, 'today unlogged -> pending, no penalty');
  ok(r.alerts.some(a => a.type === 'backfill'), 'backfill alert shown');
}
console.log('4. priority bonus (+50%, capped, only if morning logged same day)');
{
  const s = mk('2026-11-03'); const d = '2026-11-03';
  day(s, d, { sleep_dur: 8, wake: '07:00', sober: true }, ['morning'], { priority: 'sleep_dur' });
  let r = E.compute(s, { today: '2026-11-04' });
  ok(near(r.days[d].priority.bonus, r.full.sleep_dur * 0.5), 'priority bonus = 50% of indicator XP');
  s.logs[d].slots.morning.at = '2026-11-04';
  r = E.compute(s, { today: '2026-11-05' });
  ok(r.days[d].priority === null, 'no priority bonus when morning log was late');
}
console.log('5. tokens and modes waive penalties');
{
  const s = mk('2026-11-03');
  s.logs['2026-11-03'] = { v: {}, slots: {}, token: true };
  s.logs['2026-11-04'] = { v: {}, slots: {}, mode: 'sick' };
  let r = E.compute(s, { today: '2026-11-06' });
  const neg = d => Object.values(r.days[d].inds).filter(o => o.xp < 0).length;
  ok(neg('2026-11-03') === 0, 'token day: no negatives');
  ok(neg('2026-11-04') === 0, 'sick day: no negatives');
  ok(neg('2026-11-05') > 0, 'normal unlogged day still penalised');
  s.logs['2026-11-05'] = { v: {}, slots: {}, token: true }; s.logs['2026-11-06'] = { v: {}, slots: {}, token: true };
  r = E.compute(s, { today: '2026-11-07' });
  ok(r.tokens.used === 2 && r.days['2026-11-06'].tokenOk === false, 'only 2 tokens per month are honoured');
}
console.log('6. treat budget and fun day');
{
  const s = mk('2026-11-02');
  day(s, '2026-11-02', { meal_b: 'treat' }, ['morning']);
  day(s, '2026-11-03', { meal_b: 'treat' }, ['morning']);
  day(s, '2026-11-04', { meal_b: 'treat' }, ['morning']);
  const r = E.compute(s, { today: '2026-11-05' });
  ok(r.days['2026-11-02'].inds.meal_b.xp === 0 && r.days['2026-11-03'].inds.meal_b.xp === 0, 'first 2 treats of the week are free');
  ok(r.days['2026-11-04'].inds.meal_b.xp < 0, '3rd treat counts against you');
  const s2 = mk('2026-11-07'); day(s2, '2026-11-07', { meal_b: 'treat', meal_l: 'treat', meal_d: 'treat' }, ['morning', 'afternoon', 'night']);   // Saturday
  const r2 = E.compute(s2, { today: '2026-11-08' });
  const o = r2.days['2026-11-07'].inds;
  ok(o.meal_b.xp === 0 && o.meal_l.xp === 0 && o.meal_d.xp === 0 && /fun-day|planned/.test(o.meal_d.note), 'Saturday: 2 fun treats plus 1 from the weekly budget are free');
}
console.log('7. catch-up: workout cancels two missed walk days');
{
  const s = mk('2026-11-02');
  day(s, '2026-11-02', { walk: 0 }, ['night']); day(s, '2026-11-03', { walk: 0 }, ['night']);
  let r = E.compute(s, { today: '2026-11-04' });
  ok(r.alerts.some(a => a.type === 'catchup'), 'catch-up alert is shown after 2 missed days');
  day(s, '2026-11-04', { walk: 40, workout: { type: 'swim', min: 45, load: 1000 } }, ['night']);
  r = E.compute(s, { today: '2026-11-04' });
  ok(r.days['2026-11-02'].inds.walk.state === 'madeup' && r.days['2026-11-03'].inds.walk.state === 'madeup', 'both days marked made-up');
  ok(!r.alerts.some(a => a.type === 'catchup'), 'alert cleared');
}
console.log('8. weekly goal penalty (applied after the week closes)');
{
  const s = mk('2026-11-02'); day(s, '2026-11-03', { roles_found: 2 }, ['afternoon']);
  let r = E.compute(s, { today: '2026-11-08' });
  ok(!r.days['2026-11-08'].inds.apps_sent.weeklyPen, 'no penalty while the week is still running');
  r = E.compute(s, { today: '2026-11-09' });
  ok(r.days['2026-11-08'].inds.apps_sent.weeklyPen < 0, 'zero applications -> weekly penalty');
  ok(r.days['2026-11-08'].inds.roles_found.weeklyPen < 0, '2/10 roles (<50%) -> small penalty');
  day(s, '2026-11-04', { apps_sent: 5, roles_found: 8 }, ['afternoon']);
  r = E.compute(s, { today: '2026-11-09' });
  ok(!r.days['2026-11-08'].inds.apps_sent.weeklyPen && !r.days['2026-11-08'].inds.roles_found.weeklyPen, 'goals met -> no penalty');
  ok(near(r.days['2026-11-04'].inds.apps_sent.xp, r.full.apps_sent * 7), '5 applications at goal = full weekly potential');
}
console.log('9. every-other-day study and rest day credit');
{
  const eo = s => { s.config.indicators.find(i => i.id === 'study_or').everyN = 2; return s; };
  const s = eo(mk('2026-11-02'));
  day(s, '2026-11-02', { study_or: 60 }, ['afternoon']);               // Mon done
  day(s, '2026-11-03', { study_or: 0 }, ['afternoon']);                // Tue not due
  day(s, '2026-11-04', { study_or: 0 }, ['afternoon']);                // Wed overdue
  day(s, '2026-11-08', { study_de: 0 }, ['afternoon']);                // Sunday rest
  const r = E.compute(s, { today: '2026-11-09' });
  ok(r.days['2026-11-03'].inds.study_or.state === 'neutral', 'day after a session: not due, neutral');
  ok(r.days['2026-11-04'].inds.study_or.state === 'miss', 'two days later: overdue, penalty');
  ok(r.days['2026-11-08'].inds.study_de.state === 'rest' && near(r.days['2026-11-08'].inds.study_de.xp, r.full.study_de * 0.5), 'Sunday rest credit = 50%');
  const s2 = eo(mk('2026-11-02')); day(s2, '2026-11-02', { study_or: 60 }, ['afternoon']); day(s2, '2026-11-04', { study_or: 60 }, ['afternoon']);
  const r2 = E.compute(s2, { today: '2026-11-05' });
  ok(near(r2.days['2026-11-04'].inds.study_or.xp, r2.full.study_or * 2), 'a session after a 2-day gap covers 2 days of XP');
}
console.log('10. progressive overload');
{
  const s = mk('2026-11-02');
  const loads = [9000, 9000, 9000, 11000];
  loads.forEach((l, i) => day(s, E.addDays('2026-11-02', i), { workout: { type: 'gym', min: 45, load: l } }, ['night']));
  const r = E.compute(s, { today: '2026-11-06' });
  const x = i => r.days[E.addDays('2026-11-02', i)].inds.workout.xp;
  ok(near(x(2), x(1)), 'at baseline: no bonus');
  ok(x(3) > x(2) * 1.4 && x(3) <= x(2) * 1.5 + 0.01, 'load +22% over baseline -> bonus capped at x1.5 (' + (x(3) / x(2)).toFixed(2) + ')');
}
console.log('11. savings rate and weight trend');
{
  const s = mk('2026-10-01'); s.months['2026-10'] = { net: 2400, saved: 720 };
  const r = E.compute(s, { today: '2026-11-02' });
  ok(r.days['2026-10-31'].inds.savings.xp > 0, 'month-end savings XP credited');
  const s2 = mk('2026-10-26');
  for (let i = 0; i < 14; i++) { const d = E.addDays('2026-10-26', i); day(s2, d, { weight: i < 7 ? 85 : 84.5 }, ['morning']); }
  const r2 = E.compute(s2, { today: '2026-11-10' });
  const wk = r2.days['2026-11-08'].inds.weight;
  ok(wk.xp > 0 && /weekly trend/.test(wk.note), 'cut: -0.6%/week gives weight XP (' + wk.note + ')');
}
console.log('12. milestone quests');
{
  const s = mk('2026-11-02');
  const q = (r, id) => r.quests.find(x => x.id === id);
  // clean 8 h sleep Mon-Fri (week of 11-02), sober by default
  for (let i = 0; i < 5; i++) day(s, E.addDays('2026-11-02', i), { sleep_dur: 8 }, ['morning']);
  day(s, '2026-11-07', { sleep_dur: 5 }, ['morning']);
  let r = E.compute(s, { today: '2026-11-08' });
  ok(q(r, 'q_sleep_wk').value === 5 && q(r, 'q_sleep_wk').done, 'sleep Mon-Fri clean: ' + q(r, 'q_sleep_wk').value + '/5');
  ok(q(r, 'q_sleep_one').done, 'first clean 8 h night (all-time) is done');
  s.logs['2026-11-03'].v.sober = false;
  r = E.compute(s, { today: '2026-11-08' });
  ok(q(r, 'q_sleep_wk').value === 4 && !q(r, 'q_sleep_wk').done, 'one non-sober night breaks the clean week');
  // squat ladder and run
  const s2 = mk('2026-11-02');
  day(s2, '2026-11-02', { workout: { type: 'gym', min: 60, squat: 62.5 } }, ['night']);
  day(s2, '2026-11-03', { workout: { type: 'run', min: 25, load: 3 } }, ['night']);
  r = E.compute(s2, { today: '2026-11-04' });
  ok(q(r, 'q_sq60').done && !q(r, 'q_sq70').done, 'squat 62.5 kg clears the 60 kg step but not 70');
  ok(q(r, 'q_run1').done && !q(r, 'q_run5').done, 'first run done, 5 km not yet');
  // 4+ sessions per week, N weeks in a row
  const s3 = mk('2026-11-02');
  for (let w = 0; w < 4; w++) for (let k = 0; k < 4; k++) day(s3, E.addDays('2026-11-02', w * 7 + k), { workout: { type: k === 3 ? 'swim' : 'gym', min: 60 } }, ['night']);
  r = E.compute(s3, { today: '2026-11-30' });
  ok(q(r, 'q_wk4').value === 4 && q(r, 'q_wk4').done, 'four consecutive 4-session weeks: ' + q(r, 'q_wk4').value);
  ok(q(r, 'q_swim4').done, 'swimming 4 weeks in a row');
  ok(!q(r, 'q_wk8').done, '8-week streak not done yet');
  // massage gun at a level
  ok(q(r, 'q_wk4').reward === 'Massage gun' && q(r, 'q_wk4').done, 'massage gun is the reward for the 4-week training streak');
  const before = r.skills.fitness.xp;
  E.claimQuest(s3, s3.config.quests.find(x => x.id === 'q_wk4'), '2026-11-30');
  const r2 = E.compute(s3, { today: '2026-11-30' });
  ok(q(r2, 'q_wk4').claimed && r2.skills.fitness.xp > before + 200, 'claiming pays bonus XP');
}
console.log('13. need bar (social) decays and refills');
{
  const s = mk('2026-11-02');
  for (let i = 0; i < 4; i++) day(s, E.addDays('2026-11-02', i), { social: [] }, ['night']);
  day(s, '2026-11-06', { social: ['friends', 'partner'] }, ['night']);
  const r = E.compute(s, { today: '2026-11-06' });
  const L = d => r.days[d].need.social;
  ok(L('2026-11-03') < L('2026-11-02'), 'bar decays daily');
  ok(L('2026-11-06') > L('2026-11-05') + 40, 'friends + partner refill it: ' + Math.round(L('2026-11-05')) + ' -> ' + Math.round(L('2026-11-06')));
}
console.log('14. household rooms: one filthy room drags the total (harmonic roll-up)');
{
  const s = mk('2026-11-02');
  // clean everything except the bathroom for a week
  for (let i = 0; i < 16; i++) day(s, E.addDays('2026-11-02', i), { home: ['t_hoover', 't_kitchen', 't_wash', 't_dry', 't_bed', 't_living', 't_office', 't_hall'] }, ['night']);
  let r = E.compute(s, { today: '2026-11-18' });
  const h = r.days['2026-11-18'].rooms.home;
  ok(h.lowest === 'bathroom' && h.rooms.bathroom < 30, 'bathroom is the lowest room (' + Math.round(h.rooms.bathroom) + '%)');
  const avg = Object.values(h.rooms).reduce((a, b) => a + b, 0) / Object.values(h.rooms).length;
  ok(h.total < avg - 15, 'total ' + Math.round(h.total) + '% is far below the plain average ' + Math.round(avg) + '%');
  day(s, '2026-11-18', { home: ['t_bath'] }, ['night']);
  const before = h.total; r = E.compute(s, { today: '2026-11-18' });
  ok(r.days['2026-11-18'].rooms.home.total > before + 10, 'cleaning the bathroom lifts the total (' + Math.round(before) + ' -> ' + Math.round(r.days['2026-11-18'].rooms.home.total) + ')');
  ok(r.bars.find(b => b.id === 'b_home').pct === Math.round(r.days['2026-11-18'].rooms.home.total), 'household bar equals the room roll-up');
  const sk = mk('2026-11-02'); const rr = E.compute(sk, { today: '2026-11-20' });
  ok(rr.days['2026-11-20'].rooms.home.total < 30, 'untouched flat decays to ' + Math.round(rr.days['2026-11-20'].rooms.home.total) + '%');
}
console.log('15. cashflow: spend counts more than earnings, saved/earned adds XP');
{
  const s = mk('2026-11-02');
  day(s, '2026-11-02', { spent: 10, earned: 0 }, ['night']); day(s, '2026-11-03', { spent: 90, earned: 0 }, ['night']);
  day(s, '2026-11-04', { spent: 10, earned: 100 }, ['night']); day(s, '2026-11-05', { earned: 0 }, ['night']);
  const r = E.compute(s, { today: '2026-11-06' });
  const x = d => r.days[d].inds.cashflow.xp;
  ok(near(x('2026-11-02'), r.full.cashflow), 'spending EUR 10 = full XP');
  ok(x('2026-11-03') < 0 && near(x('2026-11-03'), -0.4 * 1.2 * r.full.cashflow), 'spending EUR 90 = ' + x('2026-11-03').toFixed(1) + ' (weighted 1.2x)');
  ok(x('2026-11-04') > x('2026-11-02'), 'earning or saving EUR 100 adds XP on top');
  ok(r.days['2026-11-05'].inds.cashflow.state === 'blank' && x('2026-11-05') < 0, 'spend left blank = assumed bad');
}
console.log('16. food cost tags feed finance');
{
  const s = mk('2026-11-02');
  day(s, '2026-11-02', { meal_b: 'clean', meal_b_cost: 'low', meal_l: 'clean', meal_l_cost: 'low', meal_d: 'clean', meal_d_cost: 'low' }, ['afternoon', 'night']);
  day(s, '2026-11-03', { meal_b: 'clean', meal_b_cost: 'high', meal_l: 'clean', meal_l_cost: 'high', meal_d: 'clean', meal_d_cost: 'high' }, ['afternoon', 'night']);
  const r = E.compute(s, { today: '2026-11-04' });
  const f = d => r.days[d].inds.food_cost;
  ok(f('2026-11-02').xp > 0 && f('2026-11-03').xp < 0, 'cheap clean day earns, expensive day costs: ' + f('2026-11-02').xp.toFixed(1) + ' / ' + f('2026-11-03').xp.toFixed(1));
  ok(r.days['2026-11-02'].foodEur === 12 && r.days['2026-11-03'].foodEur === 30, 'estimated food spend EUR 12 vs 30');
  ok(near(r.days['2026-11-02'].inds.meal_b.xp, r.days['2026-11-03'].inds.meal_b.xp), 'nutrition XP depends on quality, not cost');
}
console.log('17. supplements are separate indicators and the awareness skill is fed by logging');
{
  const s = mk('2026-11-03'); const d = '2026-11-03';
  day(s, d, { supp_multi: true, supp_d3: true, supp_zinc: false, supp_creatine: true, supp_water: true }, ['morning']);
  const r = E.compute(s, { today: '2026-11-04' });
  ok(near(r.days[d].inds.supp_multi.xp, 1) && r.days[d].inds.supp_zinc.xp === 0, 'ticked supplement = +1 XP, a missed one costs nothing');
  ok(near(r.days[d].skills.awareness.pos, 12), 'one logged slot (+20) minus two unlogged slots (-4 each) = ' + r.days[d].skills.awareness.pos.toFixed(0) + ' Self-awareness XP');
  ok(s.config.indicators.filter(i => i.skill === 'supplements').length === 7, 'seven supplement indicators');
}
console.log('18. recommendations build a schedule from what is unfulfilled');
{
  const s = mk('2026-11-02'); const d = '2026-11-04';
  day(s, d, { meal_b: 'clean', study_de: 60, workout: { type: 'gym', min: 60 } }, ['morning', 'afternoon']);
  const r = E.compute(s, { today: d });
  const rec = E.recommend(s, r, d, 14 * 60);
  const txt = rec.schedule.map(x => x.text).join(' | ');
  ok(rec.stage === 'afternoon' && rec.schedule.length > 4, 'afternoon schedule has ' + rec.schedule.length + ' items');
  ok(!/German/.test(txt) && !/Workout/.test(txt), 'German (done) and workout (done) are not scheduled again');
  ok(/Applications/.test(txt) && /Job search/.test(txt) && /Upskilling/.test(txt) && /lunch/.test(txt), 'applications, job search, upskilling and lunch are scheduled');
  const times = rec.schedule.map(x => x.startMin); ok(times.every((x, i) => i === 0 || x >= times[i - 1]), 'schedule is in time order');
  ok(rec.schedule[rec.schedule.length - 1].text.startsWith('Lights out') && /23:15/.test(rec.schedule[rec.schedule.length - 1].start), 'ends with lights out at 23:15');
  const apps = rec.schedule.filter(x => /Applications/.test(x.text)).reduce((a, x) => a + x.mins, 0); ok(apps === 60, 'applications target is 1 h (' + apps + ' min)'); ok(/send at least 1 today/.test(txt) && /contact at least 1 lead/.test(txt), 'weekday minimums are on the plan');
  ok(rec.rewards.some(x => /free evening/i.test(x.name)), 'daily reward (free evening) is listed');
  const rest = E.recommend(s, r, d, 8 * 60); ok(rest.stage === 'morning', 'morning stage');
}
console.log('18b. wake penalty per 30 minutes');
{
  const mkw = t => { const s = mk('2026-11-03'); day(s, '2026-11-03', { wake: t }, ['morning']); return E.compute(s, { today: '2026-11-04' }); };
  const F = mkw('07:30').full.wake, x = t => mkw(t).days['2026-11-03'].inds.wake.xp;
  ok(near(x('07:30'), F) && near(x('07:00'), F), '7:30 or earlier = full XP');
  ok(near(x('08:00'), F * 0.7) && near(x('08:30'), F * 0.4) && near(x('09:00'), F * 0.1), 'each 30 minutes later costs 0.3 of full XP');
  ok(x('10:00') < 0 && x('12:00') >= -0.4 * F - 0.01, 'long lie-ins turn negative but are floored');
}
console.log('18c. smoked indicator (inverted yes/no) and composite rewards');
{
  const s = mk('2026-11-02');
  day(s, '2026-11-02', { smoked: false, teeth_am: true, teeth_pm: true }, ['morning', 'night']);
  day(s, '2026-11-03', { smoked: true, teeth_am: true, teeth_pm: true }, ['morning', 'night']);
  day(s, '2026-11-04', { teeth_am: true, teeth_pm: true }, ['morning', 'night']);
  const r = E.compute(s, { today: '2026-11-05' });
  const o = d => r.days[d].inds.smoked;
  ok(o('2026-11-02').xp > 0 && o('2026-11-03').xp < 0 && o('2026-11-04').state === 'blank', 'not smoked earns, smoked costs, unanswered counts as assumed bad');
  const q = id => r.quests.find(x => x.id === id);
  ok(q('q_bleach').value === 1, 'bleaching counts only the day with both brushings AND no smoking (' + q('q_bleach').value + ')');
  ok(r.bars.find(b => b.id === 'b_hyg').pct >= 0, 'bars still compute');
}
console.log('18d. daily reward and meta milestone');
{
  const s = mk('2026-11-02'); const d = '2026-11-03';
  day(s, d, { job_time: 60, job_search: 60, apps_sent: 1, outreach: 1, study_de: 60, study_or: 60 }, ['afternoon']);
  let r = E.compute(s, { today: d, viewDate: d });
  ok(r.quests.find(q => q.id === 'q_free_eve').done && !r.quests.find(q => q.id === 'q_night_out').done, 'free evening unlocked by the plan, night out needs the full day');
  s.logs[d].v.study_or = 30; r = E.compute(s, { today: d, viewDate: d });
  ok(!r.quests.find(q => q.id === 'q_free_eve').done, 'not unlocked when OR is short');
  s.logs[d].v.study_gis = 60; r = E.compute(s, { today: d, viewDate: d }); ok(r.quests.find(q => q.id === 'q_free_eve').done, 'GIS counts as the upskilling hour instead of OR');
  delete s.logs[d].v.study_gis; s.logs[d].v.outreach = 0; r = E.compute(s, { today: d, viewDate: d }); ok(!r.quests.find(q => q.id === 'q_free_eve').done, 'no lead contacted on a weekday: free evening is locked'); s.logs[d].v.outreach = 1;
  ok(r.quests.find(q => q.id === 'q_holiday').target === 4 && r.quests.find(q => q.id === 'q_holiday').value === 0, 'holiday needs 4 sub-milestones, has 0');
  s.config.quests.find(q => q.id === 'q_holiday').metric.ids = ['q_free_eve']; s.config.quests.find(q => q.id === 'q_holiday').target = 1; s.logs[d].v.study_or = 60;
  r = E.compute(s, { today: d, viewDate: d }); ok(r.quests.find(q => q.id === 'q_holiday').done, 'meta milestone is done when its sub-milestones are done');
}
console.log('19. no emoji anywhere in the default config');
{
  const txt = JSON.stringify(E.defaultState('2026-11-02').config);
  ok(!/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u.test(txt), 'default config contains no emoji');
  ok(E.GROUPS.length === 3 && E.defaultState('2026-11-02').config.skills.every(k => E.GROUPS.includes(k.group)), 'every skill belongs to one of three groups');
}
console.log('20. task XP ordering, room weights and decay rates');
{
  const home = E.defaultState('2026-11-02').config.indicators.find(i => i.id === 'home');
  const x = id => home.tasks.find(t => t.id === id).xp;
  ok(x('t_bath') >= 2 * x('t_kitchen') && x('t_kitchen') === x('t_bed') && x('t_kitchen') > x('t_hoover') && x('t_hoover') >= x('t_wash') + x('t_dry') && x('t_hoover') > x('t_office'), 'task XP: bathroom by far most, kitchen = bedroom, then hoovering and laundry, then office');
  const room = id => home.rooms.find(r => r.id === id), days = id => Math.round(50 / room(id).decay);
  ok(days('kitchen') === 3 && days('bathroom') === 14 && days('living') === 7 && days('bedroom') === 3 && days('office') === 14 && days('hallway') === 14 && days('laundry') === 3, 'rooms need cleaning after 3 / 14 / 7 / 3 / 14 / 14 / 3 days');
  ok(room('bathroom').w > room('kitchen').w && room('kitchen').w === room('bedroom').w, 'bathroom weighs most in the roll-up');
}
console.log('21. config upgrade keeps your data and fixes old defaults');
{
  const c = JSON.parse(JSON.stringify(E.defaultState('2026-11-02').config)); delete c.rev;
  c.indicators.find(i => i.id === 'supp_protein').slot = 'afternoon'; c.indicators.find(i => i.id === 'supp_mag').slot = 'night'; c.indicators.find(i => i.id === 'outfit').slot = 'night';
  c.indicators.find(i => i.id === 'meal_b').options[2].label = 'Treat'; c.indicators.find(i => i.id === 'study_de').slots = undefined;
  c.indicators.find(i => i.id === 'home').rooms.find(r => r.id === 'kitchen').decay = 8; c.indicators.find(i => i.id === 'home').rooms.push({ id: 'balcony', name: 'Balcony', decay: 2, start: 70 });
  E.upgradeConfig(c);
  const g = id => c.indicators.find(i => i.id === id);
  ok(g('supp_protein').slot === 'morning' && g('supp_mag').slot === 'morning' && g('outfit').slot === 'morning', 'protein, magnesium and outfit moved to the morning');
  ok(g('meal_b').options[2].label === 'Unhealthy' && g('study_de').slots.length === 3, 'meal labels and multi-slot study updated');
  ok(Math.round(50 / g('home').rooms.find(r => r.id === 'kitchen').decay) === 3 && g('home').rooms.some(r => r.id === 'balcony'), 'room decay updated, custom rooms kept');
  ok(c.rev === E.REV, 'config revision stamped');
}
console.log('22. entries in any time slot count; early evaluation never shows a provisional penalty today');
{
  const s = mk('2026-11-02'); const d = '2026-11-03';
  day(s, d, { study_de: 60, water: 500 }, ['morning']);                       // German and water entered in the morning check-in
  let r = E.compute(s, { today: d });
  ok(r.days[d].inds.study_de.xp > 0 && r.days[d].inds.study_de.state !== 'unlogged', 'German entered in the morning counts although its home slot is the afternoon');
  ok(r.days[d].inds.water.xp >= 0, 'partial water early in the day is not shown as a penalty today (' + r.days[d].inds.water.state + ')');
  r = E.compute(s, { today: '2026-11-05' });
  ok(r.days[d].inds.water.xp < 0, 'on a finished day, 500 ml of water is a miss');
  const s2 = mk('2026-11-02'); day(s2, d, {}, ['morning']);
  r = E.compute(s2, { today: d }); ok(r.days[d].inds.study_de.state === 'pending', 'nothing entered, afternoon not logged: still pending today');
}
console.log('23. momentum: finished to-dos lift habit XP that day, not penalties or to-do XP');
{
  const d = '2026-11-03', run = n => { const s = mk('2026-11-02'); day(s, d, { study_de: 60, study_or: 60, water: 2500 }, ['morning', 'afternoon', 'night']); s.todos = []; for (let i = 0; i < n; i++) s.todos.push({ id: 't' + i, text: 'x', skill: 'household', size: 'quick', done: d }); return E.compute(s, { today: '2026-11-05' }).days[d]; };
  const r0 = run(0), r1 = run(1), r2 = run(2), r5 = run(5);
  const g = (r, id) => r.skills[id].gain;
  ok(Math.abs(g(r1, 'german') / g(r0, 'german') - 1.10) < 0.001, 'one finished to-do: +10% on German XP (' + (g(r1, 'german') / g(r0, 'german')).toFixed(3) + ')');
  ok(Math.abs(g(r2, 'german') / g(r0, 'german') - 1.18) < 0.001, 'two: +18%');
  ok(Math.abs(g(r5, 'german') / g(r0, 'german') - 1.25) < 0.001 && r5.momentum === 0.25, 'five: capped at +25%');
  ok(r1.skills.sleep.loss === r0.skills.sleep.loss, 'losses are not scaled by momentum');
  const s3 = mk('2026-11-02'); day(s3, d, {}, ['morning']); s3.todos = [{ id: 'a', text: 'x', skill: 'household', size: 'big', done: d }]; s3.bonuses = [{ date: d, skill: 'household', xp: 100, todo: 'a' }];
  const r3 = E.compute(s3, { today: '2026-11-05' }).days[d]; ok(r3.skills.household.flat === 100 && r3.skills.household.gain >= 100, 'the to-do XP itself is paid in full and unboosted');
}
console.log('24. cheat evening (Friday from 17:00)');
{
  const fri = '2026-11-13', s = mk('2026-11-02'); s.logs[fri] = { v: { meal_d: 'treat' }, slots: { night: { at: fri } } };
  let r = E.compute(s, { today: '2026-11-20' }), d = r.days[fri];
  ok(d.dayType === 'cheat' && d.inds.meal_d.xp === 0 && /cheat/.test(d.inds.meal_d.note), 'Friday dinner as an unhealthy meal costs nothing and uses no allowance');
  const sat = '2026-11-14'; s.logs[sat] = { v: { meal_d: 'treat' }, slots: { night: { at: sat } } }; s.logs['2026-11-11'] = { v: { meal_d: 'treat' }, slots: { night: { at: '2026-11-11' } } };
  r = E.compute(s, { today: '2026-11-20' }); ok(r.days['2026-11-11'].inds.meal_d.note !== 'cheat evening', 'a Wednesday unhealthy dinner is still judged normally (' + r.days['2026-11-11'].inds.meal_d.note + ')');
  const s2 = mk('2026-11-02'); s2.logs[fri] = { v: {}, slots: {} }; const r2 = E.compute(s2, { today: fri });
  const before = E.recommend(s2, r2, fri, 15 * 60 + 30), after = E.recommend(s2, r2, fri, 17 * 60 + 30);
  const work = x => x.schedule.filter(b => b.kind === 'work');
  ok(before.schedule.filter(b => !['wind', 'checkin'].includes(b.kind) && b.kind !== 'meal').every(b => toM(b.end) <= 17 * 60) && before.overflow.length > 0, 'at 15:30 everything scheduled ends by 17:00, the rest is listed as not fitting');
  ok(before.schedule.some(b => b.id === 'cheat' && b.start === '17:00'), 'a "cheat evening starts" marker sits at 17:00');
  ok(before.schedule.some(b => b.kind === 'meal' && /Cheat dinner/.test(b.text)), 'dinner is a cheat dinner');
  ok(work(after).length === 0 && after.title === 'Cheat evening', 'at 17:30 no work is scheduled and the plan is titled Cheat evening');
  ok(before.notes.some(n => /Cheat evening from 17:00/.test(n.text)), 'a note explains it');
  const mon = '2026-11-16', s3 = mk('2026-11-02'); s3.logs[mon] = { v: {}, slots: {} }; const rm = E.recommend(s3, E.compute(s3, { today: mon }), mon, 17 * 60 + 30);
  ok(rm.schedule.some(b => b.kind === 'work') && !rm.notes.some(n => /Cheat/.test(n.text)), 'a normal Monday at 17:30 still schedules work');
}

console.log('25. small flat rewards, smoking dents fitness, discord, physio');
{
  const s = mk('2026-11-03'); const d = '2026-11-03';
  day(s, d, { stretch_ham: true, supp_multi: true, supp_d3: true, smoked: true }, ['morning', 'afternoon', 'night']);
  const r = E.compute(s, { today: '2026-11-04' }), o = r.days[d].inds;
  ok(near(o.stretch_ham.xp, 5), 'hamstring stretches = +5 XP');
  ok(near(o.supp_multi.xp + o.supp_d3.xp, 2), 'each supplement = +1 XP');
  ok(o.smoked.xp < 0 && o.smoked.also && o.smoked.also.skill === 'fitness' && o.smoked.also.xp === -5, 'smoking keeps its wellbeing cost and adds a small fitness debuff');
  ok(r.days[d].skills.fitness.neg <= -5, 'fitness skill shows the debuff (' + r.days[d].skills.fitness.neg.toFixed(1) + ')');
  const s2 = mk('2026-11-03'); day(s2, d, { smoked: false }, ['morning', 'afternoon', 'night']);
  const r2 = E.compute(s2, { today: '2026-11-04' }); ok(!r2.days[d].inds.smoked.also && r2.days[d].skills.fitness.neg > -5, 'no debuff when you did not smoke');
  const s3 = mk('2026-11-03'); day(s3, d, { smoked: true }, ['morning', 'afternoon', 'night'], { mode: 'sick' });
  const r3 = E.compute(s3, { today: '2026-11-04' }); ok(!r3.days[d].inds.smoked.also, 'sick days waive the debuff');
  ok(E.SOCIAL_EVENTS.some(e => e.id === 'discord' && e.fill === 10), 'Discord sesh social event, +10');
  ok(E.WORKOUT_TYPES.some(t => t.id === 'physio'), 'physio is a workout type');
  const old = E.defaultState('2026-11-03').config; old.rev = 6;
  for (const i of old.indicators) { if (i.id.startsWith('supp_') || i.id === 'stretch_ham') { delete i.abs; delete i.unitXp; i.optional = false; } if (i.id === 'smoked') delete i.alsoDebuff; if (i.id === 'social') i.events = i.events.filter(e => e.id !== 'discord'); }
  E.upgradeConfig(old); const g = id => old.indicators.find(i => i.id === id);
  ok(old.rev === E.REV && g('supp_zinc').abs && g('supp_zinc').unitXp === 1 && g('stretch_ham').unitXp === 5 && g('smoked').alsoDebuff && g('social').events.some(e => e.id === 'discord'), 'a rev 6 config upgrades to the new rewards');
}

console.log('26. needs bars are fed by what you log');
{
  const s = mk('2026-11-03'), d = '2026-11-03';
  const bar = (r, n) => r.bars.find(b => b.name === n);
  day(s, d, { walk: 15 }, ['morning']); let r = E.compute(s, { today: d, viewDate: d });
  ok(bar(r, 'Movement').any && bar(r, 'Movement').pct === 50, 'a 15 minute walk fills Movement to 50% (' + bar(r, 'Movement').pct + ')');
  const s2 = mk('2026-11-03'); day(s2, d, { workout: { type: 'physio', min: 60 } }, ['morning']); r = E.compute(s2, { today: d, viewDate: d });
  ok(bar(r, 'Movement').pct === 100, 'a 60 minute workout fills Movement to 100%, a walk is not required');
  const s3 = mk('2026-11-03'); day(s3, d, { water: 1250 }, ['night']); r = E.compute(s3, { today: d, viewDate: d });
  ok(bar(r, 'Hydration').pct === 50, 'water 1250 of 2500 ml = 50%');
  const s4 = mk('2026-11-03'); r = E.compute(s4, { today: d, viewDate: d }); ok(!bar(r, 'Movement').any, 'nothing logged: the bar says so');
  const old = E.defaultState(d).config; old.rev = 7; const mv = old.bars.find(b => b.id === 'b_move'); mv.src = ['walk']; delete mv.mode;
  E.upgradeConfig(old); ok(old.bars.find(b => b.id === 'b_move').src.join() === 'walk,workout', 'a rev 7 config gets the new Movement sources');
}

console.log('27. job search: weekday minimums, GIS, fitness hour, upgrade');
{
  const s = mk('2026-11-02');                                   // Mon 2 Nov
  day(s, '2026-11-03', { job_time: 60, job_search: 60, study_de: 60, study_or: 60 }, ['afternoon', 'night']);   // Tue: no application, no lead
  day(s, '2026-11-04', { apps_sent: 1, outreach: 1, study_gis: 60 }, ['afternoon', 'night']);                   // Wed: both minimums, GIS instead of OR
  day(s, '2026-11-08', { study_de: 0 }, ['afternoon']);                                                          // Sun
  let r = E.compute(s, { today: '2026-11-09' });
  ok(r.days['2026-11-03'].inds.apps_sent.state === 'miss' && r.days['2026-11-03'].inds.apps_sent.xp === -8, 'Tuesday without an application: small penalty (-8)');
  ok(r.days['2026-11-03'].inds.outreach.state === 'miss' && r.days['2026-11-03'].inds.outreach.xp === -5, 'Tuesday without a lead: small penalty (-5)');
  ok(r.days['2026-11-04'].inds.apps_sent.xp > 0 && r.days['2026-11-04'].inds.outreach.xp === 15, 'Wednesday with both: application earns XP, lead earns 15');
  ok(r.days['2026-11-08'].inds.apps_sent.state !== 'miss' && r.days['2026-11-08'].inds.outreach.state !== 'miss', 'weekends have no minimum');
  ok(r.days['2026-11-04'].inds.study_or.state === 'neutral' && r.days['2026-11-04'].inds.study_gis.xp > 0, 'GIS hour covers upskilling, OR is not penalised');
  ok(r.days['2026-11-03'].inds.study_gis.xp === 0, 'GIS never penalises on its own');
  const t = E.compute(s, { today: '2026-11-05' }); ok(t.days['2026-11-05'].inds.apps_sent.state === 'pending', 'today is pending, not penalised yet');
  const w = JSON.parse(JSON.stringify(s)); w.logs['2026-11-03'].token = true; r = E.compute(w, { today: '2026-11-09' });
  ok(r.days['2026-11-03'].inds.apps_sent.state === 'waived', 'a life token waives the minimum penalty');
  // planner: fitness hour and job blocks
  const p = mk('2026-11-02'); day(p, '2026-11-03', { walk: 20 }, ['morning']);
  const rr = E.compute(p, { today: '2026-11-03' }); const rec = E.recommend(p, rr, '2026-11-03', 10 * 60);
  const txt = rec.schedule.map(x => x.text + ' ' + x.mins).join(' | ');
  ok(/Fitness hour/.test(txt) || /Workout/.test(txt), 'a fitness hour is planned');
  const sum = k => rec.schedule.filter(x => k.test(x.text)).reduce((a, x) => a + x.mins, 0);
  ok(sum(/Applications/) === 60 && sum(/Job search/) === 60 && sum(/German/) === 60 && sum(/Upskilling/) === 60, 'one hour each: applications, search, German, upskilling');
  // upgrade from rev 8
  const old = E.defaultState('2026-11-02').config; old.rev = 8;
  old.skills = old.skills.filter(x => x.id !== 'gis'); old.indicators = old.indicators.filter(i => i.id !== 'job_search' && i.id !== 'study_gis');
  const jt = old.indicators.find(i => i.id === 'job_time'); jt.target = 120; jt.w = 3; const ap = old.indicators.find(i => i.id === 'apps_sent'); ap.goal = 2; delete ap.dailyMin;
  E.upgradeConfig(old, '2026-11-25');
  const g = id => old.indicators.find(i => i.id === id);
  ok(g('job_time').target === 60 && g('job_search') && g('study_gis') && old.skills.some(x => x.id === 'gis') && g('apps_sent').goal === 5 && g('apps_sent').dailyMin === 1, 'a rev 8 config gets the job-search setup');
  ok(g('apps_sent').dailyMinFrom === '2026-11-25' && g('outreach').dailyMinFrom === '2026-11-25', 'minimums apply from the upgrade day, past days are not penalised');
  const os = { v: 2, config: old, logs: {}, months: {}, bonuses: [], claims: {}, todos: [], startDate: '2026-11-02' };
  const ro = E.compute(os, { today: '2026-11-26' }); ok(ro.days['2026-11-24'].inds.apps_sent.state !== 'miss' && ro.days['2026-11-25'].inds.apps_sent.state === 'miss', 'old weekdays unpenalised, new ones penalised');
}

console.log('28. scientific paper (yes/no, evening)');
{
  const s = mk('2026-11-02');
  day(s, '2026-11-03', { paper: true }, ['night']); day(s, '2026-11-04', { paper: false }, ['night']);
  const r = E.compute(s, { today: '2026-11-06' });
  ok(r.days['2026-11-03'].inds.paper.xp > 0 && r.days['2026-11-03'].inds.paper.state === 'ok', 'a paper read earns reading XP');
  ok(r.days['2026-11-04'].inds.paper.xp < 0 && Math.abs(r.days['2026-11-04'].inds.paper.xp) < r.days['2026-11-03'].inds.paper.xp / 3, 'no paper is a small penalty');
  ok(E.defaultState('2026-11-02').config.indicators.find(i => i.id === 'paper').slot === 'night', 'asked in the evening check-in only');
  const old = E.defaultState('2026-11-02').config; old.rev = 9; old.indicators = old.indicators.filter(i => i.id !== 'paper');
  E.upgradeConfig(old, '2026-11-25'); const pi = old.indicators.find(i => i.id === 'paper');
  ok(pi && pi.from === '2026-11-25' && old.indicators.indexOf(pi) < old.indicators.findIndex(i => i.id === 'reading'), 'a rev 9 config gains the paper question, counted from the upgrade day');
  const os = mk('2026-11-02'); os.config = old; day(os, '2026-11-24', { study_de: 0 }, ['night']);
  const ro = E.compute(os, { today: '2026-11-26' }); ok(ro.days['2026-11-24'].inds.paper.state === 'none' && ro.days['2026-11-24'].inds.paper.xp === 0, 'earlier days are not penalised');
  const p = mk('2026-11-02'); const rr = E.compute(p, { today: '2026-11-03' }); const rec = E.recommend(p, rr, '2026-11-03', 10 * 60);
  ok(rec.schedule.some(x => /scientific paper/.test(x.text)), 'the plan schedules a paper');
  day(p, '2026-11-03', { paper: true }, ['night']); const rec2 = E.recommend(p, E.compute(p, { today: '2026-11-03' }), '2026-11-03', 10 * 60);
  ok(!rec2.schedule.some(x => /scientific paper/.test(x.text)), 'not scheduled once read');
}

console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASSED'));
process.exit(fails ? 1 : 0);
