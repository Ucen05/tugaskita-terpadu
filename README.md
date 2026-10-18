# TugasKita Terpadu

Aplikasi kelas yang menggabungkan lima modul dalam satu program: Akun, Kelas, Tugas, Iuran (dengan Kas), dan Pengingat.
Server tidak butuh `npm install` karena hanya memakai modul bawaan Node.js 18 ke atas.

## Menjalankan

| Platform       | Perintah                                       |
| -------------- | ---------------------------------------------- |
| Web / PWA      | `npm run web`, lalu buka http://localhost:3000 |
| Server Docker  | `docker compose up -d --build`                 |
| Uji alur utama | `npm test`                                     |

Data tersimpan di `data/db.json` (di Docker: volume `/data`).

## Alur demo (daftar sampai bayar)

1. Bendahara mendaftar dan membuat kelas, lalu membagikan kode kelas.
2. Mahasiswa mendaftar dan bergabung memakai kode.
3. Bendahara membuat tagihan iuran. Semua anggota menerima tagihan dan pengingat.
4. Mahasiswa menekan Bayar. Status berubah menjadi Lunas, kas bertambah, bendahara menerima pengingat.
5. Buka kelas yang sama di perangkat lain: status ikut berubah dalam beberapa detik.

## Bagaimana modul saling terhubung

Semua ada di bagian "Penghubung antarmodul" pada `server.js`:

| Peristiwa           | Dipicu oleh | Akibat di modul lain                             |
| ------------------- | ----------- | ------------------------------------------------ |
| `anggota.bergabung` | Kelas       | Iuran membuatkan tagihan yang sudah berjalan     |
| `tugas.dibuat`      | Tugas       | Pengingat dikirim ke anggota lain                |
| `iuran.dibuat`      | Iuran       | Tagihan untuk semua anggota, lalu pengingat      |
| `tagihan.lunas`     | Iuran       | Kas dicatat, pengingat ke bendahara dan pembayar |
