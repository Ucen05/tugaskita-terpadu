// TugasKita Terpadu: server tanpa dependensi. Modul: Akun, Kelas, Tugas, Iuran, Kas, Pengingat.
// Modul saling terhubung lewat event bus (lihat bagian "Penghubung antarmodul").
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { EventEmitter } = require('events');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA, 'db.json');
fs.mkdirSync(DATA, { recursive: true });
let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) :
  { users: [], kelas: [], tugas: [], iuran: [], tagihan: [], kas: [], pengingat: [], sesi: {} };
const simpan = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
const id = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();
const hash = (s, g) => crypto.scryptSync(s, g, 32).toString('hex');
const bus = new EventEmitter();

// ---------- Penghubung antarmodul ----------
const ingat = (userId, teks, kelasId) => db.pengingat.push({ id: id(), userId, kelasId, teks, waktu: now(), dibaca: false });
const buatTagihan = (i, uid) => {
  if (db.tagihan.some(t => t.iuranId === i.id && t.userId === uid)) return;
  db.tagihan.push({ id: id(), iuranId: i.id, kelasId: i.kelasId, userId: uid, nominal: i.nominal, status: 'belum' });
  ingat(uid, `Tagihan baru: ${i.judul} (Rp ${i.nominal.toLocaleString('id-ID')}), jatuh tempo ${i.jatuhTempo}.`, i.kelasId);
};
bus.on('iuran.dibuat', i => db.kelas.find(k => k.id === i.kelasId).anggota.forEach(u => buatTagihan(i, u)));
bus.on('anggota.bergabung', ({ kelasId, userId }) => db.iuran.filter(i => i.kelasId === kelasId).forEach(i => buatTagihan(i, userId)));
bus.on('tugas.dibuat', t => db.kelas.find(k => k.id === t.kelasId).anggota.filter(u => u !== t.pembuat)
  .forEach(u => ingat(u, `Tugas baru: ${t.judul}, tenggat ${t.tenggat || 'belum ditentukan'}.`, t.kelasId)));
bus.on('tagihan.lunas', t => {
  const i = db.iuran.find(x => x.id === t.iuranId), k = db.kelas.find(x => x.id === t.kelasId), u = db.users.find(x => x.id === t.userId);
  db.kas.push({ id: id(), kelasId: k.id, tagihanId: t.id, jumlah: t.nominal, ket: `${i.judul} dari ${u.nama}`, waktu: now() });
  ingat(k.bendahara, `${u.nama} sudah membayar ${i.judul}. Kas bertambah Rp ${t.nominal.toLocaleString('id-ID')}.`, k.id);
  ingat(u.id, `Pembayaran ${i.judul} diterima. Status: Lunas.`, k.id);
});

// Titik sambung ke Midtrans Sandbox. Versi ini mensimulasikan pembayaran berhasil.
async function gerbangBayar(t) { return { ok: true, ref: 'SIM-' + id() }; }

// ---------- Rute ----------
const E = (kode, pesan) => Object.assign(new Error(pesan), { kode });
const anggotaDari = (u, kid) => { const k = db.kelas.find(x => x.id === kid); if (!k) throw E(404, 'Kelas tidak ditemukan.'); if (!k.anggota.includes(u.id)) throw E(403, 'Anda bukan anggota kelas ini.'); return k; };
const wajib = (v, p) => { if (!v || !String(v).trim()) throw E(400, p); return String(v).trim(); };
const R = [];
const rute = (m, p, f, publik) => R.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), f, publik });

rute('POST', '/api/daftar', async ({ b }) => {
  const nama = wajib(b.nama, 'Nama wajib diisi.'), email = wajib(b.email, 'Email wajib diisi.').toLowerCase();
  if (String(b.sandi || '').length < 6) throw E(400, 'Kata sandi minimal 6 karakter.');
  if (db.users.some(u => u.email === email)) throw E(409, 'Email sudah terdaftar. Silakan masuk.');
  const garam = id(), u = { id: id(), nama, email, garam, sandi: hash(b.sandi, garam) };
  db.users.push(u); return { token: sesi(u), nama };
}, true);
rute('POST', '/api/masuk', async ({ b }) => {
  const u = db.users.find(x => x.email === String(b.email || '').toLowerCase());
  if (!u || hash(String(b.sandi || ''), u.garam) !== u.sandi) throw E(401, 'Email atau kata sandi salah.');
  return { token: sesi(u), nama: u.nama };
}, true);
const sesi = u => { const t = crypto.randomBytes(24).toString('hex'); db.sesi[t] = u.id; return t; };

rute('GET', '/api/kelas', async ({ u }) => db.kelas.filter(k => k.anggota.includes(u.id))
  .map(k => ({ id: k.id, nama: k.nama, kode: k.kode, bendahara: k.bendahara === u.id, jumlah: k.anggota.length })));
rute('POST', '/api/kelas', async ({ u, b }) => {
  const k = { id: id(), nama: wajib(b.nama, 'Nama kelas wajib diisi.'), kode: id().slice(0, 6).toUpperCase(), bendahara: u.id, anggota: [u.id] };
  db.kelas.push(k); return { id: k.id, kode: k.kode };
});
rute('POST', '/api/kelas/gabung', async ({ u, b }) => {
  const k = db.kelas.find(x => x.kode === String(b.kode || '').trim().toUpperCase());
  if (!k) throw E(404, 'Kode kelas tidak ditemukan. Periksa lagi kodenya.');
  if (!k.anggota.includes(u.id)) { k.anggota.push(u.id); bus.emit('anggota.bergabung', { kelasId: k.id, userId: u.id }); }
  return { id: k.id };
});

rute('GET', '/api/kelas/:kid/tugas', async ({ u, p }) => { anggotaDari(u, p.kid);
  return db.tugas.filter(t => t.kelasId === p.kid).map(t => ({ ...t, selesai: t.selesaiOleh.includes(u.id) })); });
rute('POST', '/api/kelas/:kid/tugas', async ({ u, p, b }) => { anggotaDari(u, p.kid);
  const t = { id: id(), kelasId: p.kid, judul: wajib(b.judul, 'Judul tugas wajib diisi.'), tenggat: b.tenggat || '', pembuat: u.id, selesaiOleh: [] };
  db.tugas.push(t); bus.emit('tugas.dibuat', t); return { id: t.id }; });
rute('POST', '/api/tugas/:tid/selesai', async ({ u, p }) => {
  const t = db.tugas.find(x => x.id === p.tid); if (!t) throw E(404, 'Tugas tidak ditemukan.'); anggotaDari(u, t.kelasId);
  const i = t.selesaiOleh.indexOf(u.id); i < 0 ? t.selesaiOleh.push(u.id) : t.selesaiOleh.splice(i, 1); return { selesai: i < 0 }; });

rute('POST', '/api/kelas/:kid/iuran', async ({ u, p, b }) => { const k = anggotaDari(u, p.kid);
  if (k.bendahara !== u.id) throw E(403, 'Hanya bendahara yang bisa membuat tagihan.');
  const nominal = parseInt(b.nominal, 10); if (!(nominal > 0)) throw E(400, 'Nominal harus lebih dari 0.');
  const i = { id: id(), kelasId: k.id, judul: wajib(b.judul, 'Judul iuran wajib diisi.'), nominal, jatuhTempo: b.jatuhTempo || 'belum ditentukan' };
  db.iuran.push(i); bus.emit('iuran.dibuat', i); return { id: i.id }; });
rute('GET', '/api/kelas/:kid/tagihan', async ({ u, p }) => { const k = anggotaDari(u, p.kid);
  return db.tagihan.filter(t => t.kelasId === k.id && (k.bendahara === u.id || t.userId === u.id)).map(t => {
    const i = db.iuran.find(x => x.id === t.iuranId);
    return { id: t.id, judul: i.judul, jatuhTempo: i.jatuhTempo, nominal: t.nominal, status: t.status, milikku: t.userId === u.id, nama: db.users.find(x => x.id === t.userId).nama }; }); });
rute('POST', '/api/tagihan/:tid/bayar', async ({ u, p }) => {
  const t = db.tagihan.find(x => x.id === p.tid); if (!t || t.userId !== u.id) throw E(404, 'Tagihan tidak ditemukan.');
  if (t.status === 'lunas') throw E(409, 'Tagihan ini sudah lunas.');
  const r = await gerbangBayar(t); if (!r.ok) throw E(502, 'Pembayaran gagal. Coba lagi.');
  t.status = 'lunas'; t.ref = r.ref; t.dibayarPada = now(); bus.emit('tagihan.lunas', t); return { status: 'lunas', ref: r.ref }; });
rute('GET', '/api/kelas/:kid/kas', async ({ u, p }) => { const k = anggotaDari(u, p.kid);
  const tg = db.tagihan.filter(t => t.kelasId === k.id), kas = db.kas.filter(x => x.kelasId === k.id);
  return { masuk: kas.reduce((a, x) => a + x.jumlah, 0), tertunggak: tg.filter(t => t.status === 'belum').reduce((a, t) => a + t.nominal, 0),
    lunas: tg.filter(t => t.status === 'lunas').length, belum: tg.filter(t => t.status === 'belum').length, riwayat: kas.slice().reverse() }; });

rute('GET', '/api/pengingat', async ({ u }) => db.pengingat.filter(x => x.userId === u.id).slice(-50).reverse());
rute('POST', '/api/pengingat/baca', async ({ u }) => { db.pengingat.filter(x => x.userId === u.id).forEach(x => x.dibaca = true); return {}; });

// ---------- Server ----------
const TIPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const kirim = (res, kode, o) => { res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const r = R.map(x => x.m === req.method && { x, mt: url.pathname.match(x.re) }).find(y => y && y.mt);
    if (!r) return kirim(res, 404, { error: 'Alamat tidak ditemukan.' });
    try {
      let raw = ''; for await (const c of req) { raw += c; if (raw.length > 1e5) throw E(413, 'Data terlalu besar.'); }
      const b = raw ? JSON.parse(raw) : {};
      const uid = db.sesi[(req.headers.authorization || '').replace('Bearer ', '')];
      const u = db.users.find(x => x.id === uid);
      if (!r.x.publik && !u) throw E(401, 'Silakan masuk terlebih dahulu.');
      const out = await r.x.f({ u, b, p: r.mt.groups || {} }); simpan(); kirim(res, 200, out);
    } catch (e) { kirim(res, e.kode || 400, { error: e instanceof SyntaxError ? 'Format data salah.' : e.kode ? e.message : 'Terjadi kesalahan di server.' }); if (!e.kode && !(e instanceof SyntaxError)) console.error(e); }
    return;
  }
  const f = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Tidak ditemukan'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`TugasKita Terpadu berjalan di http://localhost:${PORT}`));
