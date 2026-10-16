/* =========================================================
   عروض نادل: التخزين + حساب العروض الفعّالة
   يستخدمه المنيو (للعرض) ولوحة التحكم (للإضافة والتعديل)
   ========================================================= */
(function(){
  const D = window.NADIL_DATA || {}, R = D.restaurant || {};
  const cfg0 = D.offersStore || {type: "local"};
  /* type: "auto" = يجرب الخادم، ولو ما فيه خادم (مثل GitHub Pages) يشتغل تجريبي على الجهاز */
  const cfg = {type: cfg0.type === "api" ? "api" : "local", url: cfg0.url || "/api/offers", base: cfg0.base || ""};
  const slug = R.slug || (R.nameEn || "rest").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const LKEY = "nadil_offers_" + slug;

  const probeUrl = (cfg0.base || "") + "/api/menu?r=" + encodeURIComponent(slug);
  const ready = cfg0.type === "auto"
    ? fetch(probeUrl, {cache: "no-store"}).then(r => r.ok && (r.headers.get("content-type") || "").includes("json")).catch(() => false).then(ok => { cfg.type = ok ? "api" : "local"; store.mode = cfg.type; })
    : Promise.resolve();
  const store = {
    ready,
    /* يرجع قائمة العروض */
    async load(){ await ready;
      if (cfg.type === "api") {
        const r = await fetch(cfg.url + "?r=" + encodeURIComponent(slug), {cache: "no-store"});
        if (!r.ok) throw new Error("تعذّر تحميل العروض (" + r.status + ")");
        const j = await r.json(); return Array.isArray(j.offers) ? j.offers : (D.offers || []);
      }
      try { return JSON.parse(localStorage.getItem(LKEY) || "null") || (D.offers || []); }
      catch(e) { return D.offers || []; }
    },
    /* يحفظ القائمة كاملة. pin مطلوب في وضع الخادم */
    async save(offers, pin){ await ready;
      if (cfg.type === "api") {
        const r = await fetch(cfg.url + "?r=" + encodeURIComponent(slug), {method: "PUT",
          headers: {"Content-Type": "application/json", "X-Nadil-Pin": pin || ""}, body: JSON.stringify({offers})});
        if (r.status === 401) throw new Error("الرمز السري غير صحيح");
        if (!r.ok) throw new Error("ما انحفظت العروض (" + r.status + ")");
        return true;
      }
      try { localStorage.setItem(LKEY, JSON.stringify(offers)); return true; }
      catch(e) { throw new Error("المتصفح ما سمح بالحفظ"); }
    },
    mode: cfg.type === "api" ? "api" : "local"
  };

  /* هل العرض شغّال الحين؟ يراعي التاريخ والأيام والساعات */
  function isLive(o, now){
    now = now || new Date();
    if (!o || !o.active) return false;
    const day = now.toISOString ? new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,10) : "";
    if (o.start && day < o.start) return false;
    if (o.end && day > o.end) return false;
    if (Array.isArray(o.days) && o.days.length && !o.days.includes(now.getDay())) return false;
    if (o.from && o.to) {
      const m = now.getHours()*60 + now.getMinutes();
      const [fh,fm] = o.from.split(":").map(Number), [th,tm] = o.to.split(":").map(Number);
      const a = fh*60+fm, b = th*60+tm;
      if (a <= b ? (m < a || m > b) : (m < a && m > b)) return false;
    }
    return true;
  }

  /* ---------- أصناف المطعم: تعديلات صاحب المطعم فوق data.js ---------- */
  const MKEY = "nadil_menu_" + slug;
  const api = (p) => (cfg.base || "") + p + "?r=" + encodeURIComponent(slug);
  const menu = {
    async load(){ await ready;
      if (cfg.type === "api") {
        const r = await fetch(api("/api/menu"), {cache: "no-store"});
        if (!r.ok) throw new Error("تعذّر تحميل الأصناف (" + r.status + ")");
        const j = await r.json(); return Array.isArray(j.items) ? j : null;
      }
      try { const j = JSON.parse(localStorage.getItem(MKEY) || "null"); return j && Array.isArray(j.items) ? j : null; } catch(e) { return null; }
    },
    async save(doc, pin){ await ready;
      if (cfg.type === "api") {
        const r = await fetch(api("/api/menu"), {method: "PUT", headers: {"Content-Type": "application/json", "X-Nadil-Pin": pin || ""}, body: JSON.stringify(doc)});
        if (r.status === 401) throw new Error("الرمز السري غير صحيح");
        if (!r.ok) throw new Error("ما انحفظت الأصناف (" + r.status + ")");
        return true;
      }
      try { localStorage.setItem(MKEY, JSON.stringify(doc)); return true; } catch(e) { throw new Error("المتصفح ما سمح بالحفظ"); }
    },
    async reset(pin){ await ready;
      if (cfg.type === "api") { const r = await fetch(api("/api/menu"), {method: "DELETE", headers: {"X-Nadil-Pin": pin || ""}}); if (!r.ok) throw new Error("ما قدرنا نرجّع المنيو (" + r.status + ")"); return true; }
      try { localStorage.removeItem(MKEY); } catch(e) {} return true;
    },
    /* يطبّق التعديلات على بيانات المنيو */
    apply(doc){ if (!doc) return false; if (Array.isArray(doc.items)) D.items = doc.items; if (Array.isArray(doc.categories) && doc.categories.length) D.categories = doc.categories; return true; }
  };

  /* ---------- الإحصائيات (للتقرير الأسبوعي) ---------- */
  function stat(ev){ ready.then(() => stat2(ev)); }
  function stat2(ev){
    if (cfg.type !== "api") return;
    try { const body = JSON.stringify(ev);
      if (navigator.sendBeacon) navigator.sendBeacon(api("/api/track"), new Blob([body], {type: "text/plain"}));
      else fetch(api("/api/track"), {method: "POST", body, keepalive: true}).catch(() => {});
    } catch(e) {}
  }
  async function report(days, pin){ await ready;
    const r = await fetch(api("/api/report") + "&days=" + (days || 7), {cache: "no-store", headers: {"X-Nadil-Pin": pin || ""}});
    if (r.status === 401) throw new Error("الرمز السري غير صحيح");
    if (!r.ok) throw new Error("تعذّر تحميل التقرير (" + r.status + ")");
    return r.json();
  }

  window.NadilOffers = { store, isLive, slug, menu, stat, report };
})();
