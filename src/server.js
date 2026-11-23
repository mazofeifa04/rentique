const express = require('express');
const path = require('path');
const { pool, init, tx } = require('./db');
const { hashPw, verifyPw, sha, newToken } = require('./auth');
const { seedIfEmpty } = require('./seed');

const PORT = +process.env.PORT || 3000;
const DEMO_LOGIN = process.env.DEMO_LOGIN !== 'false';
const SESSION_DAYS = 30;
const CATS = ['night', 'pants', 'jackets', 'tops', 'skirts', 'bags'];
const PATS = ['solid', 'stripes', 'dots', 'checks', 'stars', 'grad'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'One size'];
const TILES = ['#FFD6E8', '#E4F9A6', '#D6D4FF', '#FFE0C7', '#E8DCFF', '#CDEBFF'];
const PAL = ['#FF3D8B', '#3A35FF', '#C9F53B', '#FF8A3D', '#9B6BFF'];
const DEMO_KEYS = { alex: 'alex@demo.rentique', mika: 'mika@demo.rentique' };
const today = () => Math.floor(Date.now() / 864e5);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === undefined ? 1 : (isNaN(+process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : +process.env.TRUST_PROXY));

/* ---------- security headers ---------- */
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(express.json({ limit: '9mb' }));

/* ---------- helpers ---------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const int = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^-?\d+$/.test(v) ? +v : NaN));
const str = (v, max, min = 0) => { if (typeof v !== 'string') return null; const t = v.trim(); return t.length >= min && t.length <= max ? t : null; };
const hex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

// CSRF: every state-changing request must carry a custom header, which browsers will not send cross-site without a CORS preflight.
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'rentique') return next(new HttpError(403, 'Missing request header'));
  next();
});

// tiny in-memory rate limiter for auth endpoints
const hits = new Map();
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();
const limit = (max) => (req, res, next) => {
  const k = req.ip + req.path, n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (n > max) return next(new HttpError(429, 'Too many attempts. Wait a few minutes and try again.'));
  next();
};

const cookieOf = (req, name) => {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};
async function startSession(req, res, userId) {
  const token = newToken();
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2, now() + interval '${SESSION_DAYS} days')`, [sha(token), userId]);
  res.append('Set-Cookie', `rq_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${req.secure ? '; Secure' : ''}`);
}

app.use(wrap(async (req, res, next) => {
  req.user = null;
  const t = cookieOf(req, 'rq_session');
  if (t) {
    const { rows } = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [sha(t)]);
    req.user = rows[0] || null;
  }
  next();
}));
const need = (req) => { if (!req.user) throw new HttpError(401, 'Log in to do that'); return req.user; };

const userOut = (u) => u && { id: String(u.id), name: u.name, email: u.email, demo: u.is_demo && !!Object.values(DEMO_KEYS).includes(u.email) };
const ownerOut = (u) => ({
  id: String(u.id), name: u.name, closet: u.closet || (u.name.split(' ')[0] + "'s Closet"), city: u.city, bio: u.bio,
  hue: u.hue, rating: u.rating, resp: u.resp, since: new Date(u.created_at).getUTCFullYear(),
});

/* ---------- auth ---------- */
app.post('/api/auth/signup', limit(15), wrap(async (req, res) => {
  const name = str(req.body.name, 40, 1), email = str(req.body.email, 120, 5), pw = req.body.password;
  if (!name) throw bad('Add your name (up to 40 characters).');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('That email does not look right.');
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) throw bad('Use a password with at least 8 characters.');
  const hue = PAL[Math.floor(Math.random() * PAL.length)];
  let row;
  try {
    ({ rows: [row] } = await pool.query('INSERT INTO users(email,name,pw,hue) VALUES($1,$2,$3,$4) RETURNING id', [email.toLowerCase(), name, await hashPw(pw), hue]));
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'That email already has an account. Try logging in.');
    throw e;
  }
  await startSession(req, res, row.id);
  res.json({ ok: true });
}));

app.post('/api/auth/login', limit(20), wrap(async (req, res) => {
  const email = str(req.body.email, 120, 1), pw = req.body.password;
  const { rows } = await pool.query('SELECT id,pw FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  const ok = rows[0] && typeof pw === 'string' && await verifyPw(pw, rows[0].pw);
  if (!ok) throw new HttpError(401, 'Email or password does not match. Check them and try again.');
  await startSession(req, res, rows[0].id);
  res.json({ ok: true });
}));

app.post('/api/auth/demo', limit(30), wrap(async (req, res) => {
  if (!DEMO_LOGIN) throw new HttpError(404, 'Demo login is off');
  const email = DEMO_KEYS[req.body.who];
  if (!email) throw bad('Unknown demo user');
  const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (!rows[0]) throw new HttpError(404, 'Demo user not found. Run the seed again.');
  await startSession(req, res, rows[0].id);
  res.json({ ok: true });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const t = cookieOf(req, 'rq_session');
  if (t) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sha(t)]);
  res.append('Set-Cookie', 'rq_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

app.patch('/api/me', wrap(async (req, res) => {
  const u = need(req);
  const closet = str(req.body.closet, 40, 1), city = str(req.body.city, 30, 1), bio = str(req.body.bio, 200, 0);
  if (!closet || !city || bio === null) throw bad('Closet name and city are required.');
  await pool.query('UPDATE users SET closet=$2, city=$3, bio=$4 WHERE id=$1', [u.id, closet, city, bio || 'New on Rentique and building a closet.']);
  res.json({ ok: true });
}));

/* ---------- bootstrap: everything the UI needs in one call ---------- */
app.get('/api/bootstrap', wrap(async (req, res) => {
  const d = today(), uid = req.user ? req.user.id : 0;
  // housekeeping: unanswered requests expire, finished rentals complete
  await pool.query(`UPDATE bookings SET status='cancelled' WHERE status='pending' AND start_day < $1`, [d]);
  await pool.query(`UPDATE bookings SET status='completed' WHERE status='confirmed' AND end_day < $1`, [d]);

  const items = (await pool.query('SELECT * FROM items WHERE NOT deleted AND (live OR owner_id=$1) ORDER BY id', [uid])).rows;
  const ids = items.map((i) => i.id);
  const photoRows = ids.length ? (await pool.query('SELECT id,item_id FROM photos WHERE item_id = ANY($1) ORDER BY item_id,pos,id', [ids])).rows : [];
  const photos = {};
  photoRows.forEach((p) => (photos[p.item_id] = photos[p.item_id] || []).push('/api/photos/' + p.id));

  const bks = ids.length ? (await pool.query(
    `SELECT b.*, i.owner_id FROM bookings b JOIN items i ON i.id=b.item_id
     WHERE b.item_id = ANY($1) AND (b.status IN ('confirmed','pending','completed') OR b.customer_id=$2 OR i.owner_id=$2)
     ORDER BY b.id`, [ids, uid])).rows : [];
  const bookings = bks.map((b) => {
    const mine = b.customer_id === uid || b.owner_id === uid;
    return { id: String(b.id), item: String(b.item_id), cust: mine ? String(b.customer_id) : null, start: b.start_day, end: b.end_day, status: b.status, created: mine ? b.created_day : null, size: mine ? b.size : null };
  });

  const ownerIds = new Set(items.map((i) => i.owner_id));
  if (uid) ownerIds.add(uid);
  const custIds = new Set(bks.filter((b) => b.customer_id === uid || b.owner_id === uid).map((b) => b.customer_id));
  const need = [...new Set([...ownerIds, ...custIds])];
  const urows = need.length ? (await pool.query('SELECT * FROM users WHERE id = ANY($1)', [need])).rows : [];
  const owners = {}, people = {};
  urows.forEach((u) => {
    if (ownerIds.has(u.id)) owners[u.id] = ownerOut(u);
    if (custIds.has(u.id)) people[u.id] = { id: String(u.id), name: u.name, hue: u.hue };
  });

  const saved = uid ? (await pool.query('SELECT item_id FROM saves WHERE user_id=$1', [uid])).rows.map((r) => String(r.item_id)) : [];
  res.json({
    user: userOut(req.user), demoLogin: DEMO_LOGIN, saved, owners, people, bookings,
    items: items.map((r) => ({ id: String(r.id), name: r.name, cat: r.cat, owner: String(r.owner_id), price: r.price, deposit: r.deposit, c1: r.c1, c2: r.c2, pat: r.pat, desc: r.descr, tile: r.tile, sizes: r.sizes, live: r.live, rules: r.rules, photos: photos[r.id] || [] })),
  });
}));

/* ---------- photos ---------- */
function decodePhotos(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 3) throw bad('You can add up to 3 photos.');
  return list.map((d) => {
    const m = typeof d === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(d);
    if (!m) throw bad('Photos must be JPEG, PNG or WebP images.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2.5 * 1024 * 1024) throw bad('One photo is too large (max 2.5 MB).');
    const sig = buf.subarray(0, 12);
    const okSig = (m[1] === 'image/jpeg' && sig[0] === 0xFF && sig[1] === 0xD8) || (m[1] === 'image/png' && sig[0] === 0x89 && sig.toString('latin1', 1, 4) === 'PNG') || (m[1] === 'image/webp' && sig.toString('latin1', 0, 4) === 'RIFF' && sig.toString('latin1', 8, 12) === 'WEBP');
    if (!okSig) throw bad('That file is not a valid image.');
    return { mime: m[1], buf };
  });
}
const savePhotos = async (c, itemId, list) => {
  await c.query('DELETE FROM photos WHERE item_id=$1', [itemId]);
  for (let i = 0; i < list.length; i++) await c.query('INSERT INTO photos(item_id,pos,mime,data) VALUES($1,$2,$3,$4)', [itemId, i, list[i].mime, list[i].buf]);
};
app.get('/api/photos/:id', wrap(async (req, res) => {
  const id = int(req.params.id);
  if (Number.isNaN(id)) return res.sendStatus(404);
  const { rows } = await pool.query('SELECT p.mime,p.data FROM photos p JOIN items i ON i.id=p.item_id WHERE p.id=$1 AND NOT i.deleted', [id]);
  if (!rows[0]) return res.sendStatus(404);
  res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'public, max-age=31536000, immutable' }).send(rows[0].data);
}));

/* ---------- items ---------- */
app.post('/api/items', wrap(async (req, res) => {
  const u = need(req), b = req.body;
  const name = str(b.name, 40, 1), cat = b.cat, pat = b.pat, price = int(b.price), deposit = int(b.deposit), max = int(b.max), late = int(b.late ?? 0);
  if (!name) throw bad('Give the piece a name (up to 40 characters).');
  if (!CATS.includes(cat) || !PATS.includes(pat)) throw bad('Pick a valid theme and pattern.');
  if (!(price >= 1 && price <= 500) || !(deposit >= 0 && deposit <= 500)) throw bad('Price must be $1 to $500 and deposit $0 to $500.');
  if (!(max >= 1 && max <= 30) || !(late >= 0 && late <= 500)) throw bad('Check the max days and late fee.');
  if (!hex(b.c1) || !hex(b.c2)) throw bad('Pick valid colors.');
  const sizes = Array.isArray(b.sizes) ? [...new Set(b.sizes.filter((s) => SIZES.includes(s)))] : [];
  if (!sizes.length) throw bad('Pick at least one size.');
  const list = (a, fb) => { const v = Array.isArray(a) ? a.map((x) => str(x, 60, 1)).filter(Boolean).slice(0, 4) : []; return v.length ? v : fb; };
  const rules = { min: 1, max, late, pickup: (u.city || 'Near you') + ' pickup, or a courier for $4', cleaning: 'I handle the cleaning after every rental', dos: list(b.dos, ['Message me about any snag early']), donts: list(b.donts, ['No pins, hems or alterations']) };
  const photos = decodePhotos(b.photos);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO items(owner_id,name,cat,price,deposit,c1,c2,pat,descr,tile,sizes,rules) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
      [u.id, name, cat, price, deposit, b.c1, b.c2, pat, str(b.desc, 200) || 'A fresh listing from a new closet.', TILES[Math.floor(Math.random() * 6)], sizes, rules]);
    await savePhotos(c, rows[0].id, photos);
    return rows[0].id;
  });
  res.json({ id: String(id) });
}));

async function ownItem(req, id) {
  const u = need(req), n = int(id);
  if (Number.isNaN(n)) throw new HttpError(404, 'Not found');
  const { rows } = await pool.query('SELECT * FROM items WHERE id=$1 AND NOT deleted', [n]);
  if (!rows[0]) throw new HttpError(404, 'That piece no longer exists');
  if (rows[0].owner_id !== u.id) throw new HttpError(403, 'That is not your piece');
  return rows[0];
}
app.patch('/api/items/:id', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id), b = req.body;
  let price = it.price, live = it.live;
  if (b.price !== undefined) { price = int(b.price); if (!(price >= 1 && price <= 500)) throw bad('Price must be $1 to $500.'); }
  if (b.live !== undefined) live = !!b.live;
  await pool.query('UPDATE items SET price=$2, live=$3 WHERE id=$1', [it.id, price, live]);
  res.json({ ok: true });
}));
app.delete('/api/items/:id', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id);
  await pool.query(`UPDATE items SET deleted=true, live=false WHERE id=$1`, [it.id]);
  await pool.query(`UPDATE bookings SET status='cancelled' WHERE item_id=$1 AND status IN ('pending','confirmed') AND end_day >= $2`, [it.id, today()]);
  res.json({ ok: true });
}));
app.put('/api/items/:id/photos', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id), photos = decodePhotos(req.body.photos);
  await tx((c) => savePhotos(c, it.id, photos));
  res.json({ ok: true });
}));

/* ---------- bookings ---------- */
app.post('/api/bookings', wrap(async (req, res) => {
  const u = need(req), start = int(req.body.start), end = int(req.body.end), itemId = int(req.body.item), d = today();
  if ([start, end, itemId].some(Number.isNaN) || end < start || start < d - 1 || end - start > 60) throw bad('Pick valid dates.');
  const id = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [itemId]); // one booking at a time per item, so two people cannot take the same days
    const { rows } = await c.query('SELECT * FROM items WHERE id=$1 AND NOT deleted AND live', [itemId]);
    const it = rows[0];
    if (!it) throw new HttpError(404, 'That piece is not available');
    if (it.owner_id === u.id) throw bad("That's your own piece");
    const n = end - start + 1, r = it.rules;
    if (n < r.min || n > r.max) throw bad(`This lender allows ${r.min === r.max ? r.min : r.min + ' to ' + r.max} days per rental.`);
    const size = typeof req.body.size === 'string' && it.sizes.includes(req.body.size) ? req.body.size : it.sizes[0];
    const clash = await c.query(`SELECT 1 FROM bookings WHERE item_id=$1 AND status IN ('pending','confirmed') AND start_day<=$3 AND end_day>=$2 LIMIT 1`, [itemId, start, end]);
    if (clash.rowCount) throw new HttpError(409, 'Someone just took some of those days. Pick other dates.');
    const ins = await c.query(`INSERT INTO bookings(item_id,customer_id,start_day,end_day,status,size,created_day) VALUES($1,$2,$3,$4,'pending',$5,$6) RETURNING id`, [itemId, u.id, start, end, size, d]);
    return ins.rows[0].id;
  });
  res.json({ id: String(id) });
}));

app.patch('/api/bookings/:id', wrap(async (req, res) => {
  const u = need(req), n = int(req.params.id), status = req.body.status, d = today();
  if (Number.isNaN(n)) throw new HttpError(404, 'Not found');
  const { rows } = await pool.query('SELECT b.*, i.owner_id FROM bookings b JOIN items i ON i.id=b.item_id WHERE b.id=$1', [n]);
  const b = rows[0];
  if (!b) throw new HttpError(404, 'Booking not found');
  const isCust = b.customer_id === u.id, isOwner = b.owner_id === u.id;
  const ok =
    (isCust && status === 'cancelled' && (b.status === 'pending' || (b.status === 'confirmed' && b.start_day > d))) ||
    (isOwner && b.status === 'pending' && (status === 'confirmed' || status === 'declined')) ||
    (isOwner && status === 'cancelled' && b.status === 'confirmed' && b.start_day > d);
  if (!ok) throw new HttpError(403, 'You cannot make that change');
  await pool.query('UPDATE bookings SET status=$2 WHERE id=$1', [n, status]);
  res.json({ ok: true });
}));

/* ---------- saves ---------- */
app.post('/api/saves/:id', wrap(async (req, res) => {
  const u = need(req), n = int(req.params.id);
  if (Number.isNaN(n)) throw new HttpError(404, 'Not found');
  await pool.query('INSERT INTO saves(user_id,item_id) SELECT $1, id FROM items WHERE id=$2 AND NOT deleted ON CONFLICT DO NOTHING', [u.id, n]);
  res.json({ ok: true });
}));
app.delete('/api/saves/:id', wrap(async (req, res) => {
  const u = need(req), n = int(req.params.id);
  await pool.query('DELETE FROM saves WHERE user_id=$1 AND item_id=$2', [u.id, n]);
  res.json({ ok: true });
}));

/* ---------- misc ---------- */
app.get('/healthz', wrap(async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m', extensions: ['html'] }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') err = new HttpError(413, 'That upload is too large. Use fewer or smaller photos.');
  if (err instanceof SyntaxError && err.status === 400) err = new HttpError(400, 'Invalid request');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Try again.' : err.message });
});

/* ---------- boot ---------- */
(async () => {
  for (let i = 1; ; i++) {
    try { await init(); break; }
    catch (e) { if (i >= 30) throw e; console.log(`Waiting for the database (${i}/30): ${e.code || e.message}`); await new Promise((r) => setTimeout(r, 2000)); }
  }
  if (process.env.SEED_DEMO !== 'false' && await seedIfEmpty()) console.log('Empty database: loaded demo data (Alex and Mika).');
  app.listen(PORT, () => console.log(`Rentique running on :${PORT}`));
})().catch((e) => { console.error(e); process.exit(1); });

process.on('SIGTERM', () => pool.end().finally(() => process.exit(0)));
