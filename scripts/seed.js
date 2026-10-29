import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const users = [
  { nip: "admin", nama: "Administrator", jabatan: "Kepala Tata Usaha", unit: "Tata Usaha", role: "admin", password: "admin123" },
  { nip: "198501012010012001", nama: "dr. Siti Rahmawati", jabatan: "Dokter Umum", unit: "Poli Umum", role: "pegawai", password: "pegawai123" },
  { nip: "199003152015022002", nama: "Ani Lestari, A.Md.Keb", jabatan: "Bidan", unit: "Poli KIA", role: "pegawai", password: "pegawai123" },
  { nip: "199207202019031003", nama: "Budi Santoso, S.Kep", jabatan: "Perawat", unit: "UGD", role: "pegawai", password: "pegawai123" }
];

for (const u of users) {
  await pool.query(
    `INSERT INTO users (nip, nama, jabatan, unit, role, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (nip) DO NOTHING`,
    [u.nip, u.nama, u.jabatan, u.unit, u.role, await bcrypt.hash(u.password, 10)]
  );
}

console.log("Data awal dibuat. Login admin: admin / admin123, pegawai: <NIP> / pegawai123");
await pool.end();
