import { Router } from "express";
import { HARI_INI, pool } from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { JAM_RE, KODE_ANTREAN, TANGGAL_RE, hariIni } from "../layanan.js";
import { ringkasanPoli } from "./antrean.js";

const router = Router();
router.use(authenticate, requireAdmin);

const STATUS_EDIT = ["menunggu", "dipanggil", "selesai", "tidak_hadir", "batal"];
const PER_HALAMAN = 50;

const KOLOM = `a.id, a.tanggal, a.nomor, ${KODE_ANTREAN("p", "a")} AS kode_antrean,
  to_char(a.jam_perkiraan, 'HH24:MI') AS jam_perkiraan, a.status, a.keluhan, a.catatan,
  a.dipanggil_at, a.selesai_at, a.created_at, p.id AS poli_id, p.nama AS poli,
  s.id AS pasien_id, s.nama AS pasien, s.no_hp, s.tanggal_lahir, s.nik, s.no_bpjs`;
const DARI = "FROM antrean a JOIN poli p ON p.id = a.poli_id JOIN pasien s ON s.id = a.pasien_id";

/** Halaman antrean admin: ringkasan per poli + daftar pasien pada satu tanggal. */
router.get("/", async (req, res) => {
  const tanggal = req.query.tanggal || hariIni();
  if (!TANGGAL_RE.test(tanggal)) return res.status(400).json({ message: "Format tanggal harus YYYY-MM-DD" });

  const { rows } = await pool.query(
    `SELECT ${KOLOM} ${DARI}
     WHERE a.tanggal = $1 AND ($2::int IS NULL OR a.poli_id = $2)
     ORDER BY p.kode,
              CASE a.status WHEN 'dipanggil' THEN 0 WHEN 'menunggu' THEN 1 ELSE 2 END,
              a.jam_perkiraan, a.nomor`,
    [tanggal, req.query.poli_id || null]
  );
  res.json({ tanggal, hariIni: hariIni(), poli: await ringkasanPoli(tanggal), antrean: rows });
});

/** Selesaikan pasien yang sedang dipanggil, lalu panggil antrean menunggu berikutnya di poli tersebut. */
router.post("/panggil-berikutnya", async (req, res) => {
  const poliId = req.body?.poli_id;
  if (!poliId) return res.status(400).json({ message: "Poli wajib dipilih" });

  const { rows } = await pool.query(
    `WITH selesai AS (
       UPDATE antrean SET status = 'selesai', selesai_at = now()
       WHERE poli_id = $1 AND tanggal = ${HARI_INI} AND status = 'dipanggil'
     ), berikut AS (
       SELECT id FROM antrean
       WHERE poli_id = $1 AND tanggal = ${HARI_INI} AND status = 'menunggu'
       ORDER BY jam_perkiraan, nomor LIMIT 1 FOR UPDATE
     )
     UPDATE antrean a SET status = 'dipanggil', dipanggil_at = now()
     FROM berikut WHERE a.id = berikut.id RETURNING a.id`,
    [poliId]
  );
  res.json({ dipanggil: rows[0]?.id ?? null });
});

/** Panggil pasien tertentu (mis. yang tadi dilewati), atau panggil ulang yang sedang dipanggil. */
router.post("/:id/panggil", async (req, res) => {
  const { rows } = await pool.query(
    `WITH target AS (
       SELECT id, poli_id FROM antrean
       WHERE id = $1 AND tanggal = ${HARI_INI} AND status IN ('menunggu', 'dipanggil', 'tidak_hadir')
     ), selesai AS (
       UPDATE antrean a SET status = 'selesai', selesai_at = now()
       FROM target
       WHERE a.poli_id = target.poli_id AND a.tanggal = ${HARI_INI} AND a.status = 'dipanggil' AND a.id <> target.id
     )
     UPDATE antrean a SET status = 'dipanggil', dipanggil_at = now()
     FROM target WHERE a.id = target.id RETURNING a.id`,
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(409).json({ message: "Hanya antrean hari ini yang belum selesai/batal yang bisa dipanggil" });
  }
  res.json({ dipanggil: rows[0].id });
});

router.put("/:id", async (req, res) => {
  const { status, jam_perkiraan: jam, catatan } = req.body ?? {};
  if (!STATUS_EDIT.includes(status)) return res.status(400).json({ message: "Status tidak valid" });
  if (!JAM_RE.test(jam || "")) return res.status(400).json({ message: "Format jam harus HH:MM" });

  // Status "dipanggil" hanya lewat tombol Panggil agar satu poli tidak punya dua pasien dipanggil.
  const { rows } = await pool.query(
    `UPDATE antrean
       SET status = $1, jam_perkiraan = $2, catatan = $3,
           selesai_at = CASE WHEN $1 = 'selesai' THEN COALESCE(selesai_at, now()) END
     WHERE id = $4 AND ($1 <> 'dipanggil' OR status = 'dipanggil')
     RETURNING id`,
    [status, jam, catatan?.trim() || null, req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ message: "Gunakan tombol Panggil untuk memanggil pasien" });
  res.json({ id: rows[0].id });
});

/** Riwayat kunjungan dengan filter rentang tanggal, poli, status, dan pencarian pasien. */
router.get("/riwayat", async (req, res) => {
  const { dari, sampai, poli_id, status, q } = req.query;
  if ((dari && !TANGGAL_RE.test(dari)) || (sampai && !TANGGAL_RE.test(sampai))) {
    return res.status(400).json({ message: "Format tanggal harus YYYY-MM-DD" });
  }
  const halaman = Math.max(1, Number(req.query.halaman) || 1);
  const params = [dari || null, sampai || null, poli_id || null, status || null, q?.trim() ? `%${q.trim()}%` : null];
  const filter = `WHERE ($1::date IS NULL OR a.tanggal >= $1) AND ($2::date IS NULL OR a.tanggal <= $2)
    AND ($3::int IS NULL OR a.poli_id = $3) AND ($4::text IS NULL OR a.status = $4)
    AND ($5::text IS NULL OR s.nama ILIKE $5 OR s.no_hp LIKE $5 OR s.nik LIKE $5)`;

  const [{ rows }, { rows: total }] = await Promise.all([
    pool.query(
      `SELECT ${KOLOM} ${DARI} ${filter}
       ORDER BY a.tanggal DESC, p.kode, a.jam_perkiraan, a.nomor LIMIT ${PER_HALAMAN} OFFSET $6`,
      [...params, (halaman - 1) * PER_HALAMAN]
    ),
    pool.query(`SELECT count(*)::int AS n ${DARI} ${filter}`, params)
  ]);
  res.json({ data: rows, total: total[0].n, halaman, perHalaman: PER_HALAMAN });
});

export default router;
