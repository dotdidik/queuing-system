import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.js";
import pegawaiRoutes from "./routes/pegawai.js";
import absensiRoutes from "./routes/absensi.js";
import poliRoutes from "./routes/poli.js";
import tenagaMedisRoutes from "./routes/tenagaMedis.js";
import pasienRoutes from "./routes/pasien.js";
import antreanRoutes from "./routes/antrean.js";
import antreanAdminRoutes from "./routes/antreanAdmin.js";
import { TIMEZONE } from "./db.js";
import { LOKASI_KANTOR } from "./lokasi.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diset.");
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET belum diset.");
if (!Number.isFinite(LOKASI_KANTOR.lat) || !Number.isFinite(LOKASI_KANTOR.lng)) {
  throw new Error("PUSKESMAS_LAT dan PUSKESMAS_LNG belum diset.");
}
try {
  new Intl.DateTimeFormat("en", { timeZone: TIMEZONE });
} catch {
  throw new Error(`APP_TIMEZONE "${TIMEZONE}" tidak dikenal. Contoh yang benar: Asia/Jakarta, Asia/Makassar.`);
}

const app = express();
// Batas 1 MB karena foto tenaga medis dikirim sebagai data URL.
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/pegawai", pegawaiRoutes);
app.use("/api/absensi", absensiRoutes);
app.use("/api/poli", poliRoutes);
app.use("/api/tenaga-medis", tenagaMedisRoutes);
app.use("/api/pasien", pasienRoutes);
app.use("/api/antrean", antreanRoutes);
app.use("/api/admin/antrean", antreanAdminRoutes);

app.use((_req, res) => res.status(404).json({ message: "Endpoint tidak ditemukan" }));

// Express 5 meneruskan error dari handler async ke sini.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server" });
});

export default app;
