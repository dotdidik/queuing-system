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

const poli = [
  { kode: "A", nama: "Poli Umum" },
  { kode: "B", nama: "Poli Gigi" },
  { kode: "C", nama: "Poli KIA" }
];
for (const p of poli) {
  await pool.query("INSERT INTO poli (kode, nama) VALUES ($1, $2) ON CONFLICT (kode) DO NOTHING", [p.kode, p.nama]);
}

// Contoh tenaga medis hanya dibuat bila tabel masih kosong, agar seed aman dijalankan ulang.
const { rows: adaTenagaMedis } = await pool.query("SELECT 1 FROM tenaga_medis LIMIT 1");
if (!adaTenagaMedis.length) {
  const tenagaMedis = [
    { nama: "dr. Siti Rahmawati", jenis: "dokter", poli: "A", hari: [1, 2, 3] },
    { nama: "dr. Ahmad Fauzi", jenis: "dokter", poli: "A", hari: [4, 5, 6] },
    { nama: "drg. Rina Kartika", jenis: "dokter_gigi", poli: "B", hari: [1, 2, 3, 4, 5, 6] },
    { nama: "Ani Lestari, A.Md.Keb", jenis: "bidan", poli: "C", hari: [1, 2, 3, 4, 5, 6] }
  ];
  for (const t of tenagaMedis) {
    await pool.query(
      `INSERT INTO tenaga_medis (nama, jenis, poli_id, hari_piket)
       SELECT $1, $2, id, $4 FROM poli WHERE kode = $3`,
      [t.nama, t.jenis, t.poli, t.hari]
    );
  }
}

console.log("Data awal dibuat. Login admin: admin / admin123, pegawai: <NIP> / pegawai123");
await pool.end();
