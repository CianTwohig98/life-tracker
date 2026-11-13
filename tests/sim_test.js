// Usage: node sim_test.js [days]
const E = require('../src/engine.js');
const N = Number(process.argv[2] || 90);
const KEY = ['sleep', 'fitness', 'nutrition', 'german', 'career', 'finance', 'social'];
for (const pid of Object.keys(E.PERSONAS)) {
  const t0 = Date.now();
  const { res, snap } = E.runSim(pid, N);
  console.log('\n=== ' + pid + ' (' + N + ' days, ' + (Date.now() - t0) + 'ms) total level ' + res.totalLevel + ', total XP ' + Math.round(res.totalXp));
  console.log('skill'.padEnd(12) + E.SNAP_DAYS.filter(d => d <= N).map(d => ('d' + d).padStart(6)).join('') + '   final XP  form');
  for (const sid of Object.keys(snap)) {
    const s = res.skills[sid];
    console.log(sid.padEnd(12) + E.SNAP_DAYS.filter(d => d <= N).map(d => String(snap[sid][d]).padStart(6)).join('') + String(Math.round(s.xp)).padStart(11) + '  ' + s.form.toFixed(2));
  }
}
