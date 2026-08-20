-- ============================================================
-- ITEM CATALOG
-- Sumber data untuk autocomplete /item-button, diisi lewat /setting item
-- atau lewat seed awal (npm run seed-items).
-- ============================================================
CREATE TABLE IF NOT EXISTS item_catalog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  raid_type   TEXT NOT NULL,             -- 'GDN' | 'DDN'
  tier        TEXT NOT NULL,             -- 'Classic' | 'HC'
  category    TEXT NOT NULL,             -- 'Accessory' | 'Armor' | 'Material'
  class       TEXT,                      -- Warrior/Cleric/Arcer/Sorceress/Academic/Kali (khusus Armor, NULL selainnya)
  item_name   TEXT NOT NULL,             -- nama lengkap untuk ditampilkan & dicari
  stamp_cost  INTEGER NOT NULL DEFAULT 0,-- jumlah sealstamp yang dibutuhkan untuk item ini
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_item_catalog_search ON item_catalog (raid_type, is_active, item_name);

-- ============================================================
-- PARTY RUN
-- ============================================================
CREATE TABLE IF NOT EXISTS party_run (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  channel_id        TEXT NOT NULL,
  panel_message_id  TEXT,                -- pesan embed panel party (di channel party)
  host_id           TEXT NOT NULL,
  title             TEXT NOT NULL,
  raid_type         TEXT,                -- opsional, tidak diminta lagi saat /createparty (bisa null)
  tier              TEXT,                -- opsional, tidak diminta lagi saat /createparty (bisa null)
  status            TEXT NOT NULL DEFAULT 'open', -- open | locked | done | cancelled
  created_at        TEXT DEFAULT (datetime('now')),
  voice_info        TEXT
);

CREATE TABLE IF NOT EXISTS role_requirement (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id    INTEGER NOT NULL REFERENCES party_run(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  slots     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS party_member (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                    INTEGER NOT NULL REFERENCES party_run(id) ON DELETE CASCADE,
  user_id                   TEXT NOT NULL,
  role_code                 TEXT NOT NULL,
  subrole                   TEXT,         -- Adept/Elestra atau subclass DPS
  is_excluded_from_salary   INTEGER NOT NULL DEFAULT 0,
  is_removed                INTEGER NOT NULL DEFAULT 0,
  joined_at                 TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id, user_id, role_code)
);

-- ============================================================
-- SALARY THREAD (dibuat otomatis saat party di-"Done")
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_thread (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                      INTEGER NOT NULL UNIQUE REFERENCES party_run(id) ON DELETE CASCADE,
  thread_id                   TEXT NOT NULL,
  panel_message_id            TEXT,       -- pesan embed panel salary di dalam thread (satu sumber kebenaran)
  accounting_id               TEXT,       -- user kedua (selain host) yang boleh pegang tombol host-only, opsional
  accounting_ign              TEXT,       -- IGN (nama di game) accounting, diisi manual krn Discord gak nyimpen IGN
  is_finalized                INTEGER NOT NULL DEFAULT 0,
  title_paid_prefix_applied   INTEGER NOT NULL DEFAULT 0,
  created_at                  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loot_entry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES party_run(id) ON DELETE CASCADE,
  item_id     INTEGER REFERENCES item_catalog(id), -- NULL = gold drop manual
  label       TEXT,             -- dipakai untuk gold drop, mis. "Gold Drop"
  qty         INTEGER NOT NULL DEFAULT 1,
  stamp_cost  INTEGER NOT NULL DEFAULT 0, -- snapshot stamp_cost dari item_catalog pas ditambahin (0 buat gold drop)
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | sold | gold
  sold_price  REAL,             -- total gold (untuk item: harga jual; untuk gold drop: langsung diisi saat dibuat)
  added_by    TEXT NOT NULL,
  added_at    TEXT DEFAULT (datetime('now'))
);

-- Override siapa saja yang eligible dapat bagian dari satu loot_entry.
-- Kalau kosong (tidak ada baris) untuk loot_entry_id tertentu -> default = semua member aktif & tidak excluded.
CREATE TABLE IF NOT EXISTS loot_eligibility (
  loot_entry_id INTEGER NOT NULL REFERENCES loot_entry(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  PRIMARY KEY (loot_entry_id, user_id)
);

CREATE TABLE IF NOT EXISTS sealstamp_loan (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            INTEGER NOT NULL REFERENCES party_run(id) ON DELETE CASCADE,
  loot_entry_id     INTEGER REFERENCES loot_entry(id) ON DELETE SET NULL, -- sudah tidak dipakai (deduction sekarang lump sum dari total item pool), dibiarkan NULL
  lender_id         TEXT NOT NULL,
  stamp_count       INTEGER NOT NULL,
  stamp_unit_price  INTEGER NOT NULL DEFAULT 5,
  created_at        TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- MULTI-SERVER: approval gate + pengaturan per-server
-- ============================================================
CREATE TABLE IF NOT EXISTS approved_guilds (
  guild_id     TEXT PRIMARY KEY,
  guild_name   TEXT,
  approved_by  TEXT NOT NULL,
  approved_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id                 TEXT PRIMARY KEY,
  language                 TEXT NOT NULL DEFAULT 'id',  -- 'id' | 'en'
  salary_channel_id        TEXT,          -- channel tempat thread salary dibuat
  thread_visibility        TEXT NOT NULL DEFAULT 'private', -- 'public' | 'private'
  unsold_board_channel_id  TEXT,          -- channel board item belum laku (lintas-server), NULL = nonaktif
  unsold_board_message_id  TEXT,          -- pesan board yang terus di-edit (bukan spam baru tiap update)
  autonick                 INTEGER NOT NULL DEFAULT 0, -- 1 = auto ubah nickname jadi "nama | IGN"
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now')),
  party_channel_id         TEXT,
  party_board_message_id   TEXT,
    leaderboard_channel_id         TEXT,   -- channel buat 2 pesan leaderboard (opsional)
  leaderboard_alltime_message_id   TEXT,
  leaderboard_weekly_message_id    TEXT
);

-- ============================================================
-- IGN TRACKING (per-server) — buat tag khusus first-timer & autonick
-- ============================================================
CREATE TABLE IF NOT EXISTS player_ign (
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  ign         TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS ign_capture_pending (
  thread_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS payment_status (
  run_id       INTEGER NOT NULL REFERENCES party_run(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  amount_owed  REAL NOT NULL DEFAULT 0,
  is_paid      INTEGER NOT NULL DEFAULT 0,
  paid_at      TEXT,
  PRIMARY KEY (run_id, user_id)
);
