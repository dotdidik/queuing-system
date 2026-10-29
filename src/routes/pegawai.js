import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, requireAdmin);

const COLUMNS = "id, nip, nama, jabatan, unit, role, aktif";
const ROLES = ["admin", "pegawai"];

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users ORDER BY aktif DESC, nama`);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { nip, nama, jabatan, unit, role = "pegawai", password } = req.body ?? {};
  if (!nip || !nama || !password) {
    return res.status(400).json({ message: "NIP, nama, dan password wajib diisi" });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ message: "Role tidak valid" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (nip, nama, jabatan, unit, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [nip, nama, jabatan || null, unit || null, role, await bcrypt.hash(password, 10)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "NIP sudah terdaftar" });
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { nip, nama, jabatan, unit, role, aktif, password } = req.body ?? {};
  if (!nip || !nama) return res.status(400).json({ message: "NIP dan nama wajib diisi" });
  if (!ROLES.includes(role)) return res.status(400).json({ message: "Role tidak valid" });

  // Password hanya diganti bila diisi; COALESCE mempertahankan hash lama.
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  try {
    const { rows } = await pool.query(
      `UPDATE users
         SET nip = $1, nama = $2, jabatan = $3, unit = $4, role = $5, aktif = $6,
             password_hash = COALESCE($7, password_hash)
       WHERE id = $8 RETURNING ${COLUMNS}`,
      [nip, nama, jabatan || null, unit || null, role, aktif !== false, passwordHash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Pegawai tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "NIP sudah terdaftar" });
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ message: "Tidak bisa menghapus akun sendiri" });
  }
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: "Pegawai tidak ditemukan" });
  res.status(204).end();
});

export default router;
