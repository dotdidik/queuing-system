# Backend Absensi Puskesmas

API absensi pegawai puskesmas: Express 5 + PostgreSQL, autentikasi JWT, absen masuk/pulang dengan
validasi radius GPS, rekap harian/bulanan, dan kelola pegawai.

## Menjalankan di lokal

```bash
cp .env.example .env        # isi DATABASE_URL, JWT_SECRET, koordinat puskesmas
npm install
npm run db:migrate          # membuat tabel
npm run db:seed             # akun admin (admin / admin123) + contoh pegawai
npm run dev                 # http://localhost:4000
```

## Deploy: Netlify + Supabase

Kode yang sama dipakai di lokal dan di Netlify:

```
src/app.js                 app Express + routes
src/index.js               lokal: app.listen()
netlify/functions/api.js   Netlify Function: serverless-http(app)
netlify.toml               /api/* → function
```

1. **Supabase**: buat project, lalu salin connection string *Transaction pooler* (port 6543)
   dari **Project Settings → Database**.
2. **Buat tabel di Supabase** dari laptop:
   ```bash
   DATABASE_URL="<connection string supabase>" npm run db:migrate
   DATABASE_URL="<connection string supabase>" npm run db:seed
   ```
3. **Netlify**: *Add new site → Import an existing project* → pilih repo ini. Build command
   dikosongkan; pengaturan lain dibaca dari `netlify.toml`.
4. **Environment variables** (Site configuration → Environment variables): `DATABASE_URL`,
   `JWT_SECRET` (buat baru), `APP_TIMEZONE`, `JAM_MASUK_BATAS`, `PUSKESMAS_LAT`, `PUSKESMAS_LNG`,
   `RADIUS_METER`. `PORT` tidak perlu diisi.
5. Deploy ulang, lalu cek `https://<nama-situs>.netlify.app/api/health` → `{"ok":true}`.
6. Login sebagai `admin` dan **segera ganti password `admin123`**.

## Catatan

- "Hari ini" dan batas terlambat dihitung di query dengan `now() AT TIME ZONE APP_TIMEZONE`,
  jadi tidak bergantung pada setting zona waktu server atau connection pooler.
- SSL otomatis aktif bila `DATABASE_URL` bukan `localhost`.
