import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { authenticatePasien } from "../middleware/auth.js";
import { TANGGAL_RE } from "../layanan.js";

const router = Router();

const COLUMNS = "id, nama, no_hp, tanggal_lahir, nik, no_bpjs";

// "+62 812-3456-789" / "62812..." -> "0812..."
function normalisasiHp(value) {
  const digit = String(value || "").replace(/\D/g, "");
  const hp = digit.startsWith("62") ? `0${digit.slice(2)}` : digit;
  return /^08\d{8,12}$/.test(hp) ? hp : null;
}

// Pasien tidak memakai password, jadi token berlaku lama dan tersimpan di HP.
const buatToken = (pasien) => jwt.sign({ pasienId: pasien.id }, process.env.JWT_SECRET, { expiresIn: "365d" });

function validasi(body) {
  const { nama, no_hp, tanggal_lahir, nik, no_bpjs } = body ?? {};
  const hp = normalisasiHp(no_hp);
  if (!nama?.trim()) return { error: "Nama wajib diisi" };
  if (!hp) return { error: "Nomor HP tidak valid. Contoh: 081234567890" };
  if (!TANGGAL_RE.test(tanggal_lahir || "")) return { error: "Tanggal lahir wajib diisi" };
  if (nik && !/^\d{16}$/.test(nik)) return { error: "NIK harus 16 digit angka" };
  return { data: [nama.trim(), hp, tanggal_lahir, nik || null, no_bpjs?.trim() || null] };
}

router.post("/daftar", async (req, res) => {
  const { error, data } = validasi(req.body);
  if (error) return res.status(400).json({ message: error });

  try {
    const { rows } = await pool.query(
      `INSERT INTO pasien (nama, no_hp, tanggal_lahir, nik, no_bpjs) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      data
    );
    res.status(201).json({ token: buatToken(rows[0]), pasien: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Nomor HP ini sudah terdaftar. Silakan pilih \"Sudah pernah daftar\"." });
    }
    throw err;
  }
});

router.post("/masuk", async (req, res) => {
  const hp = normalisasiHp(req.body?.no_hp);
  const { tanggal_lahir } = req.body ?? {};
  if (!hp || !TANGGAL_RE.test(tanggal_lahir || "")) {
    return res.status(400).json({ message: "Isi nomor HP dan tanggal lahir dengan benar" });
  }

  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM pasien WHERE no_hp = $1 AND tanggal_lahir = $2`, [
    hp,
    tanggal_lahir
  ]);
  if (!rows[0]) return res.status(401).json({ message: "Data tidak ditemukan. Periksa nomor HP dan tanggal lahir." });
  res.json({ token: buatToken(rows[0]), pasien: rows[0] });
});

router.get("/me", authenticatePasien, async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM pasien WHERE id = $1`, [req.pasienId]);
  if (!rows[0]) return res.status(401).json({ message: "Akun tidak ditemukan. Silakan daftar kembali." });
  res.json(rows[0]);
});

router.put("/me", authenticatePasien, async (req, res) => {
  const { error, data } = validasi(req.body);
  if (error) return res.status(400).json({ message: error });

  try {
    const { rows } = await pool.query(
      `UPDATE pasien SET nama = $1, no_hp = $2, tanggal_lahir = $3, nik = $4, no_bpjs = $5
       WHERE id = $6 RETURNING ${COLUMNS}`,
      [...data, req.pasienId]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Nomor HP sudah dipakai akun lain" });
    throw err;
  }
});

export default router;
