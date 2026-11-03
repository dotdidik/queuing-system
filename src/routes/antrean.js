import { Router } from "express";
import { HARI_INI, pool } from "../db.js";
import { authenticatePasien } from "../middleware/auth.js";
import {
  JAM_RE,
  KODE_ANTREAN,
  LAYANAN,
  TANGGAL_RE,
  daftarSlot,
  hariIni,
  slotLewat,
  tanggalTersedia
} from "../layanan.js";

const router = Router();

// Tenaga medis yang piket di poli `p` pada tanggal tertentu (berdasarkan hari dalam minggu).
export const PIKET = (tanggal) => `COALESCE((
  SELECT json_agg(json_build_object(
           'id', t.id, 'nama', t.nama, 'jenis', t.jenis, 'ada_foto', t.foto IS NOT NULL,
           'versi', floor(extract(epoch FROM t.updated_at))::bigint) ORDER BY t.nama)
  FROM tenaga_medis t
  WHERE t.poli_id = p.id AND t.aktif AND extract(isodow FROM ${tanggal})::smallint = ANY (t.hari_piket)
), '[]'::json)`;

/** Ringkasan antrean per poli aktif pada satu tanggal: yang sedang dipanggil, berikutnya, jumlah menunggu. */
export async function ringkasanPoli(tanggal) {
  const { rows } = await pool.query(
    `SELECT p.id, p.kode, p.nama, ${PIKET("$1::date")} AS piket,
            (SELECT json_build_object('id', c.id, 'kode_antrean', ${KODE_ANTREAN("p", "c")}, 'dipanggil_at', c.dipanggil_at)
               FROM antrean c WHERE c.poli_id = p.id AND c.tanggal = $1 AND c.status = 'dipanggil'
               ORDER BY c.dipanggil_at DESC LIMIT 1) AS dipanggil,
            COALESCE((SELECT json_agg(x.kode ORDER BY x.jam_perkiraan, x.nomor)
               FROM (SELECT ${KODE_ANTREAN("p", "b")} AS kode, b.jam_perkiraan, b.nomor
                       FROM antrean b WHERE b.poli_id = p.id AND b.tanggal = $1 AND b.status = 'menunggu'
                       ORDER BY b.jam_perkiraan, b.nomor LIMIT 3) x), '[]'::json) AS berikutnya,
            (SELECT count(*) FROM antrean b
               WHERE b.poli_id = p.id AND b.tanggal = $1 AND b.status = 'menunggu')::int AS menunggu,
            (SELECT count(*) FROM antrean b
               WHERE b.poli_id = p.id AND b.tanggal = $1 AND b.status = 'selesai')::int AS selesai
     FROM poli p WHERE p.aktif ORDER BY p.kode`,
    [tanggal]
  );
  return rows;
}

// ---------- Publik ----------

/** Layar antrean di ruang tunggu. Dipanggil berkala (polling), jadi dibuat ringan. */
router.get("/layar", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ tanggal: hariIni(), poli: await ringkasanPoli(hariIni()) });
});

/** Data untuk form ambil antrean: tanggal yang bisa dipilih, jam layanan, dan poli beserta dokter piket. */
router.get("/info", async (req, res) => {
  const tersedia = tanggalTersedia();
  const tanggal = req.query.tanggal || tersedia[0].tanggal;
  if (!TANGGAL_RE.test(tanggal)) return res.status(400).json({ message: "Format tanggal harus YYYY-MM-DD" });

  const { rows } = await pool.query(
    `SELECT p.id, p.kode, p.nama, ${PIKET("$1::date")} AS piket,
            (SELECT count(*) FROM antrean a
               WHERE a.poli_id = p.id AND a.tanggal = $1 AND a.status IN ('menunggu', 'dipanggil'))::int AS jumlah_antrean
     FROM poli p WHERE p.aktif ORDER BY p.kode`,
    [tanggal]
  );
  res.json({
    tanggal,
    tanggalTersedia: tersedia,
    layanan: { mulai: LAYANAN.mulai, selesai: LAYANAN.selesai, slotMenit: LAYANAN.slotMenit },
    poli: rows.map((p) => ({ ...p, buka: p.piket.length > 0 }))
  });
});

router.get("/slot", async (req, res) => {
  const { poli_id, tanggal } = req.query;
  if (!poli_id || !TANGGAL_RE.test(tanggal || "")) {
    return res.status(400).json({ message: "Poli dan tanggal wajib diisi" });
  }
  const { rows } = await pool.query(
    `SELECT to_char(jam_perkiraan, 'HH24:MI') AS jam, count(*)::int AS terisi
     FROM antrean WHERE poli_id = $1 AND tanggal = $2 AND status <> 'batal' GROUP BY 1`,
    [poli_id, tanggal]
  );
  const terisi = Object.fromEntries(rows.map((r) => [r.jam, r.terisi]));
  res.json(
    daftarSlot().map((jam) => ({
      jam,
      terisi: terisi[jam] || 0,
      penuh: (terisi[jam] || 0) >= LAYANAN.kuotaSlot,
      lewat: slotLewat(tanggal, jam)
    }))
  );
});

// ---------- Pasien ----------

const TIKET = `
  SELECT a.id, a.tanggal, a.nomor, ${KODE_ANTREAN("p", "a")} AS kode_antrean,
         to_char(a.jam_perkiraan, 'HH24:MI') AS jam_perkiraan, a.status, a.keluhan, a.catatan,
         a.dipanggil_at, a.created_at, p.id AS poli_id, p.nama AS poli, ${PIKET("a.tanggal")} AS piket,
         (a.tanggal >= ${HARI_INI} AND a.status IN ('menunggu', 'dipanggil')) AS aktif,
         CASE WHEN a.status = 'menunggu' THEN (
           SELECT count(*) FROM antrean b
           WHERE b.poli_id = a.poli_id AND b.tanggal = a.tanggal AND b.status = 'menunggu'
             AND (b.jam_perkiraan, b.nomor) < (a.jam_perkiraan, a.nomor))::int
         END AS di_depan,
         (SELECT ${KODE_ANTREAN("p", "c")} FROM antrean c
           WHERE c.poli_id = a.poli_id AND c.tanggal = a.tanggal AND c.status = 'dipanggil'
           ORDER BY c.dipanggil_at DESC LIMIT 1) AS sedang_dipanggil
  FROM antrean a JOIN poli p ON p.id = a.poli_id`;

router.get("/saya", authenticatePasien, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { rows } = await pool.query(
    `${TIKET} WHERE a.pasien_id = $1
     ORDER BY aktif DESC, CASE WHEN a.status IN ('menunggu', 'dipanggil') THEN a.tanggal END,
              a.tanggal DESC, a.jam_perkiraan
     LIMIT 50`,
    [req.pasienId]
  );
  res.json(rows);
});

router.post("/", authenticatePasien, async (req, res) => {
  const { poli_id, tanggal, jam_perkiraan: jam, keluhan } = req.body ?? {};
  if (!tanggalTersedia().some((t) => t.tanggal === tanggal)) {
    return res.status(400).json({ message: `Tanggal hanya bisa dipilih untuk ${LAYANAN.hariDaftar} hari ke depan` });
  }
  if (!JAM_RE.test(jam || "") || !daftarSlot().includes(jam)) {
    return res.status(400).json({ message: "Pilih jam kedatangan yang tersedia" });
  }
  if (slotLewat(tanggal, jam)) return res.status(400).json({ message: "Jam yang dipilih sudah lewat. Pilih jam lain." });

  const { rows: poli } = await pool.query(
    `SELECT p.id, p.nama, json_array_length(${PIKET("$2::date")}) AS jumlah_piket,
            (SELECT count(*) FROM antrean a WHERE a.poli_id = p.id AND a.tanggal = $2
               AND a.jam_perkiraan = $3 AND a.status <> 'batal')::int AS terisi
     FROM poli p WHERE p.id = $1 AND p.aktif`,
    [poli_id, tanggal, jam]
  );
  if (!poli[0]) return res.status(400).json({ message: "Poli tidak ditemukan" });
  if (!poli[0].jumlah_piket) return res.status(400).json({ message: `${poli[0].nama} tutup pada tanggal tersebut` });
  if (poli[0].terisi >= LAYANAN.kuotaSlot) {
    return res.status(409).json({ message: "Jam tersebut sudah penuh. Silakan pilih jam lain." });
  }

  // Nomor = nomor terakhir + 1. Bila dua pasien mendaftar bersamaan, constraint UNIQUE menolak salah satunya
  // dan kita coba lagi dengan nomor berikutnya.
  for (let percobaan = 0; percobaan < 5; percobaan++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO antrean (pasien_id, poli_id, tanggal, nomor, jam_perkiraan, keluhan)
         SELECT $1, $2, $3, COALESCE(max(nomor), 0) + 1, $4, $5 FROM antrean WHERE poli_id = $2 AND tanggal = $3
         RETURNING id`,
        [req.pasienId, poli_id, tanggal, jam, keluhan?.trim() || null]
      );
      const { rows: tiket } = await pool.query(`${TIKET} WHERE a.id = $1`, [rows[0].id]);
      return res.status(201).json(tiket[0]);
    } catch (err) {
      if (err.code !== "23505") throw err;
      if (err.constraint === "uq_antrean_pasien_aktif") {
        return res.status(409).json({ message: "Anda sudah punya antrean di poli ini pada tanggal tersebut" });
      }
    }
  }
  res.status(503).json({ message: "Sedang banyak pendaftar. Silakan coba lagi." });
});

router.post("/:id/batal", authenticatePasien, async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE antrean SET status = 'batal' WHERE id = $1 AND pasien_id = $2 AND status = 'menunggu'",
    [req.params.id, req.pasienId]
  );
  if (!rowCount) {
    return res.status(409).json({ message: "Antrean ini sudah dipanggil atau selesai, jadi tidak bisa dibatalkan" });
  }
  res.status(204).end();
});

export default router;
