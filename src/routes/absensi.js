import { Router } from "express";
import { pool } from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { LOKASI_KANTOR, jarakMeter, parseKoordinat } from "../lokasi.js";

const router = Router();
router.use(authenticate);

const JAM_MASUK_BATAS = process.env.JAM_MASUK_BATAS || "07:30";
const STATUS_KETERANGAN = ["izin", "sakit", "cuti", "dinas_luar"];
const BULAN_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;

const currentMonth = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Jakarta" }).slice(0, 7);

// Mengirim respons error dan mengembalikan null bila lokasi tidak valid / di luar radius.
function cekLokasi(req, res) {
  const posisi = parseKoordinat(req.body);
  if (!posisi) {
    res.status(400).json({ message: "Lokasi GPS tidak terbaca. Aktifkan izin lokasi di browser Anda." });
    return null;
  }

  const jarak = Math.round(jarakMeter(posisi, LOKASI_KANTOR));
  if (jarak > LOKASI_KANTOR.radius) {
    res.status(403).json({
      message: `Anda berada ${jarak} m dari puskesmas. Absen hanya bisa dilakukan dalam radius ${LOKASI_KANTOR.radius} m.`,
      jarak
    });
    return null;
  }
  return { ...posisi, jarak };
}

// ---------- Pegawai (diri sendiri) ----------

router.get("/hari-ini", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT CURRENT_DATE AS tanggal, to_jsonb(a) AS absensi
     FROM (SELECT 1) AS dummy
     LEFT JOIN absensi a ON a.user_id = $1 AND a.tanggal = CURRENT_DATE`,
    [req.user.id]
  );
  res.json({
    tanggal: rows[0].tanggal,
    batasMasuk: JAM_MASUK_BATAS,
    kantor: LOKASI_KANTOR,
    absensi: rows[0].absensi
  });
});

router.post("/masuk", async (req, res) => {
  const posisi = cekLokasi(req, res);
  if (!posisi) return;

  const { rows } = await pool.query(
    `INSERT INTO absensi (user_id, tanggal, jam_masuk, status, lat_masuk, lng_masuk, jarak_masuk, akurasi_masuk)
     VALUES ($1, CURRENT_DATE, now(),
             CASE WHEN LOCALTIME > $2::time THEN 'terlambat' ELSE 'hadir' END,
             $3, $4, $5, $6)
     ON CONFLICT (user_id, tanggal) DO NOTHING
     RETURNING *`,
    [req.user.id, JAM_MASUK_BATAS, posisi.lat, posisi.lng, posisi.jarak, posisi.akurasi]
  );
  if (!rows[0]) {
    return res.status(409).json({ message: "Anda sudah tercatat absen / berketerangan hari ini" });
  }
  res.status(201).json(rows[0]);
});

router.post("/pulang", async (req, res) => {
  const posisi = cekLokasi(req, res);
  if (!posisi) return;

  const { rows } = await pool.query(
    `UPDATE absensi
       SET jam_pulang = now(), lat_pulang = $2, lng_pulang = $3, jarak_pulang = $4, akurasi_pulang = $5
     WHERE user_id = $1 AND tanggal = CURRENT_DATE AND jam_masuk IS NOT NULL AND jam_pulang IS NULL
     RETURNING *`,
    [req.user.id, posisi.lat, posisi.lng, posisi.jarak, posisi.akurasi]
  );
  if (!rows[0]) {
    return res.status(409).json({ message: "Belum absen masuk atau sudah absen pulang hari ini" });
  }
  res.json(rows[0]);
});

router.get("/riwayat", async (req, res) => {
  const bulan = req.query.bulan || currentMonth();
  if (!BULAN_RE.test(bulan)) return res.status(400).json({ message: "Format bulan harus YYYY-MM" });

  const { rows } = await pool.query(
    `SELECT * FROM absensi
     WHERE user_id = $1 AND tanggal >= $2::date AND tanggal < $2::date + INTERVAL '1 month'
     ORDER BY tanggal DESC`,
    [req.user.id, `${bulan}-01`]
  );
  res.json(rows);
});

// ---------- Admin ----------

router.get("/harian", requireAdmin, async (req, res) => {
  const tanggal = req.query.tanggal;
  if (tanggal && !TANGGAL_RE.test(tanggal)) {
    return res.status(400).json({ message: "Format tanggal harus YYYY-MM-DD" });
  }

  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.nip, u.nama, u.jabatan, u.unit,
            a.id, a.jam_masuk, a.jam_pulang, a.status, a.keterangan,
            a.lat_masuk, a.lng_masuk, a.jarak_masuk, a.akurasi_masuk,
            a.lat_pulang, a.lng_pulang, a.jarak_pulang, a.akurasi_pulang
     FROM users u
     LEFT JOIN absensi a ON a.user_id = u.id AND a.tanggal = COALESCE($1::date, CURRENT_DATE)
     WHERE u.aktif
     ORDER BY u.unit NULLS LAST, u.nama`,
    [tanggal || null]
  );
  res.json(rows);
});

// Admin mencatat izin / sakit / cuti / dinas luar untuk pegawai pada tanggal tertentu.
router.post("/keterangan", requireAdmin, async (req, res) => {
  const { user_id, tanggal, status, keterangan } = req.body ?? {};
  if (!user_id || !TANGGAL_RE.test(tanggal || "") || !STATUS_KETERANGAN.includes(status)) {
    return res.status(400).json({ message: "Pegawai, tanggal, dan status wajib diisi dengan benar" });
  }

  const { rows } = await pool.query(
    `INSERT INTO absensi (user_id, tanggal, status, keterangan)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, tanggal)
     DO UPDATE SET status = EXCLUDED.status, keterangan = EXCLUDED.keterangan,
                   jam_masuk = NULL, jam_pulang = NULL,
                   lat_masuk = NULL, lng_masuk = NULL, jarak_masuk = NULL, akurasi_masuk = NULL,
                   lat_pulang = NULL, lng_pulang = NULL, jarak_pulang = NULL, akurasi_pulang = NULL
     RETURNING *`,
    [user_id, tanggal, status, keterangan || null]
  );
  res.json(rows[0]);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM absensi WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: "Data absensi tidak ditemukan" });
  res.status(204).end();
});

router.get("/rekap", requireAdmin, async (req, res) => {
  const bulan = req.query.bulan || currentMonth();
  if (!BULAN_RE.test(bulan)) return res.status(400).json({ message: "Format bulan harus YYYY-MM" });

  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.nip, u.nama, u.jabatan, u.unit,
            COUNT(a.id) FILTER (WHERE a.status = 'hadir')::int      AS hadir,
            COUNT(a.id) FILTER (WHERE a.status = 'terlambat')::int  AS terlambat,
            COUNT(a.id) FILTER (WHERE a.status = 'izin')::int       AS izin,
            COUNT(a.id) FILTER (WHERE a.status = 'sakit')::int      AS sakit,
            COUNT(a.id) FILTER (WHERE a.status = 'cuti')::int       AS cuti,
            COUNT(a.id) FILTER (WHERE a.status = 'dinas_luar')::int AS dinas_luar,
            COUNT(a.id) FILTER (WHERE a.jam_masuk IS NOT NULL AND a.jam_pulang IS NULL
                                  AND a.tanggal < CURRENT_DATE)::int AS tidak_absen_pulang
     FROM users u
     LEFT JOIN absensi a ON a.user_id = u.id
           AND a.tanggal >= $1::date AND a.tanggal < $1::date + INTERVAL '1 month'
     WHERE u.aktif
     GROUP BY u.id
     ORDER BY u.unit NULLS LAST, u.nama`,
    [`${bulan}-01`]
  );
  res.json({ bulan, data: rows });
});

export default router;
