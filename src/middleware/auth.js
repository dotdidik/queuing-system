import jwt from "jsonwebtoken";

function bacaToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Token pegawai berisi { id, role }; token pasien berisi { pasienId }. Keduanya tidak saling menggantikan.
export function authenticate(req, res, next) {
  const payload = bacaToken(req);
  if (!payload?.id) return res.status(401).json({ message: "Sesi tidak valid atau sudah berakhir. Silakan login." });
  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Khusus admin" });
  next();
}

export function authenticatePasien(req, res, next) {
  const payload = bacaToken(req);
  if (!payload?.pasienId) return res.status(401).json({ message: "Sesi tidak valid. Silakan masuk kembali." });
  req.pasienId = payload.pasienId;
  next();
}
