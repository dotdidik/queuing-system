import "dotenv/config";
import pg from "pg";

// Kolom DATE dikembalikan sebagai string "YYYY-MM-DD" agar tidak bergeser karena zona waktu Node.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // CURRENT_DATE dan LOCALTIME di setiap query mengikuti zona waktu puskesmas.
  options: `-c timezone=${process.env.APP_TIMEZONE || "Asia/Jakarta"}`
});
