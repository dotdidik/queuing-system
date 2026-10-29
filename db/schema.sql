CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  nip           VARCHAR(30)  NOT NULL UNIQUE,
  nama          VARCHAR(100) NOT NULL,
  jabatan       VARCHAR(100),
  unit          VARCHAR(100),
  role          VARCHAR(10)  NOT NULL DEFAULT 'pegawai' CHECK (role IN ('admin', 'pegawai')),
  password_hash TEXT         NOT NULL,
  aktif         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS absensi (
  id          SERIAL PRIMARY KEY,
  user_id     INT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tanggal     DATE        NOT NULL,
  jam_masuk   TIMESTAMPTZ,
  jam_pulang  TIMESTAMPTZ,
  status      VARCHAR(15) NOT NULL
              CHECK (status IN ('hadir', 'terlambat', 'izin', 'sakit', 'cuti', 'dinas_luar')),
  keterangan  TEXT,
  UNIQUE (user_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi (tanggal);

-- Lokasi GPS saat absen (jarak & akurasi dalam meter). ALTER agar database lama ikut ter-update.
ALTER TABLE absensi
  ADD COLUMN IF NOT EXISTS lat_masuk      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng_masuk      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS jarak_masuk    INT,
  ADD COLUMN IF NOT EXISTS akurasi_masuk  INT,
  ADD COLUMN IF NOT EXISTS lat_pulang     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng_pulang     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS jarak_pulang   INT,
  ADD COLUMN IF NOT EXISTS akurasi_pulang INT;
