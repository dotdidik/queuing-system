import { readFile } from "node:fs/promises";
import { pool } from "../src/db.js";

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await pool.query(sql);
console.log("Skema database berhasil dibuat.");
await pool.end();
