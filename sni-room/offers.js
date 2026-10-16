/* =========================================================
   عروض نادل: التخزين + حساب العروض الفعّالة
   يستخدمه المنيو (للعرض) ولوحة التحكم (للإضافة والتعديل)
   ========================================================= */
(function(){
  const D = window.NADIL_DATA || {}, R = D.restaurant || {};
  const cfg = D.offersStore || {type: "local"};
  const slug = R.slug || (R.nameEn || "rest").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const LKEY = "nadil_offers_" + slug;

  const store = {
    /* يرجع قائمة العروض */
    async load(){
      if (cfg.type === "api") {
        const r = await fetch(cfg.url + "?r=" + encodeURIComponent(slug), {cache: "no-store"});
        if (!r.ok) throw new Error("تعذّر تحميل العروض (" + r.status + ")");
        const j = await r.json(); return Array.isArray(j.offers) ? j.offers : [];
      }
      try { return JSON.parse(localStorage.getItem(LKEY) || "null") || (D.offers || []); }
      catch(e) { return D.offers || []; }
    },
    /* يحفظ القائمة كاملة. pin مطلوب في وضع الخادم */
    async save(offers, pin){
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

  window.NadilOffers = { store, isLive, slug };
})();
