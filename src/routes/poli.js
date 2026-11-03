import { Router } from "express";
import { pool } from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, requireAdmin);

function validasi(body) {
  const kode = String(body?.kode || "").trim().toUpperCase();
  const nama = String(body?.nama || "").trim();
  if (!/^[A-Z]{1,3}$/.test(kode)) return { error: "Kode poli 1–3 huruf, mis. A" };
  if (!nama) return { error: "Nama poli wajib diisi" };
  return { data: [kode, nama, body.aktif !== false] };
}

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, (SELECT count(*) FROM tenaga_medis t WHERE t.poli_id = p.id)::int AS jumlah_tenaga_medis
     FROM poli p ORDER BY p.aktif DESC, p.kode`
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { error, data } = validasi(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const { rows } = await pool.query("INSERT INTO poli (kode, nama, aktif) VALUES ($1, $2, $3) RETURNING *", data);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Kode poli sudah dipakai" });
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { error, data } = validasi(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const { rows } = await pool.query("UPDATE poli SET kode = $1, nama = $2, aktif = $3 WHERE id = $4 RETURNING *", [
      ...data,
      req.params.id
    ]);
    if (!rows[0]) return res.status(404).json({ message: "Poli tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Kode poli sudah dipakai" });
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM poli WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: "Poli tidak ditemukan" });
    res.status(204).end();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ message: "Poli sudah punya riwayat antrean. Nonaktifkan saja agar riwayat tetap ada." });
    }
    throw err;
  }
});

export default router;
