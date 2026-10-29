import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

const publicUser = ({ id, nip, nama, jabatan, unit, role }) => ({ id, nip, nama, jabatan, unit, role });

router.post("/login", async (req, res) => {
  const { nip, password } = req.body ?? {};
  if (!nip || !password) return res.status(400).json({ message: "NIP dan password wajib diisi" });

  const { rows } = await pool.query("SELECT * FROM users WHERE nip = $1 AND aktif", [nip]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "NIP atau password salah" });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ token, user: publicUser(user) });
});

router.get("/me", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1 AND aktif", [req.user.id]);
  if (!rows[0]) return res.status(401).json({ message: "Akun tidak ditemukan" });
  res.json(publicUser(rows[0]));
});

router.put("/password", authenticate, async (req, res) => {
  const { passwordLama, passwordBaru } = req.body ?? {};
  if (!passwordBaru || passwordBaru.length < 6) {
    return res.status(400).json({ message: "Password baru minimal 6 karakter" });
  }

  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(passwordLama || "", rows[0].password_hash))) {
    return res.status(400).json({ message: "Password lama salah" });
  }

  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    await bcrypt.hash(passwordBaru, 10),
    req.user.id
  ]);
  res.json({ message: "Password berhasil diganti" });
});

export default router;
