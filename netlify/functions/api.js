import serverless from "serverless-http";
import app from "../../src/app.js";

function parseJsonBody(req) {
  if (!Buffer.isBuffer(req.body)) return;
  const isJson = req.headers["content-type"]?.includes("application/json");
  try {
    req.body = isJson && req.body.length ? JSON.parse(req.body.toString("utf8")) : undefined;
  } catch {
    // Body tidak valid diperlakukan sebagai kosong; validasi di routes yang membalas 400.
    req.body = undefined;
  }
}

export const handler = serverless(app, {
  request(req) {
    // Redirect di netlify.toml meneruskan /api/* ke function ini; kembalikan path ke bentuk /api/*
    // yang dikenali routes Express, apa pun bentuk path yang diterima function.
    req.url = req.url.replace(/^\/\.netlify\/functions\/api(?=\/|\?|$)/, "/api");
    // serverless-http menandai request sudah selesai dibaca, sehingga express.json() melewatinya
    // dan req.body tetap Buffer mentah. Karena itu body JSON di-parse di sini.
    parseJsonBody(req);
  }
});
