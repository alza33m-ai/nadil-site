// خادم موقع نادل: يعرض index.html ويشغّل المساعد الذكي عبر /api/chat
// التشغيل: ANTHROPIC_API_KEY=... node server.js   (بدون مكتبات إضافية، Node 18+)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.NADIL_MODEL || "claude-haiku-5-5";
const ROOT = __dirname;

const SYSTEM = `أنت «مساعد نادل» في موقع nadil.sa. نادل منيو إلكتروني سعودي للمطاعم والكافيهات (QR وNFC).
تكلّم بلهجة سعودية بيضاء، ودودة ومختصرة: ٢ إلى ٥ أسطر، بدون عناوين ولا رموز تعبيرية. هدفك تساعد صاحب المطعم يفهم نادل ويختار الخدمات المناسبة ويتواصل معنا.
المعلومات (لا تخترع غيرها):
- الاشتراك الأساسي ٣٩٩ ريال سنوياً: منيو إلكتروني وكود QR لكل طاولة، لوحة تحكم من الجوال، عربي وإنجليزي، السعرات الحرارية، شعار المطعم وألوانه، ستاند نادل لكل طاولة.
- خدمات إضافية سنوية: جهّز طلبك قبل النادل ١٩٩، خيارات الأصناف ٩٩، فلتر السعرات والحساسية ٧٩، منيو حسب الوقت ورمضان ٩٩، يمشي معها ١٤٩، تحليلات المشاهدات والطلبات ١٤٩، تقرير الواتساب الأسبوعي ١٩٩، اكشط واربح ١٩٩، ثيمات المناسبات ٩٩، المساعد الذكي للزبائن ٤٩٩، الطلب يوصل المطبخ ٣٩٩.
- خصم على الخدمات الإضافية: ٣ خدمات ١٠٪، ٦ خدمات ١٥٪، ١٠ خدمات ٢٥٪. الأسعار قبل الضريبة وتشمل الاستضافة والتحديثات.
- عرض الإطلاق: أول ٢٠ مطعم مؤسس يثبت سعرهم، أسبوع مجاني بدون التزام، وندخل المنيو ونركّب الأكواد بأنفسنا.
- الزبون ما يحتاج تطبيق. صاحب المطعم يرسل صورة المنيو ونحن ندخله مع الترجمة والسعرات. الفروع والستاندات الإضافية سعرها بالتواصل.
- باقة ثانية «جوّ»: شاشة المقهى (منيو رقمي على التلفزيون + جدول مباريات + ليلة المباراة + لوحة كأس آسيا ٢٠٢٧). مستوياتها رايق وحامي ونار، وأسعارها بالتواصل.
- التواصل: زر الواتساب في قسم «تواصل» أسفل الصفحة.
إذا سأل عن شي خارج نادل اعتذر بلطف وارجع للموضوع. لا تعطي أسعار غير المذكورة.
إذا رشّحت خدمات، أضف في آخر ردك سطراً مستقلاً بالصيغة: [[services: key1,key2]] من هذه المفاتيح فقط: ready, opts, filter, time, pair, analytics, wa, scratch, occ, ai, kitchen`;

// حد بسيط: ٢٠ سؤال لكل IP كل ١٠ دقائق
const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < w);
  list.push(now); hits.set(ip, list);
  return list.length > 20;
}

const TYPES = { ".webp": "image/webp", ".json": "application/json", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".css": "text/css", ".js": "text/javascript" };

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function chat(req, res) {
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 40000) return send(res, 413, '{"error":"too_large"}'); }
  if (!KEY) return send(res, 503, '{"error":"no_key"}');
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, JSON.stringify({ text: "وصلت للحد المسموح من الأسئلة، كلمنا على الواتساب ونخدمك على طول." }));
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, '{"error":"bad_json"}'); }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return send(res, 400, '{"error":"no_question"}');
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: SYSTEM, messages })
    });
    if (!r.ok) { console.error("anthropic", r.status, await r.text()); return send(res, 502, '{"error":"upstream"}'); }
    const j = await r.json();
    let text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    let services;
    const m = text.match(/\[\[services:\s*([a-z,\s]*)\]\]/i);
    if (m) { services = m[1].split(",").map(s => s.trim()).filter(Boolean); text = text.replace(m[0], "").trim(); }
    send(res, 200, JSON.stringify({ text, services }));
  } catch (e) { console.error(e); send(res, 502, '{"error":"upstream"}'); }
}


// ===== عروض المطاعم: GET للزبائن، PUT لصاحب المطعم بالرمز السري =====
// الرموز: ADMIN_PINS='{"rwh-smhan":"4821"}'  أو رمز واحد للكل ADMIN_PIN=4821
const ENV_PINS = (() => { try { return JSON.parse(process.env.ADMIN_PINS || "{}"); } catch { return {}; } })();
// الرموز من ADMIN_PINS + ملف data/pins.json (يُقرأ من جديد إذا تغيّر، بدون إعادة تشغيل)
let filePins = {}, pinsMtime = 0;
const PINS = new Proxy({}, { get(_, k) {
  try { const f = path.join(__dirname, "data", "pins.json"), m = fs.statSync(f).mtimeMs;
    if (m !== pinsMtime) { filePins = JSON.parse(fs.readFileSync(f, "utf8")) || {}; pinsMtime = m; } } catch { filePins = {}; pinsMtime = 0; }
  return Object.prototype.hasOwnProperty.call(filePins, k) ? filePins[k] : ENV_PINS[k];
} });
const DATA_DIR = path.join(ROOT, "data"); try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
// كتابة آمنة: نكتب ملف مؤقت ثم نبدّله، عشان ما ينخرب الملف لو طفى الخادم وقت الحفظ
function writeSafe(file, data, cb) {
  const tmp = file + "." + process.pid + "." + Date.now() + ".tmp";
  fs.writeFile(tmp, data, err => { if (err) return cb && cb(err); fs.rename(tmp, file, e2 => { if (e2) fs.unlink(tmp, () => {}); cb && cb(e2); }); });
}
async function offersApi(req, res, url) {
  const slug = (url.searchParams.get("r") || "").replace(/[^a-z0-9-]/g, "");
  if (!slug) return send(res, 400, '{"error":"no_restaurant"}');
  const file = path.join(DATA_DIR, "offers-" + slug + ".json");
  if (req.method === "GET") {
    fs.readFile(file, "utf8", (err, d) => send(res, 200, err ? '{"offers":null}' : d));
    return;
  }
  if (req.method !== "PUT") return send(res, 405, '{"error":"method"}');
  const want = PINS[slug] || process.env.ADMIN_PIN;
  if (!want || req.headers["x-nadil-pin"] !== String(want)) return send(res, 401, '{"error":"pin"}');
  let raw = ""; for await (const c of req) { raw += c; if (raw.length > 200000) return send(res, 413, '{"error":"too_large"}'); }
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, '{"error":"bad_json"}'); }
  if (!Array.isArray(body.offers) || body.offers.length > 50) return send(res, 400, '{"error":"bad_offers"}');
  writeSafe(file, JSON.stringify({ offers: body.offers, updated: new Date().toISOString() }), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : '{"ok":true}'));
}

// ===== جوّ: إعدادات شاشة المقهى (منيو + مباريات). GET للشاشة، PUT لصاحب المقهى بالرمز =====
async function jawwApi(req, res, url) {
  const v = (url.searchParams.get("v") || "").replace(/[^a-z0-9-]/g, "");
  if (!v) return send(res, 400, '{"error":"no_venue"}');
  const file = path.join(DATA_DIR, "jaww-" + v + ".json");
  if (req.method === "GET") { fs.readFile(file, "utf8", (err, d) => send(res, 200, err ? "{}" : d)); return; }
  if (req.method !== "PUT") return send(res, 405, '{"error":"method"}');
  const want = PINS[v] || process.env.ADMIN_PIN;
  if (!want || req.headers["x-nadil-pin"] !== String(want)) return send(res, 401, '{"error":"pin"}');
  let raw = ""; for await (const c of req) { raw += c; if (raw.length > 300000) return send(res, 413, '{"error":"too_large"}'); }
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, '{"error":"bad_json"}'); }
  if (!body || typeof body.config !== "object") return send(res, 400, '{"error":"bad_config"}');
  body.at = Date.now();
  writeSafe(file, JSON.stringify(body), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : '{"ok":true}'));
}

// ===== جوّ: ربط التلفزيون برمز + حالة اتصال الشاشات =====
const PAIRS = new Map();   // code -> {at, v, s}
const SEENS = new Map();   // venue -> {screenId: lastSeen}
async function readJson(req, max) { let raw = ""; for await (const c of req) { raw += c; if (raw.length > max) return null; } try { return JSON.parse(raw || "{}"); } catch { return null; } }
async function jawwPair(req, res, url) {
  const now = Date.now();
  for (const [k, p] of PAIRS) if (now - p.at > 15 * 60000) PAIRS.delete(k);
  if (req.method === "POST") {           // التلفزيون يسجّل رمزه
    if (PAIRS.size > 2000) return send(res, 429, '{"error":"busy"}');
    const b = await readJson(req, 200); const code = String(b && b.code || "").toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) return send(res, 400, '{"error":"code"}');
    PAIRS.set(code, { at: now }); return send(res, 200, '{"ok":true}');
  }
  if (req.method === "GET") {            // التلفزيون ينتظر
    const p = PAIRS.get(String(url.searchParams.get("code") || "").toUpperCase());
    if (!p) return send(res, 200, '{"expired":true}');
    return send(res, 200, JSON.stringify(p.v ? { v: p.v, s: p.s } : { waiting: true }));
  }
  if (req.method === "PUT") {            // صاحب المقهى يربط الرمز بشاشة
    const b = await readJson(req, 500); if (!b) return send(res, 400, '{"error":"bad_json"}');
    const v = String(b.v || "").replace(/[^a-z0-9-]/g, ""), sId = String(b.s || "").replace(/[^a-zA-Z0-9_-]/g, ""), code = String(b.code || "").toUpperCase();
    const want = PINS[v] || process.env.ADMIN_PIN;
    if (!want || req.headers["x-nadil-pin"] !== String(want)) return send(res, 401, '{"error":"pin"}');
    const p = PAIRS.get(code); if (!p) return send(res, 404, '{"error":"no_code"}');
    p.v = v; p.s = sId; return send(res, 200, '{"ok":true}');
  }
  send(res, 405, '{"error":"method"}');
}
function jawwPing(req, res, url) {
  const v = (url.searchParams.get("v") || "").replace(/[^a-z0-9-]/g, ""), sId = (url.searchParams.get("s") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!v || !sId) return send(res, 400, '{"error":"params"}');
  const m = SEENS.get(v) || {}; if (Object.keys(m).length < 200) m[sId] = Date.now(); else if (m[sId]) m[sId] = Date.now(); SEENS.set(v, m);
  send(res, 200, '{"ok":true}');
}

// ===== نادل: أصناف المطعم (يعدّلها صاحب المطعم من لوحته) =====
function cleanSlug(s) { return String(s || "").replace(/[^a-z0-9-]/g, ""); }
function isRestaurant(slug) { try { return !!slug && fs.statSync(path.join(ROOT, slug, "data.js")).isFile(); } catch { return false; } }
function pinOk(req, slug) { const want = PINS[slug] || process.env.ADMIN_PIN; return !!want && req.headers["x-nadil-pin"] === String(want); }
async function menuApi(req, res, url) {
  const slug = cleanSlug(url.searchParams.get("r"));
  if (!isRestaurant(slug)) return send(res, 404, '{"error":"no_restaurant"}');
  const file = path.join(DATA_DIR, "menu-" + slug + ".json");
  if (req.method === "GET") { fs.readFile(file, "utf8", (err, d) => send(res, 200, err ? "{}" : d)); return; }
  if (req.method === "DELETE") { if (!pinOk(req, slug)) return send(res, 401, '{"error":"pin"}'); fs.unlink(file, () => send(res, 200, '{"ok":true}')); return; }
  if (req.method !== "PUT") return send(res, 405, '{"error":"method"}');
  if (!pinOk(req, slug)) return send(res, 401, '{"error":"pin"}');
  const b = await readJson(req, 800000);
  if (!b || !Array.isArray(b.items) || b.items.length > 600 || (b.categories && !Array.isArray(b.categories))) return send(res, 400, '{"error":"bad_menu"}');
  writeSafe(file, JSON.stringify({ items: b.items, categories: b.categories || null, updated: new Date().toISOString() }), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : '{"ok":true}'));
}

// ===== نادل: إحصائيات المنيو والتقرير الأسبوعي =====
// تتجمع بالأيام (توقيت الرياض) في data/stats-<slug>.json
const STATS = new Map(), DIRTY = new Set(), TRK = new Map();
const riyadh = (t = Date.now()) => new Date(t + 3 * 3600000);
const dayKey = (t) => riyadh(t).toISOString().slice(0, 10);
function statsOf(slug) {
  if (!STATS.has(slug)) { let s = { days: {}, notes: [] }; try { s = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "stats-" + slug + ".json"), "utf8")); } catch {} STATS.set(slug, s); }
  return STATS.get(slug);
}
setInterval(() => {
  for (const slug of DIRTY) { const s = STATS.get(slug); const keys = Object.keys(s.days).sort(); while (keys.length > 120) delete s.days[keys.shift()];
    writeSafe(path.join(DATA_DIR, "stats-" + slug + ".json"), JSON.stringify(s), () => {}); }
  DIRTY.clear();
}, 5000).unref();
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
async function trackApi(req, res, url) {
  if (req.method !== "POST") return send(res, 405, '{"error":"method"}');
  const slug = cleanSlug(url.searchParams.get("r"));
  if (!isRestaurant(slug)) return send(res, 404, '{"error":"no_restaurant"}');
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), list = (TRK.get(ip) || []).filter(t => now - t < 600000); list.push(now); TRK.set(ip, list);
  if (list.length > 150) return send(res, 429, '{"error":"busy"}');
  const b = await readJson(req, 2000); if (!b) return send(res, 400, '{"error":"bad_json"}');
  const s = statsOf(slug), k = dayKey(now), d = s.days[k] || (s.days[k] = { o: 0, h: Array(24).fill(0), t: {}, i: {}, r: 0, v: 0, s: [0, 0], p: {}, f: {} });
  const id = String(b.id || "").slice(0, 40).replace(/[^\w-]/g, ""), tb = String(parseInt(b.t, 10) || "");
  switch (b.e) {
    case "open": d.o++; d.h[riyadh(now).getUTCHours()]++; if (tb) inc(d.t, tb); break;
    case "item": if (id) inc(d.i, id); break;
    case "order": d.r++; d.v += Math.max(0, Math.min(100000, Number(b.v) || 0)); break;
    case "pair": if (id) inc(d.p, id); break;
    case "offer": if (id) inc(d.f, id); break;
    case "rate": { const st = Math.max(1, Math.min(5, parseInt(b.s, 10) || 0)); d.s[0] += st; d.s[1]++;
      const note = String(b.note || "").trim().slice(0, 200); if (note) { s.notes.unshift({ d: k, s: st, t: tb, n: note }); s.notes.length = Math.min(s.notes.length, 40); } break; }
    default: return send(res, 400, '{"error":"event"}');
  }
  DIRTY.add(slug); send(res, 200, '{"ok":true}');
}
function reportApi(req, res, url) {
  const slug = cleanSlug(url.searchParams.get("r"));
  if (!isRestaurant(slug)) return send(res, 404, '{"error":"no_restaurant"}');
  if (!pinOk(req, slug)) return send(res, 401, '{"error":"pin"}');
  const n = Math.max(1, Math.min(60, parseInt(url.searchParams.get("days"), 10) || 7));
  const s = statsOf(slug), now = Date.now(), days = [], prev = { o: 0, r: 0, v: 0, s: [0, 0] };
  const sum = { o: 0, r: 0, v: 0, s: [0, 0], h: Array(24).fill(0), t: {}, i: {}, p: {}, f: {} };
  for (let j = n - 1; j >= 0; j--) { const k = dayKey(now - j * 86400000), d = s.days[k];
    days.push({ d: k, o: d ? d.o : 0, r: d ? d.r : 0 });
    if (!d) continue; sum.o += d.o; sum.r += d.r; sum.v += d.v; sum.s[0] += d.s[0]; sum.s[1] += d.s[1];
    d.h.forEach((x, i) => sum.h[i] += x); for (const key of ["t", "i", "p", "f"]) for (const [a, x] of Object.entries(d[key] || {})) inc(sum[key], a, x); }
  for (let j = 2 * n - 1; j >= n; j--) { const d = s.days[dayKey(now - j * 86400000)]; if (!d) continue; prev.o += d.o; prev.r += d.r; prev.v += d.v; prev.s[0] += d.s[0]; prev.s[1] += d.s[1]; }
  const top = (o, m) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, m);
  send(res, 200, JSON.stringify({ range: n, days, sum: { o: sum.o, r: sum.r, v: sum.v, s: sum.s, h: sum.h }, prev,
    items: top(sum.i, 8), tables: top(sum.t, 5), pairs: top(sum.p, 5), offers: top(sum.f, 5),
    notes: s.notes.filter(x => x.d >= days[0].d).slice(0, 10) }));
}

// ===== جوّ: مسابقة «توقّع النتيجة» =====
// الزبون يمسح الكود من الشاشة ويتوقع. الإعدادات في config.contest داخل jaww-<v>.json
const PIPS = new Map();
function jawwCfg(v) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "jaww-" + v + ".json"), "utf8")).config || null; } catch { return null; } }
function readPred(v) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "predict-" + v + ".json"), "utf8")); } catch { return {}; } }
function winnersOf(list, r) {
  if (!r || r.h == null || r.a == null) return null;
  const exact = list.filter(e => e.h === r.h && e.a === r.a);
  if (exact.length) return { exact: true, count: exact.length, names: exact.slice(0, 5).map(e => e.name) };
  const sign = x => Math.sign(x), out = list.filter(e => sign(e.h - e.a) === sign(r.h - r.a));
  if (!out.length) return { exact: false, count: 0, names: [] };
  const dist = e => Math.abs(e.h - r.h) + Math.abs(e.a - r.a), best = Math.min(...out.map(dist));
  const close = out.filter(e => dist(e) === best);
  return { exact: false, count: close.length, names: close.slice(0, 5).map(e => e.name) };
}
async function predictApi(req, res, url) {
  const v = cleanSlug(url.searchParams.get("v")); if (!v) return send(res, 400, '{"error":"no_venue"}');
  const cfg = jawwCfg(v), c = cfg && cfg.contest, file = path.join(DATA_DIR, "predict-" + v + ".json");
  if (req.method === "GET") {
    if (!c || !c.m) return send(res, 200, '{"on":false}');
    const all = readPred(v), list = all[c.m] || [], match = (cfg.matches || []).find(x => x.id === c.m) || null;
    const out = { on: !!c.on, m: c.m, match: match && { home: match.home, away: match.away, at: match.at, comp: match.comp }, prize: c.prize || "", count: list.length,
      result: c.result || null, winners: winnersOf(list, c.result), cafe: cfg.cafe && { name: cfg.cafe.name, accent: cfg.cafe.accent } };
    if (pinOk(req, v)) out.entries = list.map(e => ({ name: e.name, h: e.h, a: e.a, at: e.at }));
    return send(res, 200, JSON.stringify(out));
  }
  if (req.method !== "POST") return send(res, 405, '{"error":"method"}');
  if (!c || !c.on || !c.m || c.result) return send(res, 409, '{"error":"closed"}');
  const match = (cfg.matches || []).find(x => x.id === c.m);
  if (!match) return send(res, 409, '{"error":"closed"}');
  const kick = Date.parse(String(match.at) + ":00+03:00"); if (!isNaN(kick) && Date.now() > kick) return send(res, 409, '{"error":"started"}');
  const b = await readJson(req, 1000); if (!b) return send(res, 400, '{"error":"bad_json"}');
  const name = String(b.name || "").replace(/[<>\n\r]/g, "").trim().slice(0, 24), h = parseInt(b.h, 10), a = parseInt(b.a, 10), dev = String(b.dev || "").slice(0, 40);
  if (name.length < 2 || !(h >= 0 && h <= 20) || !(a >= 0 && a <= 20) || dev.length < 8) return send(res, 400, '{"error":"bad_entry"}');
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), ik = v + "|" + c.m + "|" + ip;
  const all = readPred(v), list = all[c.m] || (all[c.m] = []);
  const mine = list.find(e => e.dev === dev);
  if (mine) { mine.name = name; mine.h = h; mine.a = a; mine.at = Date.now(); }
  else { if ((PIPS.get(ik) || 0) >= 4) return send(res, 429, '{"error":"busy"}'); if (list.length >= 3000) return send(res, 429, '{"error":"full"}');
    PIPS.set(ik, (PIPS.get(ik) || 0) + 1); list.push({ name, h, a, dev, at: Date.now() }); }
  for (const k of Object.keys(all)) if (k !== c.m && Object.keys(all).length > 20) delete all[k];
  writeSafe(file, JSON.stringify(all), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : JSON.stringify({ ok: true, updated: !!mine, count: list.length })));
}

// ===== جوّ للفعاليات: الإعدادات + تفاعل الضيوف (تصويت، تهاني، ظهور الرعاة) =====
const EVIO = new Map(), EVDIRTY = new Set(), EVRL = new Map();
const evId = s => String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
function evCfg(id) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "ev-" + id + ".json"), "utf8")).cfg || null; } catch { return null; } }
function evIO(id) {
  if (!EVIO.has(id)) { let d = { votes: {}, voters: {}, msgs: [], seen: {} }; try { d = Object.assign(d, JSON.parse(fs.readFileSync(path.join(DATA_DIR, "evio-" + id + ".json"), "utf8"))); } catch {} EVIO.set(id, d); }
  return EVIO.get(id);
}
setInterval(() => { for (const id of EVDIRTY) writeSafe(path.join(DATA_DIR, "evio-" + id + ".json"), JSON.stringify(EVIO.get(id)), () => {}); EVDIRTY.clear(); }, 3000).unref();
function evLimit(req, key, max, win) { const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), k = key + "|" + ip, now = Date.now();
  const l = (EVRL.get(k) || []).filter(t => now - t < win); l.push(now); EVRL.set(k, l); return l.length > max; }
async function evApi(req, res, url) {
  const id = evId(url.searchParams.get("e")); if (!id) return send(res, 400, '{"error":"no_event"}');
  const sub = url.pathname.slice("/api/ev".length);
  if (sub === "" && req.method === "GET") { const c = evCfg(id); return send(res, 200, JSON.stringify(c ? { cfg: c } : {})); }
  if (sub === "" && req.method === "PUT") {
    if (!pinOk(req, id)) return send(res, 401, '{"error":"pin"}');
    const b = await readJson(req, 200000); if (!b || typeof b.cfg !== "object") return send(res, 400, '{"error":"bad_cfg"}');
    return writeSafe(path.join(DATA_DIR, "ev-" + id + ".json"), JSON.stringify({ cfg: b.cfg, at: Date.now() }), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : '{"ok":true}'));
  }
  if (sub === "/live" && req.method === "GET") {
    const io = evIO(id), full = url.searchParams.get("full") && pinOk(req, id);
    const msgs = full ? io.msgs : io.msgs.filter(m => m.st === "ok").slice(-60);
    return send(res, 200, JSON.stringify({ votes: io.votes, msgs: msgs.map(m => ({ id: m.id, name: m.name, text: m.text, at: m.at, st: m.st })), seen: full ? io.seen : {} }));
  }
  if (sub === "/act" && req.method === "POST") {
    const c = evCfg(id); if (!c) return send(res, 404, '{"error":"no_event"}');
    const b = await readJson(req, 2000); if (!b) return send(res, 400, '{"error":"bad_json"}');
    const io = evIO(id), dev = String(b.dev || "").slice(0, 40);
    if (dev.length < 8) return send(res, 400, '{"error":"dev"}');
    if (b.t === "vote") {
      if (!c.poll || b.p !== c.poll.id || !c.poll.open) return send(res, 409, '{"error":"closed"}');
      const i = parseInt(b.i, 10); if (!(i >= 0 && i < (c.poll.opts || []).length)) return send(res, 400, '{"error":"opt"}');
      if (evLimit(req, id + "v", 60, 600000)) return send(res, 429, '{"error":"busy"}');
      const vs = io.voters[b.p] || (io.voters[b.p] = {});
      if (vs[dev] != null) return send(res, 200, JSON.stringify({ already: true, i: vs[dev] }));
      vs[dev] = i; const t = io.votes[b.p] || (io.votes[b.p] = {}); t[i] = (t[i] || 0) + 1; EVDIRTY.add(id);
      return send(res, 200, '{"ok":true}');
    }
    if (b.t === "msg") {
      const name = String(b.name || "").replace(/[<>\r\n]/g, "").trim().slice(0, 30), text = String(b.text || "").replace(/[<>]/g, "").trim().slice(0, 160);
      if (name.length < 2 || text.length < 2) return send(res, 400, '{"error":"empty"}');
      if (evLimit(req, id + "m", 8, 600000)) return send(res, 429, '{"error":"busy"}');
      const wait = !!c.moderate;
      io.msgs.push({ id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, text, at: Date.now(), st: wait ? "wait" : "ok", dev });
      if (io.msgs.length > 2000) io.msgs.shift(); EVDIRTY.add(id);
      return send(res, 200, JSON.stringify({ ok: true, wait }));
    }
    return send(res, 400, '{"error":"type"}');
  }
  if (sub === "/mod" && req.method === "PUT") {
    if (!pinOk(req, id)) return send(res, 401, '{"error":"pin"}');
    const b = await readJson(req, 1000); if (!b) return send(res, 400, '{"error":"bad_json"}');
    const io = evIO(id);
    if (b.reset === "seen") io.seen = {}; else if (b.reset === "msgs") io.msgs = [];
    else io.msgs.forEach(m => { if (m.id === b.id) m.st = b.st === "ok" ? "ok" : "hide"; });
    EVDIRTY.add(id); return send(res, 200, '{"ok":true}');
  }
  if (sub === "/seen" && req.method === "POST") {
    if (evLimit(req, id + "s", 30, 600000)) return send(res, 429, '{"error":"busy"}');
    const b = await readJson(req, 5000); if (!b || typeof b.add !== "object") return send(res, 400, '{"error":"bad_json"}');
    const io = evIO(id), names = new Set(((evCfg(id) || {}).sponsors || []).map(s => s.name));
    for (const [k, v] of Object.entries(b.add)) { if (!names.has(k)) continue; const s = io.seen[k] || (io.seen[k] = { n: 0, s: 0, r: 0 });
      for (const f of ["n", "s", "r"]) s[f] += Math.max(0, Math.min(60, parseInt(v[f], 10) || 0)); }
    EVDIRTY.add(id); return send(res, 200, '{"ok":true}');
  }
  send(res, 405, '{"error":"method"}');
}

process.on("uncaughtException", e => { console.error("uncaught", e); });
process.on("unhandledRejection", e => { console.error("unhandled", e); });

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/menu") return menuApi(req, res, url);
  if (url.pathname === "/api/track") return trackApi(req, res, url);
  if (url.pathname === "/api/report") return reportApi(req, res, url);
  if (url.pathname === "/api/jaww/predict") return predictApi(req, res, url);
  if (url.pathname === "/api/ev" || url.pathname.startsWith("/api/ev/")) return evApi(req, res, url);
  if (url.pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  if (url.pathname === "/api/offers") return offersApi(req, res, url);
  if (url.pathname === "/api/jaww") return jawwApi(req, res, url);
  if (url.pathname === "/api/jaww/pair") return jawwPair(req, res, url);
  if (url.pathname === "/api/jaww/ping" && req.method === "POST") return jawwPing(req, res, url);
  if (url.pathname === "/api/jaww/status") return send(res, 200, JSON.stringify(SEENS.get((url.searchParams.get("v") || "").replace(/[^a-z0-9-]/g, "")) || {}));
  if (url.pathname === "/health") { try { fs.accessSync(DATA_DIR, fs.constants.W_OK); return send(res, 200, "ok", "text/plain"); } catch { return send(res, 503, "data dir not writable", "text/plain"); } }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch {}
  if (!file.startsWith(ROOT) || /server\.js|package\.json|\.env|[\\/]data[\\/]/.test(file)) file = path.join(ROOT, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) return fs.readFile(path.join(ROOT, "index.html"), (_, d) => send(res, 200, d, TYPES[".html"]));
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  });
}).listen(PORT, () => console.log("nadil on :" + PORT));
