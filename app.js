'use strict';
/* AMIRAN TICKET — نسخه وب‌اپ (PWA) برای آیفون
   همه‌ی داده‌ها فقط روی همین دستگاه ذخیره می‌شوند (localStorage). */

// ───────────────────────── ابزارها ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('حافظه‌ی دستگاه پر است'); return false; } },
};
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 هم‌زمان (برای رمز مدیریتی: باز شدن انتخاب فایل باید داخل همان لمس کاربر انجام شود)
function sha256sync(str) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = Array.from(new TextEncoder().encode(str)); const l = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 255);
  let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[o+4*i] << 24) | (bytes[o+4*i+1] << 16) | (bytes[o+4*i+2] << 8) | bytes[o+4*i+3];
    for (let i = 16; i < 64; i++) { const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3), s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10); w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0; }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [h[0]+a|0,h[1]+b|0,h[2]+c|0,h[3]+d|0,h[4]+e|0,h[5]+f|0,h[6]+g|0,h[7]+hh|0];
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const ADMIN_HASH = '834cf4b11a2a4c730e63551ee75270f589791d3c48565aa4d81412e4e6678d37';

// ───────────────────────── تنظیمات ─────────────────────────
const Settings = {
  get() { return Object.assign({ dup: true, vib: true, qr: true, bc: '' }, LS.get('at_settings', {})); },
  set(patch) { LS.set('at_settings', Object.assign(Settings.get(), patch)); },
};
const bcEndpoint = () => (window.BC_ENDPOINT || Settings.get().bc || '').trim();

// ───────────────────────── دیتابیس (localStorage) ─────────────────────────
const DB = {
  ops() { return LS.get('at_ops', []); },
  saveOp(name, items, id) {
    const ops = DB.ops(); const now = Date.now();
    let op = id != null ? ops.find(o => o.id === id) : null;
    if (!op) { op = { id: now, name, items: [], createdAt: now }; ops.unshift(op); }
    op.name = name; op.items = items; op.updatedAt = now;
    LS.set('at_ops', ops); return op.id;
  },
  deleteOp(id) { LS.set('at_ops', DB.ops().filter(o => o.id !== id)); },
  fest() { return LS.get('at_fest', []); },
  festSet() { return new Set(DB.fest().map(e => e.b)); },
  importFest(list) {
    const m = new Map(DB.fest().map(e => [e.b, e.q]));
    list.forEach(e => m.set(e.b, e.q));
    LS.set('at_fest', [...m].map(([b, q]) => ({ b, q })));
  },
  deleteFest(b) { LS.set('at_fest', DB.fest().filter(e => e.b !== b)); },
  clearFest() { LS.set('at_fest', []); },
};

// ───────────────────────── لایسنس (آفلاین) ─────────────────────────
const License = (() => {
  const DAY = 86400000;
  const HASHES = {
    '4cb3b9a7d2f4eddd75f2cf64e6a2ecd3bbe04f53ac959de75129a0f3f955c68b': 'trial',
    'd569e82230b186a5a30e836dbd3574d437f7ab5c43cfc567214188fa9f2cdbd6': 'sixMonth',
    '67e48e8c354ff483b9a8a90653ce03a44e6e8762b6cecc47ee9b2360b06c2e45': 'lifetime',
  };
  const MAX = { trial: 3, sixMonth: 1 };
  const LEN = { trial: 10, sixMonth: 183 };
  const TITLE = { trial: 'لایسنس ۱۰ روزه', sixMonth: 'لایسنس ۶ ماهه', lifetime: 'لایسنس دائمی' };
  const now = () => { const real = Date.now(); const seen = LS.get('lic_seen', 0); if (real > seen) { LS.set('lic_seen', real); return real; } return seen; };
  const status = () => {
    const kind = LS.get('lic_kind', null), start = LS.get('lic_start', null);
    if (!kind || !start) return null;
    if (kind === 'lifetime') return { kind, title: TITLE[kind], days: null, valid: true };
    const left = Math.max(0, Math.ceil((start + LEN[kind] * DAY - now()) / DAY));
    return { kind, title: TITLE[kind], days: left, valid: left > 0 };
  };
  const activate = async code => {
    code = (code || '').trim();
    if (!code) return 'کد لایسنس را وارد کنید.';
    const kind = HASHES[await sha256('SRXTICKET|' + code.toUpperCase())];
    if (!kind) return 'کد لایسنس نامعتبر است.';
    const uses = LS.get('lic_uses_' + kind, 0);
    if (MAX[kind] && uses >= MAX[kind]) return MAX[kind] === 1 ? 'این کد قبلاً روی این دستگاه استفاده شده است.' : `این کد روی این دستگاه ${MAX[kind]} بار استفاده شده و دیگر قابل استفاده نیست.`;
    LS.set('lic_kind', kind); LS.set('lic_start', now()); LS.set('lic_uses_' + kind, uses + 1);
    return null;
  };
  return { status, activate, valid: () => !!(status() && status().valid) };
})();

// ───────────────────────── فایل‌ها و خروجی ─────────────────────────
const Files = {
  txt: items => items.map(e => `${e.b},${e.q}`).join('\n') + (items.length ? '\n' : ''),
  safe(name, fb = 'AMIRAN_TICKET') {
    let v = (name || '').trim() || fb;
    v = v.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
    if (!v || v === '.' || v === '..') v = fb;
    if (v.length > 100) v = v.slice(0, 100).trim();
    return v || fb;
  },
  split(items, fs) {
    const festival = [], regular = [];
    items.forEach(e => (fs.has(e.b) ? festival : regular).push(e));
    return { festival, regular };
  },
  // دیتابیس خالی ← یک فایل ساده؛ وگرنه فقط گروه‌های غیرخالی (جشنواره / عادی / هر دو)
  build(name, items, fs, festName, regName) {
    const base = Files.safe(name);
    if (fs.size === 0) return [{ name: Files.safe(regName || base, base) + '.txt', text: Files.txt(items) }];
    const p = Files.split(items, fs);
    const fF = base + '_festival', rF = base + '_regular';
    const fn = Files.safe(festName || fF, fF);
    let rn = Files.safe(regName || rF, rF);
    if (rn === fn) rn += '_2';
    const out = [];
    if (p.festival.length) out.push({ name: fn + '.txt', text: Files.txt(p.festival) });
    if (p.regular.length) out.push({ name: rn + '.txt', text: Files.txt(p.regular) });
    return out;
  },
  parse(raw) {
    const m = new Map();
    raw.replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach(line => {
      const v = line.trim(); if (!v) return;
      let b = v, q = 1; const i = v.lastIndexOf(',');
      if (i >= 0) { b = v.slice(0, i).trim(); const n = parseInt(v.slice(i + 1).trim(), 10); if (!(n >= 1) || !/^\d+$/.test(v.slice(i + 1).trim())) return; q = n; }
      if (!b) return;
      m.set(b, (m.get(b) || 0) + q);
    });
    return [...m].map(([b, q]) => ({ b, q }));
  },
  blob: f => new Blob([f.text], { type: 'text/plain;charset=utf-8' }),
  async download(files) {
    for (const f of files) {
      const u = URL.createObjectURL(Files.blob(f));
      const a = document.createElement('a'); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000); await sleep(450);
    }
  },
  async share(files) {
    const list = files.map(f => new File([Files.blob(f)], f.name, { type: 'text/plain' }));
    try {
      if (navigator.canShare && navigator.canShare({ files: list })) { await navigator.share({ files: list, text: 'AMIRAN TICKET' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    await Files.download(files);
    toast('اشتراک‌گذاری پشتیبانی نشد؛ فایل دانلود شد');
  },
};

// ───────────────────────── ارسال به BC ─────────────────────────
async function bcSend(files, operation) {
  const url = bcEndpoint();
  if (!url.startsWith('https://')) throw new Error('آدرس سرویس BC تنظیم نشده است (تنظیمات ← آدرس سرویس BC).');
  if (!files.length) throw new Error('فایلی برای ارسال وجود ندارد.');
  const b64 = t => { const b = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const body = JSON.stringify({ app: 'SRX_TICKET', ts: Date.now(), operation, files: files.map(f => ({ name: f.name, data: b64(f.text) })) });
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
  let res, text;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, signal: ctl.signal });
    text = await res.text();
  } catch (e) {
    throw new Error(navigator.onLine ? 'ارسال ناموفق بود یا زمان آن تمام شد. دوباره تلاش کنید.' : 'اتصال به اینترنت برقرار نیست.');
  } finally { clearTimeout(to); }
  if (!res.ok) throw new Error(`خطای سرور (${res.status}). آدرس سرویس یا Deploy را بررسی کنید.`);
  let j; try { j = JSON.parse(text); } catch (e) { throw new Error('پاسخ نامعتبر از سرور دریافت شد. Deploy را با دسترسی Anyone انجام داده‌اید؟'); }
  if (!(j && j.ok === true)) throw new Error(j && j.message ? String(j.message) : 'ارسال ناموفق بود.');
}

// ───────────────────────── دیالوگ‌ها ─────────────────────────
function modal({ title, body = '', actions = [], sheet = false, onMount }) {
  return new Promise(resolve => {
    const root = $('#modal-root'); const ov = document.createElement('div');
    ov.className = 'ov' + (sheet ? ' sheet' : '');
    ov.innerHTML = `<div class="dlg">${title ? `<h2>${esc(title)}</h2>` : ''}${body}${actions.length ? `<div class="acts">${actions.map((a, i) => `<button data-i="${i}" class="${a.primary ? 'p' : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
    const close = v => { ov.remove(); resolve(v); };
    ov.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (b) { const a = actions[+b.dataset.i]; if (a.run) { const r = a.run(ov, close); if (r === false) return; } close(a.value); }
      else if (e.target === ov && !actions.noBackdrop) close(undefined);
    });
    root.appendChild(ov); if (onMount) onMount(ov, close);
  });
}
const confirmDlg = (title, text, okLabel) => modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'لغو', value: false }, { label: okLabel, value: true, primary: true }] });
function adminDlg(message, onOk) {
  return modal({
    title: 'رمز مدیریتی', body: `<p>${esc(message || 'برای ادامه رمز مدیریتی را وارد کنید.')}</p><input id="pw" class="f ltr" type="password" autocomplete="off" placeholder="رمز"><div class="errt" id="pwe"></div>`,
    actions: [{ label: 'لغو', value: false }, {
      label: 'تأیید', primary: true, value: true, run: (ov) => {
        const v = $('#pw', ov).value.trim();
        if (sha256sync(v) === ADMIN_HASH) { ov.remove(); onOk && onOk(); } else { $('#pwe', ov).textContent = 'رمز اشتباه است'; }
        return false;
      },
    }],
  });
}
async function namesDlg(base, single, parts) {
  const f = !single && parts.festival.length, r = single ? parts.regular.length || true : parts.regular.length;
  const fld = (id, label, val) => `<div class="fld"><label class="lb">${label}</label><div class="row"><input id="${id}" class="f" value="${esc(val)}"><span class="muted">.txt</span></div></div>`;
  const body = (f ? fld('nf', 'نام فایل جشنواره', base + '_festival') : '') + (r ? fld('nr', f ? 'نام فایل عادی' : 'نام فایل', f ? base + '_regular' : base) : '');
  return modal({
    title: 'نام فایل‌ها', body, actions: [{ label: 'لغو', value: null }, {
      label: 'تأیید', primary: true, run: (ov, close) => { close({ festival: $('#nf', ov) ? $('#nf', ov).value : '', regular: $('#nr', ov) ? $('#nr', ov).value : '' }); return false; },
    }],
  });
}

// ───────────────────────── ناوبری ─────────────────────────
const stack = []; let cleanup = null;
function go(view, params, replace) {
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  if (replace && stack.length) stack.pop();
  stack.push([view, params]);
  render();
}
function back() { if (stack.length > 1) { if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; } stack.pop(); render(); } }
function home() { if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; } stack.length = 0; stack.push(['home']); render(); }
function render() {
  const [v, p] = stack[stack.length - 1];
  $('#bg').className = (v === 'splash' || v === 'home' || v === 'license') ? 'full' : 'soft';
  app.innerHTML = ''; app.onclick = null; Views[v](p || {});
}
const tb = (title, noBack) => `<div class="tb">${noBack ? '<span class="sp"></span>' : '<button class="back" data-act="back" aria-label="بازگشت">→</button>'}<h1>${esc(title)}</h1><span class="sp"></span></div>`;
const foot = '<div class="foot">SRX&nbsp;&nbsp;TEAM</div>';
const btn = (act, ic, title, sub, bright, extra = '') => `<button class="gb${bright ? ' bright' : ''}" data-act="${act}" ${extra}><span class="ic">${ic}</span><span class="tx"><span class="t">${esc(title)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span></button>`;
const logo = (w) => `<img class="logo" src="assets/logo.png" alt="AMIRAN TICKET" style="width:${w}px">`;
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !app.contains(b)) return;
  if (b.dataset.act === 'back') back();
});

// ───────────────────────── صفحه‌ها ─────────────────────────
const Views = {
  splash() {
    app.innerHTML = `<div class="view splash"><div class="mid">${logo(240)}</div>
      <div dir="ltr" class="muted" style="letter-spacing:4px;font-size:14px">SCAN&nbsp;&nbsp;•&nbsp;&nbsp;PRINT&nbsp;&nbsp;•&nbsp;&nbsp;MANAGE</div>
      <div class="bar"><i></i></div>${foot}</div>`;
    setTimeout(() => { if (stack[stack.length - 1][0] === 'splash') go(License.valid() ? 'home' : 'license', null, true); }, 1300);
  },

  license() {
    app.innerHTML = `<div class="view"><div style="margin-top:6vh">${logo(210)}</div>
      <div class="scroll" style="padding-top:18px"><div class="card">
        <div style="font-weight:900;font-size:16px;text-align:center;margin-bottom:6px">فعال‌سازی برنامه</div>
        <p class="muted small" style="text-align:center;margin:0 0 14px;line-height:1.9">کد لایسنس را وارد کنید. این کار فقط یک‌بار لازم است.<br>اگر برنامه را حذف و دوباره نصب کنید یا اطلاعات سایت پاک شود، باید دوباره کد را وارد کنید.</p>
        <input id="code" class="f ltr" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="کد لایسنس">
        <div class="errt" id="err" style="color:#ff6b6b;text-align:center;min-height:20px;margin-top:8px;font-size:13px"></div>
      </div><div style="height:14px"></div>${btn('act', '✔', 'فعال‌سازی', '', true, 'id="go"')}</div>${foot}</div>`;
    const go_ = async () => {
      const b = $('#go'); b.disabled = true;
      const err = await License.activate($('#code').value);
      b.disabled = false;
      if (err) { $('#err').textContent = err; return; }
      home();
    };
    $('#go').onclick = go_; $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') go_(); });
  },

  home() {
    app.innerHTML = `<div class="view"><div style="padding:6px 0 10px">${logo(230)}</div><div class="scroll">
      ${btn('scan', '▦', 'اسکن بارکد', 'شروع عملیات اسکن', true)}
      ${btn('saved', '🗂', 'فایل‌های ذخیره شده', 'مشاهده و مدیریت عملیات‌ها')}
      ${btn('fest', '🗄', 'دیتابیس جشنواره', 'مدیریت بارکدهای جشنواره')}
      ${btn('gen', '▮▯▮', 'ساخت تصویر بارکد', 'تولید و خروجی PNG یا JPG')}
      ${btn('set', '⚙', 'تنظیمات', 'تنظیمات برنامه')}
    </div><div class="foot" style="padding-bottom:0">AMIRAN TICKET • v1.0.0</div>${foot}</div>`;
    app.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      ({ scan: () => go('newop'), saved: () => go('saved'), fest: () => go('fest'), gen: () => go('gen'), set: () => go('settings') })[b.dataset.act]?.();
    };
  },

  newop() {
    app.innerHTML = `<div class="view">${tb('ایجاد عملیات جدید')}<div class="card"><label class="lb">نام عملیات</label>
      <input id="nm" class="f" placeholder="مثلاً جشنواره تابستان"></div><div style="flex:1"></div>
      ${btn('start', '▦', 'شروع اسکن', '', true)}${foot}</div>`;
    $('[data-act=start]').onclick = () => go('scan', { name: $('#nm').value.trim() || 'عملیات جدید', items: [] });
  },

  // ───── اسکن ─────
  scan(p) {
    const st = { name: p.name, id: p.id ?? null, items: new Map((p.items || []).map(e => [e.b, e.q])), last: null, lastAt: 0, paused: false, fs: DB.festSet(), set: Settings.get() };
    app.innerHTML = `<div class="view">${tb('اسکن بارکد')}
      <div class="cam"><video id="vid" playsinline muted autoplay></video>
        <div class="frame"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>
        <div class="hint"><span>بارکد را در قاب قرار دهید</span></div>
        <div class="err" id="camerr"><div id="camerrt"></div><button id="retry">تلاش دوباره</button></div></div>
      <div class="row" style="justify-content:space-around;margin:10px 0">
        <button class="rbtn" id="torch" style="display:none" aria-label="چراغ قوه">🔦</button>
        <button class="rbtn" id="manual" aria-label="ورود دستی">⌨</button>
        <span class="pill">عادی</span>
        <button class="rbtn" id="clear" aria-label="پاک کردن لیست">🗑</button></div>
      <div class="card" style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-radius:18px">
        <span class="muted small">آخرین بارکد:</span><b id="last" class="ltr" style="flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr">—</b><span id="lastk" class="small muted"></span></div>
      <div class="row" style="margin:12px 4px 6px"><b style="font-size:15px">نتایج اسکن</b><span style="flex:1"></span><span class="pill" id="cnt" style="padding:3px 12px">0</span></div>
      <div class="scroll" id="list"></div>
      <div class="card" style="margin:6px 0 8px;padding:10px 14px;border-radius:20px;line-height:1.7" id="sum"></div>
      ${btn('save', '📄', 'ذخیره و ساخت فایل TXT', '', true)}${foot}</div>`;

    const persist = () => { if (!st.items.size && st.id == null) return; st.id = DB.saveOp(st.name, [...st.items].map(([b, q]) => ({ b, q })), st.id); };
    const upd = () => {
      const list = [...st.items].map(([b, q]) => ({ b, q })).sort((a, b) => (st.fs.has(b.b) ? 1 : 0) - (st.fs.has(a.b) ? 1 : 0));
      const total = list.reduce((s, e) => s + e.q, 0), fest = list.filter(e => st.fs.has(e.b)).length;
      $('#cnt').textContent = list.length;
      $('#sum').innerHTML = `تعداد کل بارکدها: ${list.length}<br>مجموع تعداد چاپ: ${total}<br><span class="muted small">جشنواره: ${fest} • عادی: ${list.length - fest}</span>`;
      $('#list').innerHTML = list.map(e => { const f = st.fs.has(e.b); return `<div class="item" data-b="${esc(e.b)}">
        <button class="xbtn" data-a="rm" aria-label="حذف">✕</button>
        <div class="mid"><div class="code">${esc(e.b)}</div><div class="sub${f ? ' fest' : ''}">${f ? 'جشنواره' : 'عادی'} • تعداد: ${e.q}</div></div>
        <div class="qty"><button data-a="dec">−</button><b>${e.q}</b><button data-a="inc">+</button></div></div>`; }).join('');
      const last = st.last; $('#last').textContent = last || 'هنوز بارکدی اسکن نشده'; $('#last').style.direction = last ? 'ltr' : 'rtl';
      $('#lastk').textContent = last ? (st.fs.has(last) ? 'جشنواره' : 'عادی') : ''; $('#lastk').style.color = last && st.fs.has(last) ? 'var(--lime)' : '';
    };
    const touch = fn => { fn(); persist(); upd(); };
    $('#list').addEventListener('click', e => {
      const bt = e.target.closest('button[data-a]'); if (!bt) return;
      const b = bt.closest('.item').dataset.b, q = st.items.get(b);
      touch(() => { if (bt.dataset.a === 'rm') st.items.delete(b); else if (bt.dataset.a === 'inc') st.items.set(b, q + 1); else st.items.set(b, Math.max(1, q - 1)); });
    });

    // بوق/لرزش
    let actx; const feedback = () => {
      if (!st.set.vib) return;
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { }
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 1000; g.gain.value = .08; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + .09); } catch (e) { }
    };

    async function handle(code, manual) {
      const c = (code || '').trim(); if (!c) return;
      const now = Date.now();
      if (!manual && (st.paused || now - st.lastAt < 5000)) return; // کول‌دان ۵ ثانیه‌ای بی‌صدا
      st.lastAt = now; st.last = c; feedback();
      const ex = st.items.get(c);
      if (ex != null) {
        if (!st.set.dup) { touch(() => st.items.set(c, ex + 1)); return; }
        st.paused = true; upd();
        const add = await confirmDlg('بارکد تکراری', `بارکد ${c} قبلاً در این عملیات اسکن شده است. تعداد آن افزایش پیدا کند؟`, 'افزایش تعداد');
        if (add) touch(() => st.items.set(c, ex + 1));
        st.lastAt = Date.now(); st.paused = false;
      } else touch(() => st.items.set(c, 1));
    }
    upd();

    // دوربین
    let timer = null, track = null, wl = null, torchOn = false, dead = false;
    const formats = () => {
      const F = ZXing.BarcodeFormat, a = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.DATA_MATRIX, F.PDF_417, F.AZTEC];
      if (st.set.qr) a.push(F.QR_CODE); return a;
    };
    async function startCam() {
      $('#camerr').style.display = 'none';
      try {
        stopCam();
        const hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats()); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const mfr = new ZXing.MultiFormatReader(); mfr.setHints(hints);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        const vid = $('#vid'); vid.srcObject = stream; vid.setAttribute('playsinline', ''); vid.muted = true;
        try { await vid.play(); } catch (e) { }
        track = stream.getVideoTracks()[0];
        try { const caps = track.getCapabilities && track.getCapabilities(); if (caps && caps.torch) $('#torch').style.display = ''; } catch (e) { }
        const cv = document.createElement('canvas'); const ctx = cv.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (dead || !vid.srcObject) return;
          timer = setTimeout(tick, 130);
          if (vid.readyState < 2 || !vid.videoWidth || st.paused) return;
          try {
            const w = Math.min(vid.videoWidth, 1100), h = Math.round(vid.videoHeight * w / vid.videoWidth);
            cv.width = w; cv.height = h; ctx.drawImage(vid, 0, 0, w, h);
            const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv)));
            const res = mfr.decodeWithState(bmp);
            if (res.getBarcodeFormat() === ZXing.BarcodeFormat.QR_CODE && !st.set.qr) return;
            handle(res.getText(), false);
          } catch (e) { /* NotFound: هیچ بارکدی در این فریم نبود */ }
        };
        tick();
      } catch (e) {
        const denied = e && /Permission|NotAllowed|denied/i.test(e.name + e.message);
        $('#camerrt').innerHTML = denied ? 'دسترسی به دوربین داده نشده است.<br>در آیفون: تنظیمات ← Safari ← دوربین ← «اجازه دادن»<br>(یا با ورود دستی ادامه دهید)' : 'دوربین باز نشد.<br>مطمئن شوید برنامه از آدرس https باز شده و دوربین توسط برنامه‌ی دیگری استفاده نمی‌شود.';
        $('#camerr').style.display = 'flex';
      }
    }
    function stopCam() { clearTimeout(timer); try { const s = $('#vid') && $('#vid').srcObject; s && s.getTracks().forEach(t => t.stop()); } catch (e) { } }
    async function wake() { try { if ('wakeLock' in navigator && !dead) wl = await navigator.wakeLock.request('screen'); } catch (e) { } }
    const vis = () => { if (document.visibilityState === 'visible' && !dead) { wake(); } };
    document.addEventListener('visibilitychange', vis);
    cleanup = () => { dead = true; document.removeEventListener('visibilitychange', vis); stopCam(); try { wl && wl.release(); } catch (e) { } try { actx && actx.close(); } catch (e) { } };
    $('#retry').onclick = startCam;
    $('#torch').onclick = async () => { try { torchOn = !torchOn; await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { toast('چراغ قوه پشتیبانی نمی‌شود'); } };
    $('#manual').onclick = async () => {
      st.paused = true;
      const code = await modal({
        title: 'ورود دستی بارکد', body: '<input id="mc" class="f ltr" inputmode="numeric" autocomplete="off" placeholder="بارکد را وارد کنید">',
        actions: [{ label: 'لغو', value: null }, { label: 'افزودن', primary: true, run: (ov, close) => { close($('#mc', ov).value); return false; } }],
        onMount: ov => setTimeout(() => $('#mc', ov).focus(), 80),
      });
      st.paused = false; if (code && code.trim()) await handle(code, true);
    };
    $('#clear').onclick = async () => { if (!st.items.size) return; if (await confirmDlg('پاک کردن لیست', 'تمام بارکدهای این عملیات پاک شوند؟', 'پاک کردن')) touch(() => st.items.clear()); };
    $('[data-act=save]').onclick = () => saveAndExport(st, persist);
    wake(); startCam();
  },

  // ───── فایل‌های ذخیره شده ─────
  saved() {
    const ops = DB.ops(); const fs = DB.festSet();
    const d = t => { const x = new Date(t); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}/${p(x.getMonth() + 1)}/${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
    app.innerHTML = `<div class="view">${tb('فایل‌های ذخیره شده')}<div class="scroll">${ops.length ? ops.map(o => `<div class="item" data-id="${o.id}" style="padding:12px">
      <button class="xbtn" data-a="menu" aria-label="منو" style="font-size:24px">⋮</button>
      <div class="mid" data-a="open" style="cursor:pointer"><div style="font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.name)}</div>
      <div class="sub">${d(o.updatedAt || o.createdAt)}<br>${o.items.length} بارکد</div></div></div>`).join('') : '<div class="empty">هنوز عملیاتی ذخیره نشده است</div>'}</div>
      ${btn('new', '＋', 'عملیات جدید', '', true)}${foot}</div>`;
    $('[data-act=new]').onclick = () => go('newop');
    $('.scroll').addEventListener('click', async e => {
      const it = e.target.closest('.item'); if (!it) return; const a = e.target.closest('[data-a]'); if (!a) return;
      const o = ops.find(x => String(x.id) === it.dataset.id);
      if (a.dataset.a === 'open') return go('scan', { name: o.name, id: o.id, items: o.items });
      const choice = await modal({
        sheet: true, title: o.name, body: `<div style="margin-top:8px">${[['open', '▶', 'باز کردن و ادامه'], ['export', '↗', 'اشتراک‌گذاری فایل'], ['save', '⬇', 'ذخیره در فایل'], ['delete', '🗑', 'حذف']].map(([k, i, t]) => `<button class="gb" data-ch="${k}" style="height:50px;margin-bottom:8px;border-radius:16px"><span class="ic" style="width:30px;height:30px">${i}</span><span class="tx"><span class="t">${t}</span></span></button>`).join('')}</div>`,
        onMount: (ov, close) => ov.addEventListener('click', ev => { const b = ev.target.closest('button[data-ch]'); if (b) close(b.dataset.ch); }),
      });
      if (choice === 'open') go('scan', { name: o.name, id: o.id, items: o.items });
      else if (choice === 'delete') { if (await confirmDlg('حذف عملیات', `«${o.name}» حذف شود؟`, 'حذف')) { DB.deleteOp(o.id); render(); } }
      else if (choice === 'export' || choice === 'save') exportOp(o, choice === 'save');
    });
  },

  // ───── دیتابیس جشنواره ─────
  fest() {
    let q = '';
    const draw = () => {
      const items = DB.fest(), f = items.filter(e => e.b.includes(q));
      $('#stats').innerHTML = `<div class="card stat"><b>${items.reduce((s, e) => s + e.q, 0)}</b><span>مجموع تعداد چاپ</span></div><div class="card stat"><b>${items.length}</b><span>تعداد کالاها</span></div>`;
      $('#flist').innerHTML = f.length ? f.map(e => `<div class="item" data-b="${esc(e.b)}"><button class="xbtn" data-a="del" aria-label="حذف">🗑</button><div class="mid"><div class="code">${esc(e.b)}</div></div><b>${e.q}</b></div>`).join('') : '<div class="empty">بارکدی در دیتابیس نیست</div>';
    };
    app.innerHTML = `<div class="view">${tb('دیتابیس جشنواره')}<div class="row" id="stats" style="margin-bottom:10px"></div>
      <input id="q" class="f ltr" placeholder="جستجوی بارکد" style="margin-bottom:10px">
      <div class="row" style="margin-bottom:10px"><button class="gb" id="imp" style="height:52px;margin:0"><span class="ic">⬆</span><span class="tx"><span class="t">وارد کردن</span></span></button>
      <button class="gb" id="exp" style="height:52px;margin:0"><span class="ic">⬇</span><span class="tx"><span class="t">خروجی</span></span></button>
      <button class="rbtn" id="clr" aria-label="پاک کردن دیتابیس">🗑</button></div>
      <div class="scroll" id="flist"></div>${foot}</div><input type="file" id="file" accept=".txt,.csv,text/plain,text/csv" style="display:none">`;
    draw();
    $('#q').oninput = e => { q = e.target.value.trim(); draw(); };
    $('#flist').addEventListener('click', e => { const b = e.target.closest('[data-a=del]'); if (b) { DB.deleteFest(b.closest('.item').dataset.b); draw(); } });
    // انتخاب فایل باید داخل همان لمس کاربر باز شود؛ برای همین بعد از تأیید رمز، هم‌زمان فراخوانی می‌شود
    $('#imp').onclick = () => adminDlg('ورود دیتابیس جشنواره نیازمند رمز مدیریتی است.', () => $('#file').click());
    $('#file').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const x = Files.parse(await f.text()); if (!x.length) throw 0;
        DB.importFest(x); draw(); toast(`${x.length} بارکد وارد شد`);
      } catch (err) { toast('فایل دیتابیس معتبر نیست'); }
    };
    $('#exp').onclick = () => { const it = DB.fest(); if (!it.length) return toast('دیتابیس خالی است'); Files.share([{ name: 'AMIRAN_Festival_Database.txt', text: Files.txt(it) }]); };
    $('#clr').onclick = async () => { if (!DB.fest().length) return; if (await confirmDlg('پاک کردن دیتابیس', 'تمام بارکدهای جشنواره حذف شوند؟', 'حذف همه')) { DB.clearFest(); draw(); } };
  },

  // ───── تنظیمات ─────
  settings() {
    const s = Settings.get(); const li = License.status();
    const sw = (k, t, sub) => `<div class="sw"><div><div class="t">${t}</div><div class="s">${sub}</div></div><button class="tg${s[k] ? ' on' : ''}" data-k="${k}" role="switch" aria-checked="${!!s[k]}"></button></div>`;
    app.innerHTML = `<div class="view">${tb('تنظیمات')}<div class="scroll">
      <div class="card" style="padding:0">${sw('dup', 'هشدار بارکد تکراری', 'در صورت اسکن دوباره همان بارکد تأیید بگیر')}${sw('vib', 'بوق و لرزش هنگام اسکن', 'بازخورد هنگام ثبت بارکد (آیفون فقط بوق دارد)')}${sw('qr', 'اسکن QR Code', 'در حالت خاموش، QR Code در لیست ثبت نمی‌شود')}</div>
      <div class="card" style="margin-top:12px"><div style="font-weight:900;margin-bottom:6px">لایسنس</div>
        <div>${li ? esc(li.title) : 'فعال نشده'}</div><div class="muted small" style="margin-top:4px">${li ? (li.days == null ? 'بدون محدودیت زمانی' : `${li.days} روز باقی‌مانده`) : ''}</div></div>
      ${window.BC_ENDPOINT ? '' : `<div class="card" style="margin-top:12px"><label class="lb">آدرس سرویس BC</label><input id="bcu" class="f ltr" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.bc)}"><div class="muted small" style="margin-top:6px">آدرس Web App در Google Apps Script (برای «ارسال به BC»)</div></div>`}
      <div class="card" style="margin-top:12px;text-align:center"><div style="font-size:17px;font-weight:900;letter-spacing:2px">AMIRAN TICKET</div><div class="muted" style="margin:6px 0">نسخه 1.0.0 (وب‌اپ)</div><div style="font-style:italic;color:rgba(255,255,255,.7);letter-spacing:1px">SilverX&nbsp;&nbsp;•&nbsp;&nbsp;SRX TEAM</div></div>
      <div style="height:12px"></div></div>${foot}</div>`;
    $('.scroll').addEventListener('click', e => { const t = e.target.closest('.tg'); if (!t) return; const on = !t.classList.contains('on'); t.classList.toggle('on', on); t.setAttribute('aria-checked', on); Settings.set({ [t.dataset.k]: on }); });
    const bcu = $('#bcu'); if (bcu) bcu.onchange = () => { Settings.set({ bc: bcu.value.trim() }); toast('ذخیره شد'); };
  },

  // ───── ساخت تصویر بارکد ─────
  gen() {
    app.innerHTML = `<div class="view gen">${tb('ساخت تصویر بارکد')}<div class="scroll">
      <div class="card"><label class="lb">شماره بارکد</label><input id="val" class="f ltr" inputmode="text" autocomplete="off" placeholder="مثلاً 6260261572162">
      <label class="lb" style="margin-top:12px">نوع بارکد</label><select id="fmt" class="f"><option>Code 128</option><option>EAN-13</option></select>
      <div class="errt" id="err" style="color:#ff6b6b;min-height:20px;margin-top:8px;font-size:13px"></div></div>
      <div style="text-align:center;margin:14px 0"><canvas id="cv" style="display:none"></canvas></div>
      <div class="row">${btn('png', '⬇', 'PNG', '', true)}${btn('jpg', '⬇', 'JPG', '')}</div></div>${foot}</div>`;
    const check = () => {
      const v = $('#val').value.trim(), f = $('#fmt').value;
      if (!v) return 'شماره بارکد را وارد کنید';
      if (f === 'Code 128') { if (v.length > 80) return 'طول متن بارکد نباید بیشتر از ۸۰ کاراکتر باشد'; if (!/^[ -~]+$/.test(v)) return 'Code 128 فقط حروف انگلیسی، اعداد و نمادهای قابل چاپ را پشتیبانی می‌کند'; }
      else {
        if (!/^\d{12,13}$/.test(v)) return 'برای EAN-13 عدد ۱۲ یا ۱۳ رقمی وارد کنید';
        if (v.length === 13) { let s = 0; for (let i = 0; i < 12; i++) s += +v[i] * (i % 2 ? 3 : 1); if ((10 - s % 10) % 10 !== +v[12]) return 'رقم کنترلی بارکد EAN-13 معتبر نیست'; }
      }
      return null;
    };
    const draw = () => {
      const e = check(); $('#err').textContent = $('#val').value.trim() ? (e || '') : ''; const cv = $('#cv');
      if (e) { cv.style.display = 'none'; return false; }
      try { JsBarcode(cv, $('#val').value.trim(), { format: $('#fmt').value === 'EAN-13' ? 'EAN13' : 'CODE128', width: 3, height: 120, margin: 20, background: '#ffffff', displayValue: true }); cv.style.display = 'inline-block'; return true; } catch (x) { $('#err').textContent = 'ساخت بارکد ممکن نشد'; cv.style.display = 'none'; return false; }
    };
    $('#val').oninput = draw; $('#fmt').onchange = draw;
    const out = async jpg => {
      if (!draw()) { toast($('#err').textContent || 'شماره بارکد را وارد کنید'); return; }
      const cv = $('#cv'); const mime = jpg ? 'image/jpeg' : 'image/png';
      const blob = await new Promise(r => cv.toBlob(r, mime, .95)); const name = Files.safe($('#val').value.trim(), 'barcode') + (jpg ? '.jpg' : '.png');
      const file = new File([blob], name, { type: mime });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    };
    $('[data-act=png]').onclick = () => out(false); $('[data-act=jpg]').onclick = () => out(true);
  },
};

// ───────────────────────── ذخیره و خروجی ─────────────────────────
async function saveAndExport(st, persist) {
  if (!st.items.size) { toast('حداقل یک بارکد اسکن کنید'); return; }
  const list = [...st.items].map(([b, q]) => ({ b, q })); const fs = DB.festSet(); const parts = Files.split(list, fs);
  st.paused = true;
  const names = await namesDlg(st.name, fs.size === 0, parts);
  st.paused = false;
  if (!names) return;
  persist();
  const files = Files.build(st.name, list, fs, names.festival, names.regular);
  const fc = parts.festival.length;
  let sending = false;
  await modal({
    sheet: true, title: 'عملیات ذخیره شد',
    body: `<p class="muted" style="margin-bottom:14px">در لیست جشنواره: ${fc} • خارج از لیست: ${list.length - fc}</p>
      <button class="gb bright" data-s="bc"><span class="ic">✉</span><span class="tx"><span class="t" id="bct">ارسال به BC</span></span></button><div class="bcst" id="bcs"></div>
      <button class="gb" data-s="share"><span class="ic">↗</span><span class="tx"><span class="t">${files.length > 1 ? `اشتراک‌گذاری ${files.length} فایل` : 'اشتراک‌گذاری TXT'}</span></span></button>
      <button class="gb" data-s="save"><span class="ic">⬇</span><span class="tx"><span class="t">ذخیره در فایل</span></span></button>
      <button class="gb" data-s="end"><span class="ic">✔</span><span class="tx"><span class="t">پایان</span></span></button>`,
    onMount: (ov, close) => ov.addEventListener('click', async e => {
      const b = e.target.closest('[data-s]'); if (!b) return; const k = b.dataset.s;
      if (k === 'end') { close(); home(); }
      else if (k === 'share') Files.share(files);
      else if (k === 'save') { await Files.download(files); toast(`${files.length} فایل ذخیره شد`); }
      else if (k === 'bc') {
        if (sending) return; sending = true; const s = $('#bcs', ov), t = $('#bct', ov);
        t.textContent = 'در حال ارسال…'; s.style.color = 'rgba(255,255,255,.7)'; s.textContent = 'در حال ارسال…';
        try { await bcSend(files, st.name); s.style.color = '#7CFC8A'; s.textContent = 'ارسال به BC با موفقیت انجام شد.'; }
        catch (err) { s.style.color = '#ff6b6b'; s.textContent = 'خطا: ' + err.message; }
        t.textContent = 'ارسال به BC'; sending = false;
      }
    }),
  });
}
async function exportOp(o, save) {
  const fs = DB.festSet(); const parts = Files.split(o.items, fs);
  const names = await namesDlg(o.name, fs.size === 0, parts); if (!names) return;
  const files = Files.build(o.name, o.items, fs, names.festival, names.regular);
  if (save) { await Files.download(files); toast(`${files.length} فایل ذخیره شد`); } else await Files.share(files);
}

// ───────────────────────── شروع ─────────────────────────
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
stack.push(['splash']); render();