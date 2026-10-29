export const LOKASI_KANTOR = {
  lat: Number(process.env.PUSKESMAS_LAT),
  lng: Number(process.env.PUSKESMAS_LNG),
  radius: Number(process.env.RADIUS_METER || 100)
};

const RADIUS_BUMI_METER = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

// Rumus haversine: jarak garis lurus antara dua titik di permukaan bumi.
export function jarakMeter(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIUS_BUMI_METER * Math.asin(Math.sqrt(h));
}

export function parseKoordinat(body) {
  const { lat, lng, akurasi } = body ?? {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, akurasi: typeof akurasi === "number" ? Math.round(akurasi) : null };
}
