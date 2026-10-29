import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.js";
import pegawaiRoutes from "./routes/pegawai.js";
import absensiRoutes from "./routes/absensi.js";
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
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/pegawai", pegawaiRoutes);
app.use("/api/absensi", absensiRoutes);

app.use((_req, res) => res.status(404).json({ message: "Endpoint tidak ditemukan" }));

// Express 5 meneruskan error dari handler async ke sini.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server" });
});

export default app;
