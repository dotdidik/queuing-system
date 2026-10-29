// Entry point lokal (npm run dev / npm start). Di Netlify, app dijalankan lewat netlify/functions/api.js.
import app from "./app.js";

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API absensi berjalan di http://localhost:${PORT}`));
