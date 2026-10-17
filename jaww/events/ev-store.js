/* جوّ للفعاليات: التخزين والمزامنة
   يستخدم خادم نادل إذا موجود (/api/ev)، وإلا يشتغل تجريبي على نفس الجهاز بين التبويبات. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var EID = (Q.get('e') || 'demo').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'demo';
  var LS_CFG = 'ev-cfg-' + EID, LS_IO = 'ev-io-' + EID, LS_PIN = 'ev-pin-' + EID;
  var api = false, listeners = [];
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function dev() { var d = lsGet('ev-dev', ''); if (!d) { d = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); lsSet('ev-dev', d); } return d; }
  function emptyIO() { return { votes: {}, voters: {}, msgs: [], seen: {} }; }

  var ready = fetch('/api/ev?e=' + EID, { cache: 'no-store' })
    .then(function (r) { api = r.ok && (r.headers.get('content-type') || '').indexOf('json') >= 0; return api ? r.json() : null; })
    .catch(function () { api = false; return null; });

  function pin() { return lsGet(LS_PIN, ''); }
  function setPin(p) { lsSet(LS_PIN, p); }
  function hdr(extra) { var h = { 'Content-Type': 'application/json' }; if (pin()) h['X-Nadil-Pin'] = pin(); for (var k in extra || {}) h[k] = extra[k]; return h; }

  var Store = {
    eid: EID, dev: dev,
    isApi: function () { return api; },
    ready: ready,
    pin: pin, setPin: setPin,
    /* إعدادات الفعالية */
    loadCfg: function () { return ready.then(function (d) { if (api) return d && d.cfg ? d.cfg : null; return lsGet(LS_CFG, null); }); },
    saveCfg: function (cfg) {
      lsSet(LS_CFG, cfg);
      if (!api) return Promise.resolve(true);
      return fetch('/api/ev?e=' + EID, { method: 'PUT', headers: hdr(), body: JSON.stringify({ cfg: cfg }) })
        .then(function (r) { if (r.status === 401) throw new Error('pin'); if (!r.ok) throw new Error('save'); return true; });
    },
    /* تفاعل الضيوف: التصويت والتهاني */
    loadIO: function (full) {
      if (!api) return Promise.resolve(lsGet(LS_IO, emptyIO()));
      return fetch('/api/ev/live?e=' + EID + (full ? '&full=1' : ''), { cache: 'no-store', headers: full ? hdr() : {} }).then(function (r) { return r.ok ? r.json() : emptyIO(); });
    },
    vote: function (pollId, i) {
      if (!api) { var io = lsGet(LS_IO, emptyIO()), v = io.voters[pollId] || (io.voters[pollId] = []), d = dev();
        if (v.indexOf(d) >= 0) return Promise.resolve({ already: true });
        v.push(d); var t = io.votes[pollId] || (io.votes[pollId] = {}); t[i] = (t[i] || 0) + 1; lsSet(LS_IO, io); return Promise.resolve({ ok: true }); }
      return fetch('/api/ev/act?e=' + EID, { method: 'POST', headers: hdr(), body: JSON.stringify({ t: 'vote', p: pollId, i: i, dev: dev() }) }).then(function (r) { return r.json(); });
    },
    message: function (name, text, moderate) {
      if (!api) { var io = lsGet(LS_IO, emptyIO());
        io.msgs.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name, text: text, at: Date.now(), st: moderate ? 'wait' : 'ok' });
        if (io.msgs.length > 500) io.msgs.shift(); lsSet(LS_IO, io); return Promise.resolve({ ok: true, wait: !!moderate }); }
      return fetch('/api/ev/act?e=' + EID, { method: 'POST', headers: hdr(), body: JSON.stringify({ t: 'msg', name: name, text: text, dev: dev() }) }).then(function (r) { return r.json(); });
    },
    moderate: function (id, st) {
      if (!api) { var io = lsGet(LS_IO, emptyIO()); io.msgs.forEach(function (m) { if (m.id === id) m.st = st; }); lsSet(LS_IO, io); return Promise.resolve(true); }
      return fetch('/api/ev/mod?e=' + EID, { method: 'PUT', headers: hdr(), body: JSON.stringify({ id: id, st: st }) }).then(function (r) { if (r.status === 401) throw new Error('pin'); return r.ok; });
    },
    /* ظهور الرعاة: الشاشة تسجّل كم ثانية ظهر كل راعي */
    seen: function (add) {
      if (!api) { var io = lsGet(LS_IO, emptyIO()); for (var k in add) { var s = io.seen[k] || (io.seen[k] = {}); for (var f in add[k]) s[f] = (s[f] || 0) + (add[k][f] || 0); } lsSet(LS_IO, io); return; }
      fetch('/api/ev/seen?e=' + EID, { method: 'POST', headers: hdr(), body: JSON.stringify({ add: add }) }).catch(function () {});
    },
    resetIO: function (what) {
      if (!api) { var io = lsGet(LS_IO, emptyIO()); if (what === 'msgs') io.msgs = []; if (what === 'seen') io.seen = {}; lsSet(LS_IO, io); return Promise.resolve(true); }
      return fetch('/api/ev/mod?e=' + EID, { method: 'PUT', headers: hdr(), body: JSON.stringify({ reset: what }) }).then(function (r) { return r.ok; });
    },
    /* تغييرات من تبويب ثاني على نفس الجهاز */
    onLocal: function (fn) { listeners.push(fn); }
  };
  window.addEventListener('storage', function (e) { if (e.key === LS_CFG || e.key === LS_IO) listeners.forEach(function (f) { f(e.key === LS_CFG ? 'cfg' : 'io'); }); });
  window.EvStore = Store;
})();
