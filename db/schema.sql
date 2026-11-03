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

-- ================= Antrean pasien =================

CREATE TABLE IF NOT EXISTS poli (
  id    SERIAL PRIMARY KEY,
  kode  VARCHAR(3)   NOT NULL UNIQUE,   -- awalan nomor antrean, mis. "A" -> A-001
  nama  VARCHAR(100) NOT NULL,
  aktif BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tenaga_medis (
  id         SERIAL PRIMARY KEY,
  nama       VARCHAR(100) NOT NULL,
  jenis      VARCHAR(20)  NOT NULL CHECK (jenis IN ('dokter', 'dokter_gigi', 'bidan', 'perawat')),
  poli_id    INT          NOT NULL REFERENCES poli (id) ON DELETE CASCADE,
  hari_piket SMALLINT[]   NOT NULL DEFAULT '{}',   -- 1 = Senin ... 7 = Minggu
  foto       TEXT,                                 -- data URL gambar kecil; NULL = pakai placeholder
  aktif      BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pasien (
  id            SERIAL PRIMARY KEY,
  nama          VARCHAR(100) NOT NULL,
  no_hp         VARCHAR(20)  NOT NULL UNIQUE,
  tanggal_lahir DATE         NOT NULL,
  nik           VARCHAR(16),
  no_bpjs       VARCHAR(20),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS antrean (
  id            SERIAL PRIMARY KEY,
  pasien_id     INT         NOT NULL REFERENCES pasien (id) ON DELETE CASCADE,
  poli_id       INT         NOT NULL REFERENCES poli (id),
  tanggal       DATE        NOT NULL,
  nomor         INT         NOT NULL,
  jam_perkiraan TIME        NOT NULL,
  keluhan       TEXT,
  status        VARCHAR(12) NOT NULL DEFAULT 'menunggu'
                CHECK (status IN ('menunggu', 'dipanggil', 'selesai', 'tidak_hadir', 'batal')),
  catatan       TEXT,                              -- catatan dari admin
  dipanggil_at  TIMESTAMPTZ,
  selesai_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poli_id, tanggal, nomor)
);

-- Satu pasien hanya boleh punya satu antrean aktif per poli per tanggal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_antrean_pasien_aktif
  ON antrean (pasien_id, poli_id, tanggal) WHERE status <> 'batal';
CREATE INDEX IF NOT EXISTS idx_antrean_poli_tanggal ON antrean (poli_id, tanggal, status);
