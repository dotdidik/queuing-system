import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.js";
import pegawaiRoutes from "./routes/pegawai.js";
import absensiRoutes from "./routes/absensi.js";
import { LOKASI_KANTOR } from "./lokasi.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET belum diset. Salin .env.example menjadi .env lalu isi nilainya.");
  process.exit(1);
}
if (!Number.isFinite(LOKASI_KANTOR.lat) || !Number.isFinite(LOKASI_KANTOR.lng)) {
  console.error("PUSKESMAS_LAT dan PUSKESMAS_LNG belum diset di .env.");
  process.exit(1);
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API absensi berjalan di http://localhost:${PORT}`));
