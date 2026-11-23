const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://rentique:rentique@localhost:5432/rentique',
  max: 10,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  pw         TEXT NOT NULL,
  closet     TEXT,
  city       TEXT NOT NULL DEFAULT 'Near you',
  bio        TEXT NOT NULL DEFAULT 'New on Rentique and building a closet.',
  hue        TEXT NOT NULL DEFAULT '#FF3D8B',
  rating     REAL,
  resp       TEXT NOT NULL DEFAULT 'New lender',
  is_demo    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id         SERIAL PRIMARY KEY,
  owner_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  cat        TEXT NOT NULL,
  price      INT NOT NULL CHECK (price BETWEEN 1 AND 500),
  deposit    INT NOT NULL CHECK (deposit BETWEEN 0 AND 500),
  c1         TEXT NOT NULL,
  c2         TEXT NOT NULL,
  pat        TEXT NOT NULL,
  descr      TEXT NOT NULL DEFAULT '',
  tile       TEXT NOT NULL,
  sizes      TEXT[] NOT NULL,
  rules      JSONB NOT NULL,
  live       BOOLEAN NOT NULL DEFAULT true,
  deleted    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_owner_idx ON items(owner_id);
CREATE TABLE IF NOT EXISTS photos (
  id      SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  pos     INT NOT NULL DEFAULT 0,
  mime    TEXT NOT NULL,
  data    BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_item_idx ON photos(item_id, pos);
CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  item_id     INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_day   INT NOT NULL,
  end_day     INT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending','confirmed','completed','cancelled','declined')),
  size        TEXT,
  created_day INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_day >= start_day)
);
CREATE INDEX IF NOT EXISTS bookings_item_idx ON bookings(item_id, start_day);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings(customer_id);
CREATE TABLE IF NOT EXISTS saves (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, item_id)
);
`;

async function init() {
  await pool.query(SCHEMA);
}

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    c.release();
  }
}

async function dropAll() {
  await pool.query('DROP TABLE IF EXISTS saves, bookings, photos, items, sessions, users CASCADE');
}

module.exports = { pool, init, tx, dropAll };
