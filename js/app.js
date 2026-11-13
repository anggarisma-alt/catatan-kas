/* Catatan Kas – frontend GitHub Pages. Backend: GAS REST (fetch POST text/plain). */
const AppState = { currentPage: null, sessionToken: null, pageHistory: [] };
const S = { ck: 'bank', df: 'all', pf: 'Belum', mk: 'kegiatan', lt: 'harian' };
const CH = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
const XL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const JP = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AT = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const BL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(+n || 0).toLocaleString('id-ID');
const rp = n => 'Rp' + fmt(n);
const num = v => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
const fm = el => { const d = el.value.replace(/\D/g, ''); el.value = d ? fmt(+d) : ''; };
const tgl = d => { if (!d) return '-'; const p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const A = h => { $('#app-container').innerHTML = h; };
const hd = (t, back, act) => `<div class="ph">${back ? '<button class="ib" aria-label="Kembali" onclick="goBack()"><i class="bi bi-arrow-left"></i></button>' : ''}<h1>${t}</h1>${act || ''}</div>`;
const empty = t => `<p class="mu text-center p-4">${t}</p>`;

/* ----- UI helpers ----- */
let busy = 0;
function ld(n) { busy = Math.max(0, busy + (n ? 1 : -1)); $('#ld').classList.toggle('on', busy > 0); }
function toast(m, t) { const e = document.createElement('div'); e.className = 't ' + (t || ''); e.textContent = m; $('#ts').appendChild(e); setTimeout(() => e.remove(), 3200); }
function modal(t, b, f) { $('#mt').textContent = t; $('#mb').innerHTML = b; $('#mf').innerHTML = f || ''; if (!$('#dlg').open) $('#dlg').showModal(); }
function closeM() { $('#dlg').close(); }
function ask(m, fn) { window._fn = fn; modal('Konfirmasi', '<p class="m-0">' + esc(m) + '</p>', '<button class="btn btn-outline-secondary" onclick="closeM()">Batal</button><button class="btn btn-danger" onclick="closeM();_fn()">Ya, lanjut</button>'); }
const libs = {};
const lib = u => libs[u] || (libs[u] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = () => { delete libs[u]; no(new Error('Gagal memuat pustaka, periksa koneksi')); }; document.head.appendChild(s); }));
function setTheme(t) { document.documentElement.dataset.bsTheme = t; try { localStorage.setItem('th', t); } catch (e) {} }
function theme() { setTheme(document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark'); }

/* ----- API: fetch + retry + timeout, SWR memori, idempoten, telemetri ----- */
const TTL = 45000; let MEM = {};
const setTk = t => { AppState.sessionToken = t; try { t ? sessionStorage.setItem('tk', t) : sessionStorage.removeItem('tk'); } catch (e) {} };
const em = e => e.cfg ? e.message : (navigator.onLine ? 'Server lambat atau gagal dihubungi. Coba lagi.' : 'Anda sedang offline');
const Perf = { log(a, total, server) { console.log('[perf] ' + a + ' total=' + Math.round(total) + 'ms server=' + (server || 0) + 'ms jaringan=' + Math.round(total - (server || 0)) + 'ms'); } };
async function net(action, data, w) {
  if (!/^https:\/\/script\.google\.com\//.test(GAS_URL)) throw Object.assign(new Error('GAS_URL belum diisi di js/config.js'), { cfg: 1 });
  const reqId = w ? crypto.randomUUID() : undefined; // sama untuk semua retry => tidak dobel
  const to = w ? 90000 : 25000, tries = 3;
  for (let i = 1; i <= tries; i++) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), to), t0 = performance.now();
    try {
      const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: AppState.sessionToken, data, reqId }), signal: ac.signal, redirect: 'follow' });
      clearTimeout(tm);
      if (res.status >= 500 || res.status === 429) throw new Error('HTTP ' + res.status);
      const j = await res.json(); Perf.log(action, performance.now() - t0, j.ms); return j;
    } catch (e) { clearTimeout(tm); if (i === tries) throw e; await new Promise(r => setTimeout(r, 600 * i)); }
  }
}
async function reval(action, data, key) { // stale-while-revalidate di latar belakang
  const c = MEM[key]; c.t = Date.now();
  try {
    const j = await net(action, data, false);
    if (j.success && JSON.stringify(j.data) !== c.s) {
      MEM[key] = { d: j.data, t: Date.now(), pg: c.pg, s: JSON.stringify(j.data) };
      if (AppState.currentPage === c.pg && c.pg !== 'tarik' && !$('#dlg').open) PAGES[c.pg]();
    }
  } catch (e) {}
}
async function api(action, data) {
  data = data || {};
  const w = action.indexOf('w_') === 0, key = action + JSON.stringify(data);
  if (!w && MEM[key]) { const c = MEM[key]; if (Date.now() - c.t > TTL) reval(action, data, key); return { ok: true, data: c.d }; }
  ld(1);
  try {
    const j = await net(action, data, w); ld(0);
    if (j.auth === false) { setTk(null); MEM = {}; toast(j.message, 'danger'); navigateTo('login', { noHistory: true }); return { ok: false }; }
    if (!j.success) { toast(j.message || 'Terjadi kesalahan', 'danger'); return { ok: false }; }
    if (w) MEM = {}; else MEM[key] = { d: j.data, t: Date.now(), pg: AppState.currentPage, s: JSON.stringify(j.data) };
    return { ok: true, data: j.data };
  } catch (e) { ld(0); toast(em(e), 'danger'); return { ok: false }; }
}

/* ----- Router ----- */
const PAGES = { login: pLogin, home: pHome, kas: pKas, tarik: pTarik, dana: pDana, more: pMore, pajak: pPajak, laporan: pLaporan, master: pMaster, set: pSet, panduan: pPanduan };
function navigateTo(p, o) {
  o = o || {};
  if (AppState.currentPage && !o.noHistory && AppState.currentPage !== p) AppState.pageHistory.push(AppState.currentPage);
  AppState.currentPage = p;
  if (p === 'login') history.replaceState(null, '', location.pathname + location.search);
  else if (!o.fromHash && location.hash !== '#/' + p) location.hash = '#/' + p;
  document.body.classList.toggle('noauth', p === 'login');
  const grp = ['pajak', 'laporan', 'master', 'set', 'panduan'].includes(p) ? 'more' : p;
  document.querySelectorAll('#nv button').forEach(b => b.classList.toggle('on', b.dataset.p === grp));
  A('<div class="sk"></div>');
  window.scrollTo(0, 0);
  PAGES[p]();
}
function goBack() { navigateTo(AppState.pageHistory.pop() || 'more', { noHistory: true }); }
function logout() { setTk(null); MEM = {}; AppState.pageHistory = []; AppState.currentPage = null; MD = null; navigateTo('login', { noHistory: true }); }

/* ----- Login ----- */
function pLogin() {
  A(`<div class="lg"><div class="cd p-4"><div class="logo"><i class="bi bi-wallet2"></i></div>
  <h1 class="h4 text-center mb-1">Catatan Kas</h1><p class="mu text-center mb-4">Kas bank &amp; kas tunai bendahara desa</p>
  <form onsubmit="doLogin(event)" novalidate>
  <label class="lb" for="lu">Username</label><input id="lu" class="form-control mb-3" autocomplete="username" autocapitalize="none">
  <label class="lb" for="lp">Password</label><input id="lp" type="password" class="form-control mb-3" autocomplete="current-password">
  <button class="btn btn-pri w-100">Masuk</button></form></div></div>`);
}
async function doLogin(e) {
  e.preventDefault();
  const u = $('#lu').value.trim(), p = $('#lp').value;
  if (!u || !p) return toast('Isi username dan password', 'danger');
  ld(1);
  try {
    const j = await net('login', { u, p }, false); ld(0);
    if (!j.success) return toast(j.message, 'danger');
    setTk(j.data.token); MEM = {};
    MEM['dash{}'] = { d: j.data.dash, t: Date.now(), pg: 'home', s: JSON.stringify(j.data.dash) }; // bootstrap
    navigateTo('home', { noHistory: true });
  } catch (x) { ld(0); toast(em(x), 'danger'); }
}

/* ----- Beranda ----- */
const st = (l, v, i, c) => `<div class="cd sc ${c}"><i class="bi ${i}"></i><small>${l}</small><b>${rp(v)}</b></div>`;
async function pHome() {
  const r = await api('dash'); if (!r.ok) return;
  const d = r.data, ic = { ok: 'bi-check-circle', warn: 'bi-exclamation-triangle', info: 'bi-info-circle' };
  A(hd(esc(d.desa), 0, '<button class="ib" aria-label="Ganti tema" onclick="theme()"><i class="bi bi-circle-half"></i></button>') +
    `<div class="gr">${st('Saldo Kas Bank', d.bank, 'bi-bank', 'pri')}${st('Saldo Kas Tunai', d.tunai, 'bi-cash-stack', 'pri')}${st('Pajak Belum Disetor', d.pajak, 'bi-receipt', 'wn')}${st('Belum Cair Siskeudes', d.belum, 'bi-hourglass-split', 'er')}</div>
    <div class="cd p-3 mt-3"><h2 class="h6">Arus Kas Bulanan (Bank)</h2><div style="height:220px"><canvas id="ch" role="img" aria-label="Grafik arus kas bulanan"></canvas></div></div>
    <div class="cd p-3 mt-3"><h2 class="h6">Insight</h2>${d.ins.map(i => `<div class="in ${i.t}"><i class="bi ${ic[i.t]}"></i><span>${esc(i.s)}</span></div>`).join('')}</div>`);
  if (!d.ch.length) return;
  try {
    await lib(CH);
    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--mu').trim();
    new Chart($('#ch'), { type: 'bar', data: { labels: d.ch.map(x => x.b), datasets: [{ label: 'Masuk', data: d.ch.map(x => x.masuk), backgroundColor: '#14b8a6' }, { label: 'Keluar', data: d.ch.map(x => x.keluar), backgroundColor: '#f59e0b' }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + rp(c.raw) } } }, scales: { y: { ticks: { callback: v => (v / 1e6) + ' jt' } } } } });
  } catch (e) { toast(e.message, 'danger'); }
}

/* ----- Kas Bank & Tunai ----- */
async function pKas() {
  const t = S.ck;
  A(hd('Kas', 0, '<button class="btn btn-pri btn-sm" onclick="fKas()"><i class="bi bi-plus-lg"></i> Catat</button>') +
    `<div class="sg"><button class="${t == 'bank' ? 'on' : ''}" onclick="S.ck='bank';pKas()">Kas Bank</button><button class="${t == 'tunai' ? 'on' : ''}" onclick="S.ck='tunai';pKas()">Kas Tunai</button></div><div id="ls"><div class="sk"></div></div>`);
  const r = await api('kas', { t }); if (!r.ok) return;
  $('#ls').innerHTML = r.data.length ? r.data.map(x => {
    const m = t == 'bank' ? (x.jenis == 'Masuk' ? x.nominal : -x.nominal) : (x.masuk - x.keluar);
    const del = t == 'bank' ? !x.id_penarikan : !/^[TKP]-/.test(x.id);
    return `<div class="cd it"><div class="fl"><div><b>${esc(x.uraian)}</b><small class="mu d-block">${tgl(x.tanggal)}${x.kategori ? ' · ' + esc(x.kategori) : ''}</small></div>
    <div class="text-end"><b class="${m >= 0 ? 'ok' : 'er'}">${m >= 0 ? '+' : '−'}${rp(Math.abs(m))}</b><small class="mu d-block">Saldo ${rp(x.saldo)}</small></div></div>
    ${del ? `<div class="text-end"><button class="btn btn-sm mu" aria-label="Hapus transaksi" onclick="delKas('${x.id}')"><i class="bi bi-trash"></i> Hapus</button></div>` : ''}</div>`;
  }).join('') : empty('Belum ada transaksi');
}
function fKas() {
  const b = S.ck == 'bank';
  modal('Catat Kas ' + (b ? 'Bank' : 'Tunai'),
    `<label class="lb" for="k1">Tanggal</label><input id="k1" type="date" class="form-control mb-3" value="${today()}">
    <label class="lb" for="k2">Uraian</label><input id="k2" class="form-control mb-3" maxlength="120">
    <label class="lb" for="k3">Jenis</label><select id="k3" class="form-select mb-3"><option>Masuk</option><option>Keluar</option></select>
    <label class="lb" for="k4">Nominal (Rp)</label><input id="k4" class="form-control ${b ? 'mb-3' : ''}" inputmode="numeric" oninput="fm(this)">
    ${b ? '<label class="lb" for="k5">Kategori</label><select id="k5" class="form-select"><option>Transfer bantuan</option><option>Bunga</option><option>Pajak bunga</option><option>Biaya admin</option><option>Lainnya</option></select>' : ''}`,
    '<button class="btn btn-pri" onclick="svKas()">Simpan</button>');
}
async function svKas() {
  const d = { t: S.ck, tanggal: $('#k1').value, uraian: $('#k2').value.trim(), jenis: $('#k3').value, nominal: num($('#k4').value), kategori: $('#k5') ? $('#k5').value : '' };
  if (!d.tanggal || !d.uraian || d.nominal <= 0) return toast('Tanggal, uraian, dan nominal wajib diisi', 'danger');
  const r = await api('w_kas', d); if (r.ok) { closeM(); toast('Tersimpan'); pKas(); }
}
function delKas(id) { ask('Hapus transaksi ini?', async () => { const r = await api('w_delkas', { t: S.ck, id }); if (r.ok) { toast('Dihapus'); pKas(); } }); }

/* ----- Penarikan Tunai ----- */
let MD = null;
async function md() { if (!MD) { const r = await api('mst'); if (r.ok) MD = r.data; } return MD; }
async function pTarik() {
  const m = await md(); if (!m) return;
  const dl = (id, a) => `<datalist id="${id}">${a.map(x => `<option value="${esc(x.nama)}">`).join('')}</datalist>`;
  A(hd('Penarikan Tunai') + `<div class="cd p-3"><div class="row g-3">
    <div class="col-6"><label class="lb" for="t1">Tanggal</label><input id="t1" type="date" class="form-control" value="${today()}"></div>
    <div class="col-6"><label class="lb" for="t2">Nominal tarik (Rp)</label><input id="t2" class="form-control" inputmode="numeric" oninput="fm(this);hit()"></div>
    <div class="col-12"><label class="lb" for="t3">Keterangan</label><input id="t3" class="form-control" maxlength="150"></div></div></div>
    <div class="cd p-3 mt-3"><div class="fl"><h2 class="h6 m-0">Potongan Pajak</h2><button class="btn btn-sm btn-outline-pri" onclick="addPj()"><i class="bi bi-plus-lg"></i> Pajak</button></div><div id="pj"></div></div>
    <div class="cd p-3 mt-3"><div class="fl"><h2 class="h6 m-0">Kegiatan</h2><button class="btn btn-sm btn-outline-pri" onclick="addKg()"><i class="bi bi-plus-lg"></i> Kegiatan</button></div><div id="kg"></div></div>
    <div class="cd p-3 mt-3"><div class="fl"><span>Total pajak</span><b id="s1">Rp0</b></div><div class="fl"><span>Uang tunai diterima</span><b id="s2">Rp0</b></div><div class="fl"><span>Belum dialokasikan</span><b id="s3">Rp0</b></div></div>
    <button class="btn btn-pri w-100 mt-3" onclick="svTarik()">Simpan Penarikan</button>${dl('dk', m.kegiatan)}${dl('dp', m.penerima)}`);
  addKg();
}
function addPj() {
  if (!MD.tarif.length) return toast('Isi master tarif pajak dulu', 'danger');
  const o = document.createElement('div'); o.className = 'rw pj';
  o.innerHTML = `<select class="form-select" aria-label="Jenis pajak" onchange="this.nextElementSibling.dataset.man='';hit()">${MD.tarif.map(x => `<option value="${x.id}" data-p="${x.persen}">${esc(x.nama)} (${x.persen}%)</option>`).join('')}</select>
  <input class="form-control" inputmode="numeric" aria-label="Nominal pajak" oninput="fm(this);this.dataset.man=1;hit()"><input class="form-control" placeholder="Kode billing" aria-label="Kode billing" maxlength="30">
  <button class="ib" aria-label="Hapus baris pajak" onclick="this.parentNode.remove();hit()"><i class="bi bi-x-lg"></i></button>`;
  $('#pj').appendChild(o); hit();
}
function addKg() {
  const o = document.createElement('div'); o.className = 'rw kg';
  o.innerHTML = `<input class="form-control" list="dk" placeholder="Nama kegiatan" aria-label="Nama kegiatan" maxlength="120"><input class="form-control" inputmode="numeric" placeholder="Nominal" aria-label="Nominal kegiatan" oninput="fm(this);hit()">
  <input class="form-control" list="dp" placeholder="Penerima" aria-label="Penerima" maxlength="80"><select class="form-select" aria-label="Status serah"><option>Belum diserahkan</option><option>Diserahkan</option></select>
  <button class="ib" aria-label="Hapus baris kegiatan" onclick="this.parentNode.remove();hit()"><i class="bi bi-x-lg"></i></button>`;
  $('#kg').appendChild(o);
}
function hit() {
  const t = num($('#t2').value); let pj = 0, kg = 0;
  document.querySelectorAll('.pj').forEach(r => {
    const i = r.children[1], p = +((r.children[0].selectedOptions[0] || {}).dataset || {}).p || 0;
    if (!i.dataset.man) i.value = fmt(t * p / 100);
    pj += num(i.value);
  });
  document.querySelectorAll('.kg').forEach(r => kg += num(r.children[1].value));
  $('#s1').textContent = rp(pj); $('#s2').textContent = rp(t - pj); $('#s3').textContent = rp(t - pj - kg);
}
async function svTarik() {
  const d = { tanggal: $('#t1').value, nominal: num($('#t2').value), keterangan: $('#t3').value.trim(), pajak: [], kegiatan: [] };
  if (!d.tanggal || d.nominal <= 0) return toast('Tanggal dan nominal tarik wajib diisi', 'danger');
  document.querySelectorAll('.pj').forEach(r => d.pajak.push({ id_tarif: r.children[0].value, nominal: num(r.children[1].value), kode_billing: r.children[2].value.trim() }));
  let bad = false;
  document.querySelectorAll('.kg').forEach(r => {
    const k = { kegiatan: r.children[0].value.trim(), nominal: num(r.children[1].value), penerima: r.children[2].value.trim(), status_serah: r.children[3].value };
    if (!k.kegiatan && !k.nominal) return;
    if (!k.kegiatan || k.nominal <= 0) bad = true;
    d.kegiatan.push(k);
  });
  if (bad) return toast('Lengkapi nama dan nominal setiap kegiatan', 'danger');
  const r = await api('w_tarik', d);
  if (r.ok) { toast('Penarikan tersimpan'); navigateTo('dana'); }
}

/* ----- Penelusuran Dana + status Siskeudes ----- */
async function pDana() {
  const r = await api('dana'); if (!r.ok) return;
  const f = S.df, ch = [['all', 'Semua'], ['belum', 'Belum cair'], ['sudah', 'Sudah cair']];
  const fl = k => f == 'all' || (f == 'belum' ? k.cair_siskeudes != 'Sudah' : k.cair_siskeudes == 'Sudah');
  const cards = r.data.map(p => {
    const ks = p.kegiatan.filter(fl); if (f != 'all' && !ks.length) return '';
    const flow = [['Ditarik', p.nominal_tarik], ['Pajak', p.total_pajak], ['Di bendahara', p.di_bendahara], ['Diserahkan', p.diserahkan], ['Dicairkan', p.dicairkan]]
      .map(x => `<div><small>${x[0]}</small><b>${rp(x[1])}</b></div>`).join('<i class="bi bi-chevron-right"></i>');
    return `<div class="cd p-3 mb-3"><div class="fl"><div><b>${esc(p.keterangan || 'Penarikan tunai')}</b><small class="mu d-block">${tgl(p.tanggal)}</small></div>${p.sisa > 0 ? `<span class="bdg">Sisa ${rp(p.sisa)}</span>` : ''}</div>
    <div class="fw" role="group" aria-label="Alur dana">${flow}</div>
    ${ks.map(k => { const s = k.status_serah == 'Diserahkan', c = k.cair_siskeudes == 'Sudah'; return `<div class="kr"><div><b>${esc(k.kegiatan)}</b><small class="mu d-block">${esc(k.penerima || '-')} · ${rp(k.nominal)}</small></div>
      <div class="bt"><button class="chip ${s ? 'on' : ''}" onclick="serah('${k.id}',${!s})"><i class="bi ${s ? 'bi-check2' : 'bi-circle'}"></i> ${s ? 'Diserahkan' : 'Belum diserahkan'}</button>
      <button class="chip ${c ? 'on' : ''}" onclick="cair('${k.id}',${!c})"><i class="bi ${c ? 'bi-check2' : 'bi-circle'}"></i> ${c ? 'Cair di Siskeudes' : 'Belum cair'}</button></div></div>`; }).join('')}
    <div class="text-end mt-2"><button class="btn btn-sm mu" onclick="delTarik('${p.id}')"><i class="bi bi-trash"></i> Hapus penarikan</button></div></div>`;
  }).join('');
  A(hd('Penelusuran Dana') + `<div class="chips" role="group" aria-label="Filter Siskeudes">${ch.map(c => `<button class="chip ${f == c[0] ? 'on' : ''}" onclick="S.df='${c[0]}';pDana()">${c[1]}</button>`).join('')}</div>` + (cards || empty('Belum ada data')));
}
async function serah(id, v) { const r = await api('w_serah', { id, v }); if (r.ok) pDana(); }
async function cair(id, v) { const r = await api('w_cair', { id, v }); if (r.ok) pDana(); }
function delTarik(id) { ask('Hapus penarikan ini beserta pajak, kegiatan, dan catatan kasnya?', async () => { const r = await api('w_deltarik', { id }); if (r.ok) { toast('Dihapus'); pDana(); } }); }

/* ----- Pajak ----- */
async function pPajak() {
  const r = await api('pajak'); if (!r.ok) return;
  const f = S.pf, ls = r.data.filter(x => f == 'all' || x.status_bayar == f);
  A(hd('Titipan Pajak', 1) + `<div class="chips">${[['Belum', 'Belum disetor'], ['Sudah', 'Sudah disetor'], ['all', 'Semua']].map(c => `<button class="chip ${f == c[0] ? 'on' : ''}" onclick="S.pf='${c[0]}';pPajak()">${c[1]}</button>`).join('')}</div>` +
    (ls.length ? ls.map(x => { const s = x.status_bayar == 'Sudah'; return `<div class="cd it"><div class="fl"><div><b>${esc(x.nama)} (${x.persen}%)</b><small class="mu d-block">Billing: ${esc(x.kode_billing || '-')} · Tarik ${tgl(x.tgl_tarik)}</small>${s ? `<small class="ok d-block">Dibayar ${tgl(x.tgl_bayar)}</small>` : ''}</div><b>${rp(x.nominal)}</b></div>
      <div class="text-end mt-2">${s ? `<button class="btn btn-sm mu" onclick="batalBayar('${x.id}')">Batalkan</button>` : `<button class="btn btn-sm btn-pri" onclick="bayar('${x.id}')">Tandai dibayar</button>`}</div></div>`; }).join('') : empty('Tidak ada data')));
}
function bayar(id) { modal('Bayar Pajak', `<label class="lb" for="b1">Tanggal bayar</label><input id="b1" type="date" class="form-control" value="${today()}">`, `<button class="btn btn-pri" onclick="svBayar('${id}')">Simpan</button>`); }
async function svBayar(id) { const r = await api('w_bayar', { id, v: true, tgl: $('#b1').value }); if (r.ok) { closeM(); toast('Pajak ditandai dibayar'); pPajak(); } }
async function batalBayar(id) { const r = await api('w_bayar', { id, v: false }); if (r.ok) pPajak(); }

/* ----- Laporan ----- */
function pLaporan() {
  const h = S.lt == 'harian';
  A(hd('Laporan', 1) + `<div class="cd p-3"><div class="sg"><button class="${h ? 'on' : ''}" onclick="S.lt='harian';pLaporan()">Kas Harian</button><button class="${h ? '' : 'on'}" onclick="S.lt='bulanan';pLaporan()">Kas Bulanan</button></div>
  <label class="lb" for="l1">${h ? 'Tanggal' : 'Bulan dan tahun'}</label><input id="l1" type="${h ? 'date' : 'month'}" class="form-control mb-3" value="${h ? today() : today().slice(0, 7)}">
  <div class="d-grid gap-2"><button class="btn btn-pri" onclick="lap('v')"><i class="bi bi-eye"></i> Pratinjau</button>
  <div class="row g-2"><div class="col-6"><button class="btn btn-outline-pri w-100" onclick="lap('x')"><i class="bi bi-file-earmark-excel"></i> Excel</button></div>
  <div class="col-6"><button class="btn btn-outline-pri w-100" onclick="lap('p')"><i class="bi bi-file-earmark-pdf"></i> PDF</button></div></div></div></div>`);
}
const lbl = d => d.t == 'harian' ? tgl(d.k) : BL[+d.k.slice(5, 7) - 1] + ' ' + d.k.slice(0, 4);
async function lap(m) {
  const k = $('#l1').value; if (!k) return toast('Pilih periode', 'danger');
  const r = await api('lap', { t: S.lt, k }); if (!r.ok) return;
  const d = r.data;
  try {
    if (m == 'v') return preview(d);
    if (m == 'x') { await lib(XL); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa(d)), 'Laporan'); XLSX.writeFile(wb, 'Kas-' + d.k + '.xlsx'); }
    else await pdf(d);
  } catch (e) { toast(e.message, 'danger'); }
}
function tbl(n, s) {
  return `<h3 class="h6 mt-3">${n}</h3><div class="tw"><table class="tb"><thead><tr><th>Tgl</th><th>Uraian</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th></tr></thead><tbody>
  <tr><td></td><td><b>Saldo awal</b></td><td></td><td></td><td class="r"><b>${fmt(s.awal)}</b></td></tr>
  ${s.rows.map(x => `<tr><td>${tgl(x.tanggal)}</td><td>${esc(x.uraian)}</td><td class="r">${x.masuk ? fmt(x.masuk) : ''}</td><td class="r">${x.keluar ? fmt(x.keluar) : ''}</td><td class="r">${fmt(x.saldo)}</td></tr>`).join('')}
  <tr><td></td><td><b>Saldo akhir</b></td><td></td><td></td><td class="r"><b>${fmt(s.akhir)}</b></td></tr></tbody></table></div>`;
}
function preview(d) {
  modal('Kas ' + (d.t == 'harian' ? 'Harian' : 'Bulanan') + ' – ' + lbl(d), `<p class="mu mb-0" style="white-space:pre-line">${esc(d.kop)}</p>${tbl('Kas Bank', d.bank)}${tbl('Kas Tunai Bendahara', d.tunai)}<p class="mt-3 mb-0">Belum dicairkan di Siskeudes: <b>${rp(d.belum)}</b></p>`,
    '<button class="btn btn-outline-secondary" onclick="closeM()">Tutup</button>');
}
function aoa(d) {
  const a = []; d.kop.split('\n').forEach(l => a.push([l]));
  a.push([], ['LAPORAN KAS ' + d.t.toUpperCase()], ['Periode: ' + lbl(d)], []);
  [['KAS BANK', d.bank], ['KAS TUNAI BENDAHARA', d.tunai]].forEach(x => {
    a.push([x[0]], ['Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo'], ['', 'Saldo awal', '', '', x[1].awal]);
    x[1].rows.forEach(r => a.push([tgl(r.tanggal), r.uraian, r.masuk || '', r.keluar || '', r.saldo]));
    a.push(['', 'Saldo akhir', '', '', x[1].akhir], []);
  });
  a.push(['Belum dicairkan di Siskeudes', '', '', '', d.belum], [], ['Bendahara'], [], [], [d.bendahara]);
  return a;
}
async function pdf(d) {
  await lib(JP); await lib(AT);
  const doc = new window.jspdf.jsPDF(); let y = 14; doc.setFontSize(12);
  d.kop.split('\n').forEach(l => { doc.text(l, 105, y, { align: 'center' }); y += 6; });
  doc.setFontSize(11); doc.text('LAPORAN KAS ' + d.t.toUpperCase(), 105, y + 3, { align: 'center' }); doc.text('Periode: ' + lbl(d), 105, y + 9, { align: 'center' });
  let sy = y + 15;
  [['KAS BANK', d.bank], ['KAS TUNAI BENDAHARA', d.tunai]].forEach(x => {
    const s = x[1];
    doc.autoTable({ startY: sy, head: [[{ content: x[0], colSpan: 5 }], ['Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo']],
      body: [['', 'Saldo awal', '', '', fmt(s.awal)]].concat(s.rows.map(r => [tgl(r.tanggal), r.uraian, r.masuk ? fmt(r.masuk) : '', r.keluar ? fmt(r.keluar) : '', fmt(r.saldo)]), [['', 'Saldo akhir', '', '', fmt(s.akhir)]]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [15, 118, 110] }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    sy = doc.lastAutoTable.finalY + 8;
  });
  doc.setFontSize(10); doc.text('Belum dicairkan di Siskeudes: ' + rp(d.belum), 14, sy);
  if (sy > 240) { doc.addPage(); sy = 20; }
  doc.text('Bendahara', 160, sy + 12, { align: 'center' }); doc.text(d.bendahara, 160, sy + 36, { align: 'center' });
  doc.save('Kas-' + d.k + '.pdf');
}

/* ----- Master Data ----- */
async function pMaster() {
  MD = null; const m = await md(); if (!m) return;
  const k = S.mk, tf = k == 'tarif';
  A(hd('Master Data', 1) + `<div class="sg">${[['kegiatan', 'Kegiatan'], ['tarif', 'Tarif Pajak'], ['penerima', 'Penerima']].map(c => `<button class="${k == c[0] ? 'on' : ''}" onclick="S.mk='${c[0]}';pMaster()">${c[1]}</button>`).join('')}</div>
  <div class="cd p-3 mb-3"><label class="lb" for="m1">Nama</label><input id="m1" class="form-control mb-2" maxlength="80">
  ${tf ? '<div class="row g-2 mb-2"><div class="col-5"><label class="lb" for="m2">Persen</label><input id="m2" type="number" step="0.1" min="0" max="100" class="form-control"></div><div class="col-7"><label class="lb" for="m3">Keterangan</label><input id="m3" class="form-control" maxlength="100"></div></div>' : ''}
  <button class="btn btn-pri w-100" onclick="addM()"><i class="bi bi-plus-lg"></i> Tambah</button></div>
  ${m[k].length ? m[k].map(x => `<div class="cd it fl"><div><b>${esc(x.nama)}${tf ? ' (' + x.persen + '%)' : ''}</b>${tf && x.keterangan ? `<small class="mu d-block">${esc(x.keterangan)}</small>` : ''}</div><button class="ib" aria-label="Hapus ${esc(x.nama)}" onclick="delM('${x.id}')"><i class="bi bi-trash"></i></button></div>`).join('') : empty('Belum ada data')}`);
}
async function addM() {
  const d = { m: S.mk, nama: $('#m1').value.trim() };
  if (!d.nama) return toast('Nama wajib diisi', 'danger');
  if (S.mk == 'tarif') { d.persen = $('#m2').value; d.keterangan = $('#m3').value; if (d.persen === '') return toast('Persen wajib diisi', 'danger'); }
  const r = await api('w_madd', d); if (r.ok) { toast('Ditambahkan'); pMaster(); }
}
function delM(id) { ask('Hapus data master ini? Riwayat transaksi tidak berubah.', async () => { const r = await api('w_mdel', { m: S.mk, id }); if (r.ok) pMaster(); }); }

/* ----- Pengaturan ----- */
async function pSet() {
  const r = await api('cfg'); if (!r.ok) return; const c = r.data;
  A(hd('Pengaturan', 1) + `<div class="cd p-3 mb-3"><h2 class="h6">Saldo Awal</h2><p class="mu small">Saldo sebelum transaksi pertama yang dicatat. Mengubahnya menghitung ulang seluruh saldo berjalan.</p>
  <label class="lb" for="sa1">Saldo awal kas bank (Rp)</label><input id="sa1" class="form-control mb-2" inputmode="numeric" oninput="fm(this)" value="${fmt(c.saldo_awal_bank)}">
  <label class="lb" for="sa2">Saldo awal kas tunai (Rp)</label><input id="sa2" class="form-control mb-3" inputmode="numeric" oninput="fm(this)" value="${fmt(c.saldo_awal_tunai)}">
  <button class="btn btn-pri w-100" onclick="svSaldo()">Simpan Saldo Awal</button></div>
  <div class="cd p-3 mb-3"><h2 class="h6">Identitas Desa</h2>
  <label class="lb" for="c1">Nama desa</label><input id="c1" class="form-control mb-2" value="${esc(c.nama_desa)}" maxlength="80">
  <label class="lb" for="c2">Kop laporan (tiap baris = satu baris kop)</label><textarea id="c2" class="form-control mb-2" rows="3" maxlength="300">${esc(c.kop)}</textarea>
  <label class="lb" for="c3">Nama bendahara</label><input id="c3" class="form-control mb-2" value="${esc(c.bendahara)}" maxlength="80">
  <label class="lb" for="c4">URL logo</label><input id="c4" class="form-control mb-2" value="${esc(c.logo)}" placeholder="https://...">
  <label class="lb" for="c5">ID spreadsheet</label><input id="c5" class="form-control mb-2" value="${esc(c.ssid)}" readonly>
  <label class="lb" for="c6">ID folder Drive</label><input id="c6" class="form-control mb-3" value="${esc(c.folder_id)}">
  <button class="btn btn-pri w-100" onclick="svCfg()">Simpan</button></div>
  <div class="cd p-3"><h2 class="h6">Ganti Password</h2>
  <label class="lb" for="w1">Password lama</label><input id="w1" type="password" class="form-control mb-2" autocomplete="current-password">
  <label class="lb" for="w2">Password baru (min. 6 karakter)</label><input id="w2" type="password" class="form-control mb-3" autocomplete="new-password">
  <button class="btn btn-outline-pri w-100" onclick="svPw()">Ganti Password</button></div>`);
}
async function svCfg() { const r = await api('w_cfg', { nama_desa: $('#c1').value.trim(), kop: $('#c2').value, bendahara: $('#c3').value.trim(), logo: $('#c4').value.trim(), folder_id: $('#c6').value.trim() }); if (r.ok) toast('Pengaturan tersimpan'); }
async function svSaldo() { const r = await api('w_cfg', { saldo_awal_bank: num($('#sa1').value), saldo_awal_tunai: num($('#sa2').value) }); if (r.ok) toast('Saldo awal tersimpan'); }
async function svPw() { const r = await api('w_pw', { lama: $('#w1').value, baru: $('#w2').value }); if (r.ok) { toast('Password diganti'); $('#w1').value = $('#w2').value = ''; } }

/* ----- Lainnya & Panduan ----- */
function pMore() {
  const m = (i, t, f) => `<button class="cd mn" onclick="${f}"><i class="bi ${i}"></i><span>${t}</span><i class="bi bi-chevron-right mu"></i></button>`;
  A(hd('Lainnya') + m('bi-receipt', 'Titipan Pajak', "navigateTo('pajak')") + m('bi-file-earmark-bar-graph', 'Laporan', "navigateTo('laporan')") + m('bi-database', 'Master Data', "navigateTo('master')") +
    m('bi-gear', 'Pengaturan', "navigateTo('set')") + m('bi-phone', 'Panduan Instalasi', "navigateTo('panduan')") + m('bi-circle-half', 'Ganti Tema Terang/Gelap', 'theme()') + m('bi-box-arrow-right', 'Keluar', 'logout()'));
}
function pPanduan() {
  A(hd('Panduan Instalasi', 1) + `<div class="cd p-3"><ol class="m-0 ps-3"><li class="mb-2">Buka alamat GitHub Pages aplikasi di Chrome Android dan masuk.</li>
  <li class="mb-2">Ketuk menu titik tiga di kanan atas, lalu pilih <b>Tambahkan ke layar utama</b>.</li><li class="mb-2">Aplikasi muncul sebagai ikon di layar utama dan terbuka layar penuh.</li>
  <li class="mb-2">Akun awal: <b>bendahara</b> / <b>bendahara123</b>. Segera ganti di Pengaturan.</li><li>Sesi bertahan 12 jam selama tab masih terbuka.</li></ol></div>`);
}

/* ----- Mulai ----- */
window.addEventListener('hashchange', () => {
  const p = location.hash.replace('#/', '');
  if (AppState.sessionToken && PAGES[p] && p !== 'login' && p !== AppState.currentPage) navigateTo(p, { noHistory: true, fromHash: true });
});
window.addEventListener('offline', () => toast('Anda sedang offline', 'danger'));
window.addEventListener('online', () => toast('Kembali online'));
(function () {
  let t, k; try { t = localStorage.getItem('th'); k = sessionStorage.getItem('tk'); } catch (e) {}
  setTheme(t || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
  if (k) { AppState.sessionToken = k; const p = location.hash.replace('#/', ''); navigateTo(PAGES[p] && p !== 'login' ? p : 'home', { noHistory: true }); }
  else navigateTo('login', { noHistory: true });
})();
