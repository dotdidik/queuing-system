import { Router } from "express";
import { pool } from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

const JENIS = ["dokter", "dokter_gigi", "bidan", "perawat"];
const FOTO_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const FOTO_MAKS = 400_000; // panjang data URL; frontend sudah mengecilkan foto sebelum dikirim

// Foto tidak ikut di daftar (bisa besar); klien memuatnya lewat URL ini, ?v= untuk cache busting.
export const KOLOM_PUBLIK = `t.id, t.nama, t.jenis, t.poli_id, t.hari_piket, t.aktif,
  (t.foto IS NOT NULL) AS ada_foto, floor(extract(epoch FROM t.updated_at))::int AS versi`;

// Publik: dipakai aplikasi pasien dan layar antrean.
router.get("/:id/foto", async (req, res) => {
  const { rows } = await pool.query("SELECT foto FROM tenaga_medis WHERE id = $1", [req.params.id]);
  const cocok = rows[0]?.foto?.match(FOTO_RE);
  if (!cocok) return res.status(404).json({ message: "Foto tidak ada" });
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type(cocok[1]).send(Buffer.from(cocok[2], "base64"));
});

router.use(authenticate, requireAdmin);

function validasi(body) {
  const { nama, jenis, poli_id, hari_piket = [], foto } = body ?? {};
  if (!nama?.trim()) return { error: "Nama wajib diisi" };
  if (!JENIS.includes(jenis)) return { error: "Jenis tenaga medis tidak valid" };
  if (!Number.isInteger(Number(poli_id))) return { error: "Poli wajib dipilih" };
  if (!Array.isArray(hari_piket) || hari_piket.some((h) => !Number.isInteger(h) || h < 1 || h > 7)) {
    return { error: "Hari piket tidak valid" };
  }
  if (foto != null && (!FOTO_RE.test(foto) || foto.length > FOTO_MAKS)) {
    return { error: "Foto harus JPG/PNG/WebP dan tidak terlalu besar" };
  }
  return { data: [nama.trim(), jenis, Number(poli_id), [...new Set(hari_piket)].sort(), body.aktif !== false] };
}

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${KOLOM_PUBLIK}, p.nama AS poli FROM tenaga_medis t JOIN poli p ON p.id = t.poli_id
     ORDER BY t.aktif DESC, p.kode, t.nama`
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { error, data } = validasi(req.body);
  if (error) return res.status(400).json({ message: error });
  const { rows } = await pool.query(
    `INSERT INTO tenaga_medis AS t (nama, jenis, poli_id, hari_piket, aktif, foto)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${KOLOM_PUBLIK}`,
    [...data, req.body.foto || null]
  );
  res.status(201).json(rows[0]);
});

// foto: tidak dikirim = tetap, null = hapus (kembali ke placeholder), string = ganti.
router.put("/:id", async (req, res) => {
  const { error, data } = validasi(req.body);
  if (error) return res.status(400).json({ message: error });
  const gantiFoto = req.body.foto !== undefined;
  const { rows } = await pool.query(
    `UPDATE tenaga_medis t
       SET nama = $1, jenis = $2, poli_id = $3, hari_piket = $4, aktif = $5,
           foto = CASE WHEN $6 THEN $7 ELSE foto END, updated_at = now()
     WHERE id = $8 RETURNING ${KOLOM_PUBLIK}`,
    [...data, gantiFoto, req.body.foto ?? null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ message: "Tenaga medis tidak ditemukan" });
  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM tenaga_medis WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: "Tenaga medis tidak ditemukan" });
  res.status(204).end();
});

export default router;
