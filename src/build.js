// Inlines engine + sync core + app + css into one self-contained HTML file, and writes the installable site (docs/) that GitHub Pages serves.
const fs = require('fs');
const css = fs.readFileSync(__dirname + '/style.css', 'utf8');
const engine = fs.readFileSync(__dirname + '/engine.js', 'utf8');
const app = fs.readFileSync(__dirname + '/app_1.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/app_3.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/app_2.js', 'utf8');
const syncCore = fs.readFileSync(__dirname + '/sync_core.js', 'utf8');
let syncCfg = 'window.LT_BUILD=' + JSON.stringify(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 16)) + ';'; try { const c = JSON.parse(fs.readFileSync(__dirname + '/sync-config.json', 'utf8')); if (c.url && c.key) syncCfg += 'window.LT_SYNC=' + JSON.stringify({ url: c.url, key: c.key }) + ';'; } catch (e) { /* no sync config yet */ }
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0e1013">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<title>Life Tracker</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<div id="modal" hidden></div>
<div id="toast" role="status"></div>
<script>
${safe(engine)}
</script>
<script>
${safe(syncCore)}
${safe(syncCfg)}
</script>
<script>
${safe(app)}
</script>
</body>
</html>
`;
fs.mkdirSync(__dirname + '/../dist', { recursive: true });
fs.writeFileSync(__dirname + '/../dist/life-tracker.html', html);
console.log('built dist/life-tracker.html (' + Math.round(html.length / 1024) + ' KB)');

// ---- installable site (PWA) ----
const SITE = __dirname + '/../docs'; fs.mkdirSync(SITE, { recursive: true });
const ver = Date.now().toString(36);
const pwaHead = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="icon" type="image/png" href="icon-192.png">\n';
const pwaTail = '<script>if("serviceWorker"in navigator&&location.protocol.startsWith("http"))addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})});</script>\n';
fs.writeFileSync(SITE + '/index.html', html.replace('<title>Life Tracker</title>', '<title>Life Tracker</title>\n' + pwaHead).replace('</body>', pwaTail + '</body>'));
fs.writeFileSync(SITE + '/manifest.webmanifest', JSON.stringify({ name: 'Life Tracker', short_name: 'Life Tracker', start_url: './', scope: './', display: 'standalone', background_color: '#0e1013', theme_color: '#0e1013', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 1));
fs.writeFileSync(SITE + '/sw.js', `const CACHE='lt-${ver}';const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))))});`);
console.log('docs/ written');
