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

const TYPES = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".css": "text/css", ".js": "text/javascript" };

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

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  if (url.pathname === "/health") return send(res, 200, "ok", "text/plain");
  let file = path.normalize(path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(ROOT) || /server\.js|package\.json|\.env/.test(file)) file = path.join(ROOT, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) return fs.readFile(path.join(ROOT, "index.html"), (_, d) => send(res, 200, d, TYPES[".html"]));
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  });
}).listen(PORT, () => console.log("nadil on :" + PORT));
