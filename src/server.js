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
const DEMO_KEYS = { alex: 'alex@demo.rentique', mika: 'mika@demo.rentique', admin: 'admin@demo.rentique' };
const ITEM_STATUS = ['pending', 'approved', 'rejected'];
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
const ensureThread = async (c, renter, lender) => (await c.query('INSERT INTO threads(renter_id,lender_id) VALUES($1,$2) ON CONFLICT (renter_id,lender_id) DO UPDATE SET renter_id=EXCLUDED.renter_id RETURNING id', [renter, lender])).rows[0].id;
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
    req.user = rows[0] && !rows[0].suspended ? rows[0] : null; // suspended accounts are logged out everywhere
  }
  next();
}));
const need = (req) => { if (!req.user) throw new HttpError(401, 'Log in to do that'); return req.user; };
const isAdmin = (u) => !!u && u.role === 'admin';
const needAdmin = (req) => { const u = need(req); if (!isAdmin(u)) throw new HttpError(403, 'Super admin only'); return u; };

const userOut = (u) => u && { id: String(u.id), name: u.name, email: u.email, role: u.role, demo: u.is_demo && !!Object.values(DEMO_KEYS).includes(u.email) };
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
  const { rows } = await pool.query('SELECT id,pw,suspended FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  const ok = rows[0] && typeof pw === 'string' && await verifyPw(pw, rows[0].pw);
  if (!ok) throw new HttpError(401, 'Email or password does not match. Check them and try again.');
  if (rows[0].suspended) throw new HttpError(403, 'This account is suspended. Contact support.');
  await startSession(req, res, rows[0].id);
  res.json({ ok: true });
}));

app.post('/api/auth/demo', limit(30), wrap(async (req, res) => {
  if (!DEMO_LOGIN) throw new HttpError(404, 'Demo login is off');
  const email = DEMO_KEYS[req.body.who];
  if (!email) throw bad('Unknown demo user');
  const { rows } = await pool.query('SELECT id,suspended FROM users WHERE email=$1', [email]);
  if (!rows[0]) throw new HttpError(404, 'Demo user not found. Run the seed again.');
  if (rows[0].suspended) throw new HttpError(403, 'This account is suspended.');
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
const itemOut = (r, photos) => ({ id: String(r.id), name: r.name, cat: r.cat, owner: String(r.owner_id), price: r.price, deposit: r.deposit, c1: r.c1, c2: r.c2, pat: r.pat, desc: r.descr, tile: r.tile, sizes: r.sizes, live: r.live, rules: r.rules, status: r.status, reviewNote: r.review_note, submittedAt: r.submitted_at, photos: photos[r.id] || [] });

app.get('/api/bootstrap', wrap(async (req, res) => {
  const d = today(), uid = req.user ? req.user.id : 0, admin = isAdmin(req.user);
  // housekeeping: unanswered requests expire, finished rentals complete
  await pool.query(`UPDATE bookings SET status='cancelled' WHERE status='pending' AND start_day < $1`, [d]);
  await pool.query(`UPDATE bookings SET status='completed' WHERE status='confirmed' AND end_day < $1`, [d]);

  // Public sees approved + live pieces from active accounts. Owners also see their own (any status). Super admin sees everything.
  const items = (await pool.query(
    `SELECT i.* FROM items i JOIN users o ON o.id=i.owner_id
     WHERE NOT i.deleted AND ($2 OR (NOT o.suspended AND (i.owner_id=$1 OR (i.status='approved' AND i.live)))) ORDER BY i.id`, [uid, admin])).rows;
  const ids = items.map((i) => i.id);
  const photoRows = ids.length ? (await pool.query('SELECT id,item_id FROM photos WHERE item_id = ANY($1) ORDER BY item_id,pos,id', [ids])).rows : [];
  const photos = {};
  photoRows.forEach((p) => (photos[p.item_id] = photos[p.item_id] || []).push('/api/photos/' + p.id));

  const bks = ids.length ? (await pool.query(
    `SELECT b.*, i.owner_id FROM bookings b JOIN items i ON i.id=b.item_id
     WHERE b.item_id = ANY($1) AND ($3 OR b.status IN ('confirmed','pending','completed') OR b.customer_id=$2 OR i.owner_id=$2)
     ORDER BY b.id`, [ids, uid, admin])).rows : [];
  const bookings = bks.map((b) => {
    const mine = admin || b.customer_id === uid || b.owner_id === uid;
    return { id: String(b.id), item: String(b.item_id), cust: mine ? String(b.customer_id) : null, start: b.start_day, end: b.end_day, status: b.status, created: mine ? b.created_day : null, size: mine ? b.size : null };
  });

  const ownerIds = new Set(items.map((i) => i.owner_id));
  if (uid) ownerIds.add(uid);
  const custIds = new Set(bks.filter((b) => admin || b.customer_id === uid || b.owner_id === uid).map((b) => b.customer_id));
  const need = [...new Set([...ownerIds, ...custIds])];
  const urows = need.length ? (await pool.query('SELECT * FROM users WHERE id = ANY($1)', [need])).rows : [];
  const owners = {}, people = {};
  urows.forEach((u) => {
    if (ownerIds.has(u.id)) owners[u.id] = ownerOut(u);
    if (custIds.has(u.id)) people[u.id] = { id: String(u.id), name: u.name, hue: u.hue };
  });

  const saved = uid ? (await pool.query('SELECT item_id FROM saves WHERE user_id=$1', [uid])).rows.map((r) => String(r.item_id)) : [];
  const unread = uid && !admin ? (await pool.query(
    `SELECT count(*)::int AS n FROM messages m JOIN threads t ON t.id=m.thread_id
     WHERE (t.renter_id=$1 OR t.lender_id=$1) AND m.sender_id<>$1 AND m.read_at IS NULL`, [uid])).rows[0].n : 0;
  const pendingReview = admin ? (await pool.query(`SELECT count(*)::int AS n FROM items WHERE status='pending' AND NOT deleted`)).rows[0].n : 0;
  res.json({ user: userOut(req.user), demoLogin: DEMO_LOGIN, saved, owners, people, bookings, unread, pendingReview, items: items.map((r) => itemOut(r, photos)) });
}));

/* ---------- photos ---------- */
const REF = /^\/api\/photos\/(\d+)$/;
function decodePhotos(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 3) throw bad('You can add up to 3 photos.');
  return list.map((d) => {
    const ref = typeof d === 'string' && REF.exec(d);
    if (ref) return { ref: +ref[1] }; // an existing photo of this piece (edit and resubmit)
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
  const keep = [];
  for (const p of list) {
    if (p.ref) {
      const { rows } = await c.query('SELECT mime,data FROM photos WHERE id=$1 AND item_id=$2', [p.ref, itemId]);
      if (rows[0]) keep.push({ mime: rows[0].mime, buf: rows[0].data });
    } else keep.push(p);
  }
  await c.query('DELETE FROM photos WHERE item_id=$1', [itemId]);
  for (let i = 0; i < keep.length; i++) await c.query('INSERT INTO photos(item_id,pos,mime,data) VALUES($1,$2,$3,$4)', [itemId, i, keep[i].mime, keep[i].buf]);
};
app.get('/api/photos/:id', wrap(async (req, res) => {
  const id = int(req.params.id);
  if (Number.isNaN(id)) return res.sendStatus(404);
  const { rows } = await pool.query(
    `SELECT p.mime,p.data,i.status,i.owner_id,o.suspended FROM photos p JOIN items i ON i.id=p.item_id JOIN users o ON o.id=i.owner_id WHERE p.id=$1 AND NOT i.deleted`, [id]);
  const r = rows[0];
  if (!r) return res.sendStatus(404);
  const isPublic = r.status === 'approved' && !r.suspended;
  // photos of pieces still in review are only visible to the owner and the super admin
  if (!isPublic && !(req.user && (isAdmin(req.user) || req.user.id === r.owner_id))) return res.sendStatus(404);
  res.set({ 'Content-Type': r.mime, 'Cache-Control': isPublic ? 'public, max-age=31536000, immutable' : 'private, max-age=60' }).send(r.data);
}));

/* ---------- items ---------- */
function parseItem(b, city) {
  const name = str(b.name, 40, 1), cat = b.cat, pat = b.pat, price = int(b.price), deposit = int(b.deposit), max = int(b.max), late = int(b.late ?? 0);
  if (!name) throw bad('Give the piece a name (up to 40 characters).');
  if (!CATS.includes(cat) || !PATS.includes(pat)) throw bad('Pick a valid theme and pattern.');
  if (!(price >= 1 && price <= 500) || !(deposit >= 0 && deposit <= 500)) throw bad('Price must be $1 to $500 and deposit $0 to $500.');
  if (!(max >= 1 && max <= 30) || !(late >= 0 && late <= 500)) throw bad('Check the max days and late fee.');
  if (!hex(b.c1) || !hex(b.c2)) throw bad('Pick valid colors.');
  const sizes = Array.isArray(b.sizes) ? [...new Set(b.sizes.filter((s) => SIZES.includes(s)))] : [];
  if (!sizes.length) throw bad('Pick at least one size.');
  const list = (a, fb) => { const v = Array.isArray(a) ? a.map((x) => str(x, 60, 1)).filter(Boolean).slice(0, 4) : []; return v.length ? v : fb; };
  const rules = { min: 1, max, late, pickup: (city || 'Near you') + ' pickup, or a courier for $4', cleaning: 'I handle the cleaning after every rental', dos: list(b.dos, ['Message me about any snag early']), donts: list(b.donts, ['No pins, hems or alterations']) };
  return { name, cat, pat, price, deposit, sizes, rules, c1: b.c1, c2: b.c2, descr: str(b.desc, 200) || 'A fresh listing from a new closet.', photos: decodePhotos(b.photos) };
}

// New pieces always start in the review queue. Only the super admin makes them public.
app.post('/api/items', wrap(async (req, res) => {
  const u = need(req), f = parseItem(req.body, u.city), status = isAdmin(u) ? 'approved' : 'pending';
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO items(owner_id,name,cat,price,deposit,c1,c2,pat,descr,tile,sizes,rules,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
      [u.id, f.name, f.cat, f.price, f.deposit, f.c1, f.c2, f.pat, f.descr, TILES[Math.floor(Math.random() * 6)], f.sizes, f.rules, status]);
    await savePhotos(c, rows[0].id, f.photos);
    return rows[0].id;
  });
  res.json({ id: String(id), status });
}));

async function ownItem(req, id) {
  const u = need(req), n = int(id);
  if (Number.isNaN(n)) throw new HttpError(404, 'Not found');
  const { rows } = await pool.query('SELECT * FROM items WHERE id=$1 AND NOT deleted', [n]);
  if (!rows[0]) throw new HttpError(404, 'That piece no longer exists');
  if (rows[0].owner_id !== u.id) throw new HttpError(403, 'That is not your piece');
  return rows[0];
}
// Edit and resubmit: only for pieces that are waiting or were rejected. Goes back to the queue.
app.put('/api/items/:id', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id);
  if (it.status === 'approved') throw new HttpError(409, 'Approved pieces cannot be edited. You can change the price, pause or remove it, or list a new piece.');
  const f = parseItem(req.body, req.user.city);
  await tx(async (c) => {
    await c.query(`UPDATE items SET name=$2,cat=$3,price=$4,deposit=$5,c1=$6,c2=$7,pat=$8,descr=$9,sizes=$10,rules=$11,status='pending',review_note=NULL,reviewed_at=NULL,submitted_at=now() WHERE id=$1`,
      [it.id, f.name, f.cat, f.price, f.deposit, f.c1, f.c2, f.pat, f.descr, f.sizes, f.rules]);
    await savePhotos(c, it.id, f.photos);
  });
  res.json({ ok: true, status: 'pending' });
}));
app.patch('/api/items/:id', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id), b = req.body;
  if (it.status !== 'approved') throw new HttpError(409, 'This piece is still in review. Edit and resubmit it instead.');
  let price = it.price, live = it.live;
  if (b.price !== undefined) { price = int(b.price); if (!(price >= 1 && price <= 500)) throw bad('Price must be $1 to $500.'); }
  if (b.live !== undefined) live = !!b.live;
  await pool.query('UPDATE items SET price=$2, live=$3 WHERE id=$1', [it.id, price, live]);
  res.json({ ok: true });
}));
// Removing is always free: no approval needed.
const takeDown = async (id) => {
  await pool.query(`UPDATE items SET deleted=true, live=false WHERE id=$1`, [id]);
  await pool.query(`UPDATE bookings SET status='cancelled' WHERE item_id=$1 AND status IN ('pending','confirmed') AND end_day >= $2`, [id, today()]);
};
app.delete('/api/items/:id', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id);
  await takeDown(it.id);
  res.json({ ok: true });
}));
// New photos on a live piece are new content: the piece goes back to review until the admin approves them.
app.put('/api/items/:id/photos', wrap(async (req, res) => {
  const it = await ownItem(req, req.params.id), photos = decodePhotos(req.body.photos);
  await tx(async (c) => {
    await savePhotos(c, it.id, photos);
    if (it.status === 'approved' && !isAdmin(req.user)) await c.query(`UPDATE items SET status='pending', review_note='Photos changed, please review', reviewed_at=NULL, submitted_at=now() WHERE id=$1`, [it.id]);
    else if (it.status === 'rejected') await c.query(`UPDATE items SET status='pending', review_note=NULL, reviewed_at=NULL, submitted_at=now() WHERE id=$1`, [it.id]);
  });
  res.json({ ok: true, status: it.status === 'approved' && !isAdmin(req.user) ? 'pending' : it.status });
}));

/* ---------- bookings ---------- */
app.post('/api/bookings', wrap(async (req, res) => {
  const u = need(req), start = int(req.body.start), end = int(req.body.end), itemId = int(req.body.item), d = today();
  if ([start, end, itemId].some(Number.isNaN) || end < start || start < d - 1 || end - start > 60) throw bad('Pick valid dates.');
  const id = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [itemId]); // one booking at a time per item, so two people cannot take the same days
    const { rows } = await c.query(`SELECT i.* FROM items i JOIN users o ON o.id=i.owner_id WHERE i.id=$1 AND NOT i.deleted AND i.live AND i.status='approved' AND NOT o.suspended`, [itemId]);
    const it = rows[0];
    if (!it) throw new HttpError(404, 'That piece is not available');
    if (it.owner_id === u.id) throw bad("That's your own piece");
    const n = end - start + 1, r = it.rules;
    if (n < r.min || n > r.max) throw bad(`This lender allows ${r.min === r.max ? r.min : r.min + ' to ' + r.max} days per rental.`);
    const size = typeof req.body.size === 'string' && it.sizes.includes(req.body.size) ? req.body.size : it.sizes[0];
    const clash = await c.query(`SELECT 1 FROM bookings WHERE item_id=$1 AND status IN ('pending','confirmed') AND start_day<=$3 AND end_day>=$2 LIMIT 1`, [itemId, start, end]);
    if (clash.rowCount) throw new HttpError(409, 'Someone just took some of those days. Pick other dates.');
    const ins = await c.query(`INSERT INTO bookings(item_id,customer_id,start_day,end_day,status,size,created_day) VALUES($1,$2,$3,$4,'pending',$5,$6) RETURNING id`, [itemId, u.id, start, end, size, d]);
    // every rental opens (or reuses) the conversation between this renter and this lender
    const tid = await ensureThread(c, u.id, it.owner_id);
    const msg = str(req.body.message, 1000, 1);
    if (msg) await c.query('INSERT INTO messages(thread_id,sender_id,booking_id,body) VALUES($1,$2,$3,$4)', [tid, u.id, ins.rows[0].id, msg]);
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

/* ---------- chat: one conversation per renter + lender pair, grouped by rental ---------- */
const bookingLine = (b) => ({ id: String(b.id), item: { id: String(b.item_id), name: b.item_name }, start: b.start_day, end: b.end_day, status: b.status });
async function threadAccess(req, id) {
  const u = need(req), n = int(id);
  if (Number.isNaN(n)) throw new HttpError(404, 'Not found');
  const { rows } = await pool.query(
    `SELECT t.*, r.name AS renter_name, r.hue AS renter_hue, l.name AS lender_name, l.hue AS lender_hue, COALESCE(l.closet, split_part(l.name,' ',1) || chr(39) || 's Closet') AS lender_closet
     FROM threads t JOIN users r ON r.id=t.renter_id JOIN users l ON l.id=t.lender_id WHERE t.id=$1`, [n]);
  const t = rows[0];
  if (!t) throw new HttpError(404, 'Conversation not found');
  const role = t.renter_id === u.id ? 'renter' : t.lender_id === u.id ? 'lender' : isAdmin(u) ? 'admin' : null;
  if (!role) throw new HttpError(404, 'Conversation not found'); // same answer as "missing" so ids cannot be probed
  return { u, t, role };
}
async function threadDetail(t, role, uid) {
  const [msgs, bks] = await Promise.all([
    pool.query('SELECT id,sender_id,booking_id,body,created_at FROM messages WHERE thread_id=$1 ORDER BY id', [t.id]),
    pool.query(`SELECT b.*, i.name AS item_name FROM bookings b JOIN items i ON i.id=b.item_id WHERE b.customer_id=$1 AND i.owner_id=$2 ORDER BY b.id`, [t.renter_id, t.lender_id]),
  ]);
  if (role !== 'admin') await pool.query('UPDATE messages SET read_at=now() WHERE thread_id=$1 AND sender_id<>$2 AND read_at IS NULL', [t.id, uid]);
  return {
    thread: { id: String(t.id), you: role, renter: { id: String(t.renter_id), name: t.renter_name, hue: t.renter_hue }, lender: { id: String(t.lender_id), name: t.lender_name, hue: t.lender_hue, closet: t.lender_closet } },
    messages: msgs.rows.map((m) => ({ id: String(m.id), from: String(m.sender_id), body: m.body, at: m.created_at, booking: m.booking_id ? String(m.booking_id) : null })),
    bookings: bks.rows.map(bookingLine),
  };
}
app.get('/api/threads', wrap(async (req, res) => {
  const u = need(req);
  const { rows } = await pool.query(
    `SELECT t.id, t.renter_id, t.lender_id, t.created_at,
       r.name AS renter_name, r.hue AS renter_hue, l.name AS lender_name, l.hue AS lender_hue, COALESCE(l.closet, split_part(l.name,' ',1) || chr(39) || 's Closet') AS lender_closet,
       (SELECT body FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       (SELECT created_at FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_at,
       (SELECT sender_id FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_from,
       (SELECT count(*)::int FROM messages m WHERE m.thread_id=t.id AND m.sender_id<>$1 AND m.read_at IS NULL) AS unread
     FROM threads t JOIN users r ON r.id=t.renter_id JOIN users l ON l.id=t.lender_id
     WHERE t.renter_id=$1 OR t.lender_id=$1 ORDER BY COALESCE((SELECT max(created_at) FROM messages m WHERE m.thread_id=t.id), t.created_at) DESC`, [u.id]);
  res.json(rows.map((r) => {
    const asRenter = r.renter_id === u.id;
    return { id: String(r.id), you: asRenter ? 'renter' : 'lender', other: asRenter ? { id: String(r.lender_id), name: r.lender_name, hue: r.lender_hue, closet: r.lender_closet } : { id: String(r.renter_id), name: r.renter_name, hue: r.renter_hue },
      lastBody: r.last_body, lastAt: r.last_at || r.created_at, lastFromMe: r.last_from === u.id, unread: r.unread };
  }));
}));
app.get('/api/threads/for-booking/:id', wrap(async (req, res) => {
  const u = need(req), n = int(req.params.id);
  const { rows } = await pool.query('SELECT b.customer_id, i.owner_id FROM bookings b JOIN items i ON i.id=b.item_id WHERE b.id=$1', [n]);
  const b = rows[0];
  if (!b || (b.customer_id !== u.id && b.owner_id !== u.id && !isAdmin(u))) throw new HttpError(404, 'Not found');
  const t = await pool.query('SELECT id FROM threads WHERE renter_id=$1 AND lender_id=$2', [b.customer_id, b.owner_id]);
  if (!t.rows[0]) throw new HttpError(404, 'No conversation yet');
  res.json({ id: String(t.rows[0].id) });
}));
app.get('/api/threads/:id', wrap(async (req, res) => {
  const { u, t, role } = await threadAccess(req, req.params.id);
  res.json(await threadDetail(t, role, u.id));
}));
app.post('/api/threads/:id/messages', limit(60), wrap(async (req, res) => {
  const { u, t, role } = await threadAccess(req, req.params.id);
  if (role === 'admin') throw new HttpError(403, 'Super admins can read conversations but not post in them.');
  const body = str(req.body.body, 1000, 1);
  if (!body) throw bad('Write a message (up to 1000 characters).');
  const mine = (await pool.query('SELECT b.id FROM bookings b JOIN items i ON i.id=b.item_id WHERE b.customer_id=$1 AND i.owner_id=$2 ORDER BY b.id DESC', [t.renter_id, t.lender_id])).rows.map((r) => r.id);
  let booking = req.body.booking === undefined || req.body.booking === null ? (mine[0] || null) : int(req.body.booking);
  if (booking !== null && !mine.includes(booking)) throw bad('That rental is not part of this conversation.');
  const { rows } = await pool.query('INSERT INTO messages(thread_id,sender_id,booking_id,body) VALUES($1,$2,$3,$4) RETURNING id', [t.id, u.id, booking, body]);
  res.json({ id: String(rows[0].id) });
}));

/* ---------- super admin ---------- */
app.get('/api/admin/users', wrap(async (req, res) => {
  needAdmin(req);
  const { rows } = await pool.query(
    `SELECT u.id,u.email,u.name,u.role,u.suspended,u.created_at,u.closet,u.city,
       (SELECT count(*)::int FROM bookings b WHERE b.customer_id=u.id) AS rentals,
       (SELECT count(*)::int FROM items i WHERE i.owner_id=u.id AND NOT i.deleted) AS pieces,
       (SELECT count(*)::int FROM items i WHERE i.owner_id=u.id AND NOT i.deleted AND i.status='approved') AS approved,
       (SELECT count(*)::int FROM items i WHERE i.owner_id=u.id AND NOT i.deleted AND i.status='pending') AS pending,
       (SELECT count(*)::int FROM bookings b JOIN items i ON i.id=b.item_id WHERE i.owner_id=u.id) AS received
     FROM users u ORDER BY u.id`);
  res.json(rows.map((u) => ({ id: String(u.id), email: u.email, name: u.name, role: u.role, suspended: u.suspended, joined: u.created_at, closet: u.closet, city: u.city, rentals: u.rentals, pieces: u.pieces, approved: u.approved, pending: u.pending, received: u.received })));
}));
app.get('/api/admin/users/:id', wrap(async (req, res) => {
  needAdmin(req);
  const n = int(req.params.id);
  const u = (await pool.query('SELECT id,email,name,role,suspended,created_at,closet,city,bio FROM users WHERE id=$1', [n])).rows[0];
  if (!u) throw new HttpError(404, 'User not found');
  const [rentals, pieces, threads] = await Promise.all([
    pool.query(`SELECT b.id,b.start_day,b.end_day,b.status,i.name AS item_name,l.name AS lender_name FROM bookings b JOIN items i ON i.id=b.item_id JOIN users l ON l.id=i.owner_id WHERE b.customer_id=$1 ORDER BY b.id DESC LIMIT 50`, [n]),
    pool.query(`SELECT id,name,status,price,live,review_note FROM items WHERE owner_id=$1 AND NOT deleted ORDER BY id DESC`, [n]),
    pool.query(`SELECT t.id, r.name AS renter, l.name AS lender FROM threads t JOIN users r ON r.id=t.renter_id JOIN users l ON l.id=t.lender_id WHERE t.renter_id=$1 OR t.lender_id=$1 ORDER BY t.id DESC`, [n]),
  ]);
  res.json({ user: { id: String(u.id), email: u.email, name: u.name, role: u.role, suspended: u.suspended, joined: u.created_at, closet: u.closet, city: u.city, bio: u.bio },
    rentals: rentals.rows.map((r) => ({ id: String(r.id), item: r.item_name, lender: r.lender_name, start: r.start_day, end: r.end_day, status: r.status })),
    pieces: pieces.rows.map((p) => ({ id: String(p.id), name: p.name, status: p.status, price: p.price, live: p.live, note: p.review_note })),
    threads: threads.rows.map((t) => ({ id: String(t.id), renter: t.renter, lender: t.lender })) });
}));
app.post('/api/admin/users/:id/suspend', wrap(async (req, res) => {
  const a = needAdmin(req), n = int(req.params.id), on = !!req.body.suspended;
  const u = (await pool.query('SELECT id,role FROM users WHERE id=$1', [n])).rows[0];
  if (!u) throw new HttpError(404, 'User not found');
  if (u.role === 'admin' || u.id === a.id) throw new HttpError(403, 'You cannot suspend a super admin.');
  await pool.query('UPDATE users SET suspended=$2 WHERE id=$1', [n, on]);
  if (on) await pool.query('DELETE FROM sessions WHERE user_id=$1', [n]);
  res.json({ ok: true });
}));
app.post('/api/admin/items/:id/review', wrap(async (req, res) => {
  needAdmin(req);
  const n = int(req.params.id), decision = req.body.decision, note = str(req.body.note, 400, 0) || '';
  if (!['approve', 'reject'].includes(decision)) throw bad('Decision must be approve or reject.');
  if (decision === 'reject' && note.length < 3) throw bad('Tell the lender why it was rejected so they can fix it.');
  const { rows } = await pool.query('SELECT id,status FROM items WHERE id=$1 AND NOT deleted', [n]);
  if (!rows[0]) throw new HttpError(404, 'That piece no longer exists');
  if (rows[0].status !== 'pending') throw new HttpError(409, 'This piece was already reviewed.');
  await pool.query('UPDATE items SET status=$2, review_note=$3, reviewed_at=now(), live=CASE WHEN $2=\'approved\' THEN true ELSE live END WHERE id=$1', [n, decision === 'approve' ? 'approved' : 'rejected', note || null]);
  res.json({ ok: true });
}));
app.delete('/api/admin/items/:id', wrap(async (req, res) => {
  needAdmin(req);
  const n = int(req.params.id);
  if (Number.isNaN(n)) throw new HttpError(404, 'Not found');
  await takeDown(n);
  res.json({ ok: true });
}));
app.get('/api/admin/threads', wrap(async (req, res) => {
  needAdmin(req);
  const { rows } = await pool.query(
    `SELECT t.id, t.renter_id, t.lender_id, r.name AS renter_name, r.hue AS renter_hue, l.name AS lender_name, l.hue AS lender_hue, COALESCE(l.closet, split_part(l.name,' ',1) || chr(39) || 's Closet') AS lender_closet,
       (SELECT count(*)::int FROM messages m WHERE m.thread_id=t.id) AS messages,
       (SELECT count(*)::int FROM bookings b JOIN items i ON i.id=b.item_id WHERE b.customer_id=t.renter_id AND i.owner_id=t.lender_id) AS rentals,
       (SELECT body FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       COALESCE((SELECT max(created_at) FROM messages m WHERE m.thread_id=t.id), t.created_at) AS last_at
     FROM threads t JOIN users r ON r.id=t.renter_id JOIN users l ON l.id=t.lender_id ORDER BY last_at DESC`);
  res.json(rows.map((r) => ({ id: String(r.id), renter: { id: String(r.renter_id), name: r.renter_name, hue: r.renter_hue }, lender: { id: String(r.lender_id), name: r.lender_name, hue: r.lender_hue, closet: r.lender_closet }, messages: r.messages, rentals: r.rentals, lastBody: r.last_body, lastAt: r.last_at })));
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
// The super admin comes from ADMIN_EMAIL + ADMIN_PASSWORD (created, or promoted if the email already has an account).
// With no ADMIN_EMAIL and demo data on, a demo admin (admin@demo.rentique) is created so the view can be explored.
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD;
  if (email) {
    const r = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (r.rows[0]) { await pool.query(`UPDATE users SET role='admin', suspended=false WHERE id=$1`, [r.rows[0].id]); return; }
    if (!pw || pw.length < 8) throw new Error('ADMIN_PASSWORD (at least 8 characters) is required to create the super admin');
    await pool.query(`INSERT INTO users(email,name,pw,role,city,closet,bio) VALUES($1,'Super Admin',$2,'admin','HQ','Rentique HQ','Platform administration')`, [email, await hashPw(pw)]);
    console.log('Created super admin ' + email);
  } else if (process.env.SEED_DEMO !== 'false') {
    const r = await pool.query(`SELECT 1 FROM users WHERE role='admin' LIMIT 1`);
    if (!r.rowCount) {
      await pool.query(`INSERT INTO users(email,name,pw,role,city,closet,bio,is_demo) VALUES('admin@demo.rentique','Super Admin',$1,'admin','HQ','Rentique HQ','Demo super admin',true)`, [await hashPw(process.env.DEMO_PASSWORD || 'demo1234')]);
      console.log('Created demo super admin admin@demo.rentique');
    }
  }
}

(async () => {
  for (let i = 1; ; i++) {
    try { await init(); break; }
    catch (e) { if (i >= 30) throw e; console.log(`Waiting for the database (${i}/30): ${e.code || e.message}`); await new Promise((r) => setTimeout(r, 2000)); }
  }
  if (process.env.SEED_DEMO !== 'false' && await seedIfEmpty()) console.log('Empty database: loaded demo data (Alex and Mika).');
  await ensureAdmin();
  app.listen(PORT, () => console.log(`Rentique running on :${PORT}`));
})().catch((e) => { console.error(e); process.exit(1); });

process.on('SIGTERM', () => pool.end().finally(() => process.exit(0)));
