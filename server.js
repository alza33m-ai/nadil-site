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
const PINS = (() => { try { return JSON.parse(process.env.ADMIN_PINS || "{}"); } catch { return {}; } })();
const DATA_DIR = path.join(ROOT, "data"); try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
async function offersApi(req, res, url) {
  const slug = (url.searchParams.get("r") || "").replace(/[^a-z0-9-]/g, "");
  if (!slug) return send(res, 400, '{"error":"no_restaurant"}');
  const file = path.join(DATA_DIR, "offers-" + slug + ".json");
  if (req.method === "GET") {
    fs.readFile(file, "utf8", (err, d) => send(res, 200, err ? '{"offers":[]}' : d));
    return;
  }
  if (req.method !== "PUT") return send(res, 405, '{"error":"method"}');
  const want = PINS[slug] || process.env.ADMIN_PIN;
  if (!want || req.headers["x-nadil-pin"] !== String(want)) return send(res, 401, '{"error":"pin"}');
  let raw = ""; for await (const c of req) { raw += c; if (raw.length > 200000) return send(res, 413, '{"error":"too_large"}'); }
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, '{"error":"bad_json"}'); }
  if (!Array.isArray(body.offers) || body.offers.length > 50) return send(res, 400, '{"error":"bad_offers"}');
  fs.writeFile(file, JSON.stringify({ offers: body.offers, updated: new Date().toISOString() }), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : '{"ok":true}'));
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
  fs.writeFile(file, JSON.stringify(body), err => send(res, err ? 500 : 200, err ? '{"error":"write"}' : '{"ok":true}'));
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

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  if (url.pathname === "/api/offers") return offersApi(req, res, url);
  if (url.pathname === "/api/jaww") return jawwApi(req, res, url);
  if (url.pathname === "/api/jaww/pair") return jawwPair(req, res, url);
  if (url.pathname === "/api/jaww/ping" && req.method === "POST") return jawwPing(req, res, url);
  if (url.pathname === "/api/jaww/status") return send(res, 200, JSON.stringify(SEENS.get((url.searchParams.get("v") || "").replace(/[^a-z0-9-]/g, "")) || {}));
  if (url.pathname === "/health") return send(res, 200, "ok", "text/plain");
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch {}
  if (!file.startsWith(ROOT) || /server\.js|package\.json|\.env|[\\/]data[\\/]/.test(file)) file = path.join(ROOT, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) return fs.readFile(path.join(ROOT, "index.html"), (_, d) => send(res, 200, d, TYPES[".html"]));
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  });
}).listen(PORT, () => console.log("nadil on :" + PORT));
