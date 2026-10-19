CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  tax_id TEXT PRIMARY KEY NOT NULL,
  legal_name TEXT NOT NULL,
  account_key TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
