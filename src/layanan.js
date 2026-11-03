import { TIMEZONE } from "./db.js";

// Jam pendaftaran antrean. Pasien memilih salah satu slot sebagai perkiraan jam kedatangan.
export const LAYANAN = {
  mulai: process.env.JAM_LAYANAN_MULAI || "08:00",
  selesai: process.env.JAM_LAYANAN_SELESAI || "12:00",
  slotMenit: Number(process.env.SLOT_MENIT || 30),
  kuotaSlot: Number(process.env.KUOTA_PER_SLOT || 10),
  hariDaftar: Number(process.env.HARI_DAFTAR_MAKS || 7)
};

export const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
export const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const keMenit = (jam) => Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5));
const keJam = (menit) => `${String(Math.floor(menit / 60)).padStart(2, "0")}:${String(menit % 60).padStart(2, "0")}`;

/** ["08:00", "08:30", ...] — slot terakhir dimulai sebelum jam selesai. */
export function daftarSlot() {
  const slot = [];
  for (let m = keMenit(LAYANAN.mulai); m < keMenit(LAYANAN.selesai); m += LAYANAN.slotMenit) slot.push(keJam(m));
  return slot;
}

export const hariIni = () => new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });

const jamSekarang = () =>
  new Date().toLocaleTimeString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Slot hari ini masih bisa dipilih selama waktunya belum habis. */
export const slotLewat = (tanggal, jam) =>
  tanggal === hariIni() && keMenit(jam) + LAYANAN.slotMenit <= keMenit(jamSekarang());

/** Tanggal yang bisa dipilih pasien: hari ini sampai hariDaftar-1 hari ke depan. */
export function tanggalTersedia() {
  const [y, m, d] = hariIni().split("-").map(Number);
  return Array.from({ length: LAYANAN.hariDaftar }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    return { tanggal: t.toISOString().slice(0, 10), hari: t.getUTCDay() || 7 };
  });
}

// Nomor antrean yang ditampilkan ke pasien dan layar, mis. A-007.
export const KODE_ANTREAN = (poli, antrean) => `${poli}.kode || '-' || lpad(${antrean}.nomor::text, 3, '0')`;
