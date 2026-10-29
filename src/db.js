import "dotenv/config";
import pg from "pg";

// Kolom DATE dikembalikan sebagai string "YYYY-MM-DD" agar tidak bergeser karena zona waktu Node.
pg.types.setTypeParser(1082, (value) => value);

export const TIMEZONE = process.env.APP_TIMEZONE || "Asia/Jakarta";

// "Hari ini" dan "jam sekarang" dihitung eksplisit di setiap query, bukan lewat setting timezone
// koneksi, karena connection pooler (mis. Supabase) tidak meneruskan setting per koneksi.
const tz = pg.escapeLiteral(TIMEZONE);
export const HARI_INI = `(now() AT TIME ZONE ${tz})::date`;
export const JAM_SEKARANG = `(now() AT TIME ZONE ${tz})::time`;

const connectionString = process.env.DATABASE_URL;
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString || "");

export const pool = new pg.Pool({
  connectionString,
  // Supabase mewajibkan SSL; PostgreSQL lokal tidak.
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  // Di serverless setiap instance cukup 1 koneksi; pooler Supabase yang membagi koneksi ke database.
  max: process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 10
});
