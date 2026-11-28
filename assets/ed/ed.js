/* Advon Editor — page side. Applies the texts the owner changed in admin.html.
   Texts only (textContent) — never HTML. Keys = hash of the original text. */
(function () {
  'use strict';
  var W = window, D = document, cs = D.currentScript;
  var BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DETAILS|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|SECTION|TABLE|TBODY|THEAD|TFOOT|TR|TD|TH|UL|SUMMARY)$/;
  var SKIP = /^(SCRIPT|STYLE|SVG|NOSCRIPT|TEMPLATE|FORM|SELECT|TEXTAREA|INPUT|IFRAME|CANVAS|VIDEO|AUDIO|CODE|PRE|OBJECT|MATH)$/;
  var LETTER = /[A-Za-zÀ-ɏͰ-Ͽἀ-῿]/;
  function tag(n) { return (n.tagName || '').toUpperCase(); }
  function norm(s) { return (s || '').replace(/[\s ]+/g, ' '); }
  function itext(n) {            // text of an inline element, without svg/script
    var out = '', c = n.firstChild;
    for (; c; c = c.nextSibling) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1 && !SKIP.test(tag(c))) out += (tag(c) === 'BR' ? ' ' : itext(c));
    }
    return out;
  }
  function slots(el) {
    var r = [], c = el.firstChild, t, s;
    for (; c; c = c.nextSibling) {
      if (c.nodeType === 3) { s = norm(c.nodeValue); r.push({ t: s.trim() ? 'P' : 'W', n: c, s: s }); }
      else if (c.nodeType === 1) {
        t = tag(c);
        if (t === 'BR') r.push({ t: 'N', n: c });
        else if (SKIP.test(t) || BLOCK.test(t) || c.hasAttribute('data-noed')) r.push({ t: 'O', n: c });
        else { s = norm(itext(c)).trim(); r.push(s ? { t: 'B', n: c, s: s } : { t: 'O', n: c }); }
      }
    }
    return r;
  }
  function display(el) {
    var o = '', sl = slots(el), i, x;
    for (i = 0; i < sl.length; i++) {
      x = sl[i];
      o += x.t === 'P' ? x.s : x.t === 'W' ? ' ' : x.t === 'B' ? '⟦' + x.s + '⟧' : x.t === 'N' ? '\n' : '';
    }
    return o.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  }
  function parse(str) {
    var r = [], m, re = /⟦([^⟧]*)⟧|\n|[^⟦\n]+/g;
    while ((m = re.exec(str))) r.push(m[0] === '\n' ? { t: 'N' } : m[1] !== undefined ? { t: 'B', s: m[1] } : { t: 'P', s: m[0] });
    return r;
  }
  function shape(str) { return parse(str).filter(function (x) { return x.t !== 'P'; }).map(function (x) { return x.t; }).join(''); }
  function setText(node, txt, old) {
    var lead = /^\s/.test(old) || /^\s/.test(txt), trail = /\s$/.test(old) || /\s$/.test(txt);
    node.nodeValue = (lead ? ' ' : '') + txt.trim() + (trail ? ' ' : '');
  }
  function setInline(n, txt) {
    var tn = [];
    (function f(x) { for (var c = x.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) { if (/\S/.test(c.nodeValue)) tn.push(c); } else if (c.nodeType === 1 && !SKIP.test(tag(c))) f(c); } })(n);
    if (!tn.length) { n.appendChild(D.createTextNode(txt)); return; }
    setText(tn[0], txt, tn[0].nodeValue);
    for (var i = 1; i < tn.length; i++) tn[i].nodeValue = '';
  }
  function reconcile(el, str) {
    var sl = slots(el), tk = parse(str), gaps = [[]], seps = [], pg = [''], ps = [], i, k, g, tx, first, doc = el.ownerDocument;
    for (i = 0; i < sl.length; i++) { if (sl[i].t === 'B' || sl[i].t === 'N') { seps.push(sl[i]); gaps.push([]); } else gaps[gaps.length - 1].push(sl[i]); }
    for (i = 0; i < tk.length; i++) { if (tk[i].t === 'P') pg[pg.length - 1] += tk[i].s; else { ps.push(tk[i]); pg.push(''); } }
    if (ps.length !== seps.length) return false;
    for (k = 0; k < seps.length; k++) if (ps[k].t !== seps[k].t) return false;
    for (k = 0; k < gaps.length; k++) {
      g = gaps[k]; tx = g.filter(function (x) { return x.t === 'P'; });
      var oldp = tx.map(function (x) { return x.s; }).join('');
      if (norm(pg[k]).trim() === norm(oldp).trim()) continue;
      first = tx[0] || g.filter(function (x) { return x.t === 'W'; })[0];
      if (first) { setText(first.n, pg[k], tx[0] ? tx[0].n.nodeValue : ''); for (i = 1; i < tx.length; i++) tx[i].n.nodeValue = ''; }
      else {
        var tnode = doc.createTextNode(pg[k]);
        if (k > 0) el.insertBefore(tnode, seps[k - 1].n.nextSibling); else el.insertBefore(tnode, el.firstChild);
      }
    }
    for (k = 0; k < seps.length; k++) if (seps[k].t === 'B' && norm(ps[k].s).trim() !== seps[k].s) setInline(seps[k].n, ps[k].s);
    return true;
  }
  function hash(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + s.length.toString(36);
  }
  function isChrome(c) {
    var t = tag(c), cl = ' ' + (c.getAttribute('class') || '') + ' ';
    return t === 'HEADER' || t === 'FOOTER' || t === 'NAV' || cl.indexOf(' dr ') > -1 || cl.indexOf(' drawer ') > -1 || c.hasAttribute('data-ed-all');
  }
  function units(root, cb) {          // cb(el, key, text, chrome)
    (function visit(c, ch) {
      var t = tag(c), n, direct = false, d, dyn;
      if (SKIP.test(t) || c.hasAttribute('data-noed') || /(^|\s)(brand|skip|wm|io-w|ia-w|adv)(\s|$)/.test(c.getAttribute('class') || '') || (t === 'A' && /advonmedia\.com/.test(c.getAttribute('href') || ''))) return;
      ch = ch || isChrome(c);
      for (n = c.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue)) { direct = true; break; }
      if (direct) {
        d = display(c);
        for (n = c.firstElementChild, dyn = false; n; n = n.nextElementSibling) if (!BLOCK.test(tag(n)) && !SKIP.test(tag(n)) && (n.id || n.querySelector('[id]'))) dyn = true;
        if (!dyn && LETTER.test(d) && d.length > 2 && d.length < 6000) cb(c, (ch ? 'c:' : 'm:') + hash(d), d, ch);
        for (n = c.firstElementChild; n; n = n.nextElementSibling) if (BLOCK.test(tag(n))) visit(n, ch);
      } else for (n = c.firstElementChild; n; n = n.nextElementSibling) visit(n, ch);
    })(root, false);
  }
  W.AdvonEd = { units: units, display: display, shape: shape, reconcile: reconcile, hash: hash };
  if (W.ADED_LIB || !cs) return;

  /* ---------- page mode ---------- */
  var site = cs.getAttribute('data-site') || 'site', root = new URL(cs.getAttribute('data-root') || './', location.href);
  var path = decodeURIComponent(location.pathname.slice(root.pathname.length)).replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '');
  var trial = /(^|\.)drafts\.advonmedia\.com$|github\.io$|^localhost$|^127\./.test(location.hostname) || location.protocol === 'file:';
  var prev = W.name === 'aded-prev';
  var LS = { get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  var list = [], keep = !trial && !prev;
  function mapOf(c) { var m = {}, k, a = (c && c.all) || {}, p = (c && c.pages && c.pages[path]) || {}; for (k in a) m[k] = a[k]; for (k in p) m[k] = p[k]; return m; }
  function empty(c) { if (!c) return true; var k; for (k in (c.all || {})) return false; for (k in (c.pages || {})) for (var j in c.pages[k]) return false; return true; }
  function first(c) {
    var m = mapOf(c);
    units(D.body, function (el, k, d) {
      var u = { el: el, k: k, d: d, cur: d, o: keep ? el.cloneNode(true) : null };
      if (prev) el.setAttribute('data-e', k);
      if (m[k] !== undefined && m[k] !== d && reconcile(el, m[k])) u.cur = m[k];
      list.push(u);
    });
  }
  function later(c) {
    var m = mapOf(c);
    list.forEach(function (u) {
      var v = m[u.k] === undefined ? u.d : m[u.k];
      if (v === u.cur || !u.o) return;
      var cl = u.o.cloneNode(true); while (u.el.firstChild) u.el.removeChild(u.el.firstChild); while (cl.firstChild) u.el.appendChild(cl.firstChild);
      if (v !== u.d) reconcile(u.el, v); u.cur = v;
    });
  }
  var c0 = prev ? LS.get('aded:draft:' + site) : trial ? LS.get('aded:trial:' + site) : LS.get('aded:pub:' + site);
  try { first(c0); } catch (e) { }
  if (prev) {
    var st = D.createElement('style'); st.textContent = '.aded-hl{outline:3px solid #F5A623!important;outline-offset:5px;border-radius:4px}html{scroll-behavior:auto!important}'; D.head.appendChild(st);
    var syk = 'aded:sy:' + path;
    W.addEventListener('load', function () { var y = +sessionStorage.getItem(syk) || 0; if (y) setTimeout(function () { W.scrollTo(0, y); }, 60); });
    W.addEventListener('pagehide', function () { try { sessionStorage.setItem(syk, W.scrollY); } catch (e) { } });
    D.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]'), u = e.target.closest && e.target.closest('[data-e]');
      if (a && a.getAttribute('href').charAt(0) !== '#') e.preventDefault();
      if (u) parent.postMessage({ aded: 'pick', k: u.getAttribute('data-e') }, location.origin);
    }, true);
    W.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.aded !== 'hl') return;
      var els = D.querySelectorAll('[data-e="' + String(e.data.k).replace(/[^a-z0-9:]/g, '') + '"]'), i, el;
      for (i = 0; i < els.length; i++) if (els[i].offsetParent !== null && els[i].getClientRects().length) { el = els[i]; break; }
      [].forEach.call(D.querySelectorAll('.aded-hl'), function (x) { x.classList.remove('aded-hl'); });
      if (el) { el.classList.add('aded-hl'); el.scrollIntoView({ block: 'center' }); setTimeout(function () { el.classList.remove('aded-hl'); }, 2200); }
    });
  } else if (trial) {
    if (!empty(c0)) D.addEventListener('DOMContentLoaded', function () {
      var b = D.createElement('div'); b.setAttribute('data-noed', ''); b.setAttribute('role', 'status');
      b.style.cssText = 'position:fixed;left:12px;bottom:76px;z-index:2147483000;background:#FFF4CC;color:#3A2E00;font:600 12.5px/1.35 system-ui,sans-serif;padding:9px 12px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:250px';
      b.textContent = 'Δοκιμαστικές αλλαγές από το Admin Panel — φαίνονται μόνο σε αυτή τη συσκευή. ';
      var x = D.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Κλείσιμο'); x.style.cssText = 'border:0;background:none;font:700 16px system-ui;cursor:pointer;color:inherit;margin-left:4px'; x.onclick = function () { b.remove(); }; b.appendChild(x);
      D.body.appendChild(b);
    });
  } else {
    fetch(root.pathname + 'api/ed/content', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (!c || typeof c !== 'object') return;
      if (!c0 || c0.t !== c.t) { if (empty(c)) { try { localStorage.removeItem('aded:pub:' + site); } catch (e) { } } else LS.set('aded:pub:' + site, c); later(c); }
      list.forEach(function (u) { u.o = null; });
    }).catch(function () { });
  }
})();
