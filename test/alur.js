// Uji alur utama: daftar -> gabung kelas -> tagihan -> bayar -> kas. Jalankan: npm test
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-')), port = 3100 + Math.floor(Math.random() * 500);
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: port, DATA_DIR: dir }, cwd: path.join(__dirname, '..') });
const api = async (m, u, b, t) => { const r = await fetch(`http://localhost:${port}/api${u}`, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); return { s: r.status, d: await r.json() }; };
(async () => {
  await new Promise(r => setTimeout(r, 600));
  const ben = (await api('POST', '/daftar', { nama: 'Bendahara', email: 'b@x.id', sandi: 'rahasia1' })).d.token;
  const kel = (await api('POST', '/kelas', { nama: 'IF-3A' }, ben)).d;
  const mhs = (await api('POST', '/daftar', { nama: 'Mahasiswa', email: 'm@x.id', sandi: 'rahasia1' })).d.token;
  assert.equal((await api('POST', '/daftar', { nama: 'X', email: 'm@x.id', sandi: 'rahasia1' })).s, 409);
  await api('POST', '/kelas/gabung', { kode: kel.kode }, mhs);
  await api('POST', `/kelas/${kel.id}/tugas`, { judul: 'Laporan HCI', tenggat: '2026-11-01' }, ben);
  assert.equal((await api('POST', `/kelas/${kel.id}/iuran`, { judul: 'Kas November', nominal: 20000 }, mhs)).s, 403);
  await api('POST', `/kelas/${kel.id}/iuran`, { judul: 'Kas November', nominal: 20000, jatuhTempo: '2026-11-10' }, ben);
  let tg = (await api('GET', `/kelas/${kel.id}/tagihan`, null, mhs)).d; assert.equal(tg.length, 1); assert.equal(tg[0].status, 'belum');
  let ping = (await api('GET', '/pengingat', null, mhs)).d; assert.ok(ping.some(x => /Tagihan baru/.test(x.teks)) && ping.some(x => /Tugas baru/.test(x.teks)));
  assert.equal((await api('POST', `/tagihan/${tg[0].id}/bayar`, {}, mhs)).d.status, 'lunas');
  assert.equal((await api('POST', `/tagihan/${tg[0].id}/bayar`, {}, mhs)).s, 409);
  const kas = (await api('GET', `/kelas/${kel.id}/kas`, null, ben)).d; assert.equal(kas.masuk, 20000); assert.equal(kas.tertunggak, 20000); assert.equal(kas.lunas, 1);
  const late = (await api('POST', '/daftar', { nama: 'Telat', email: 't@x.id', sandi: 'rahasia1' })).d.token;
  await api('POST', '/kelas/gabung', { kode: kel.kode }, late);
  assert.equal((await api('GET', `/kelas/${kel.id}/tagihan`, null, late)).d.length, 1);
  assert.ok((await api('GET', '/pengingat', null, ben)).d.some(x => /sudah membayar/.test(x.teks)));
  console.log('Semua uji alur utama lulus.');
})().catch(e => { console.error('GAGAL:', e.message); process.exitCode = 1; }).finally(() => srv.kill());
