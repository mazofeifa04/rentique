// Fake demo data: 2 demo logins (Alex = renter, Mika = lender), 4 more lenders and 14 renters
// who cannot log in, 28 pieces and ~90 days of booking history.
const { pool, init, tx, dropAll } = require('./db');
const { hashPw } = require('./auth');

const TODAY = () => Math.floor(Date.now() / 864e5);
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const TILES = ['#FFD6E8', '#E4F9A6', '#D6D4FF', '#FFE0C7', '#E8DCFF', '#CDEBFF'];
const PAL = ['#FF3D8B', '#3A35FF', '#C9F53B', '#FF8A3D', '#9B6BFF'];

const OWNERS = [
  { key: 'l1', name: 'Mika Tanaka', email: 'mika@demo.rentique', closet: "Mika's Closet", city: 'Downtown', rating: 4.9, resp: '~10 min', since: 2023, hue: '#FF3D8B', demo: true, bio: 'Thrift flips, Y2K archives and one too many satin things. Happy to pin-free fit you over video.' },
  { key: 'l2', name: 'Jo Whitfield', email: 'jo@seed.rentique', closet: 'Jo Wears It Twice', city: 'Campus Row', rating: 4.8, resp: '~25 min', since: 2024, hue: '#C9F53B', bio: 'Fashion student. Everything here has a story and a stain-free record.' },
  { key: 'l3', name: 'Sol Ibarra', email: 'sol@seed.rentique', closet: 'Soft Launch', city: 'Eastside', rating: 4.7, resp: '~1 hr', since: 2024, hue: '#9B6BFF', bio: 'Pastels, babytees and bags that match your mood.' },
  { key: 'l4', name: 'Nadia Okoye', email: 'nadia@seed.rentique', closet: 'Velvet Hours', city: 'Harbor', rating: 5.0, resp: '~15 min', since: 2022, hue: '#FF8A3D', bio: 'Evening wear for people who start the night at 11.' },
  { key: 'l5', name: 'Ravi Menon', email: 'ravi@seed.rentique', closet: 'Back Row Vintage', city: 'Old Town', rating: 4.8, resp: '~40 min', since: 2025, hue: '#3A35FF', bio: 'Denim, leather and the good jackets.' },
];
const CUSTOMERS = ['Sam Ortiz', 'Priya Nair', 'Leo Park', 'Zoe Adler', 'Dani Cruz', 'Imani James', 'Theo Wright', 'Luna Kim', 'Marco Silva', 'Ava Brooks', 'Kai Moreno', 'Noor Haddad', 'Jules Ford', 'Ren Ito'];

const RAW = [
  ['Midnight Satin Slip', 'night', 'l1', 14, 40, '#1b1b2f', '#cfd3e6', 'stars', 'Bias-cut satin that catches every light in the room. Runs a little long, so heels or flats both work.'],
  ['Cherry Cola Mini', 'night', 'l2', 12, 30, '#e02c3a', '#f5ecd9', 'dots', 'Polka-dot babydoll with a tie back. Instant birthday-dinner dress.'],
  ['Disco Ball Sequin', 'night', 'l1', 22, 60, '#cfd3e6', '#ff3d8b', 'stars', 'Full sequin, fully lined. Heavy and loud in the best way.'],
  ['Lilac Lace Cami Dress', 'night', 'l3', 15, 45, '#cdb4ff', '#f5ecd9', 'grad', 'Soft ombre slip with lace trim. Pairs with a chunky jacket.'],
  ['Velvet Wine Wrap', 'night', 'l4', 18, 50, '#7a1233', '#1b1b2f', 'solid', 'Stretch velvet wrap dress. Wrinkle-proof and very dramatic.'],
  ['Cargo Parachute Pants', 'pants', 'l1', 10, 25, '#8fbf9f', '#1b1b2f', 'solid', 'Low-rise, drawstring hems, pockets that actually hold your phone.'],
  ['Wide Leg Pinstripe', 'pants', 'l2', 11, 30, '#1b1b2f', '#f5ecd9', 'stripes', 'Tailored wide legs with a high waist. Office-core or club-core.'],
  ['Cherry Checkered Flares', 'pants', 'l5', 9, 25, '#e02c3a', '#f5ecd9', 'checks', 'Flared and loud. A guaranteed compliment machine.'],
  ['Baby Blue Denim Baggy', 'pants', 'l3', 8, 20, '#9ed0ff', '#3f5f9a', 'solid', 'Extra baggy, perfectly faded. Fits like a size up.'],
  ['Chrome Vinyl Straight', 'pants', 'l4', 16, 45, '#cfd3e6', '#1b1b2f', 'grad', 'Shiny faux-vinyl straight leg. Wipe-clean, zero shame.'],
  ['Oversized Varsity', 'jackets', 'l1', 13, 40, '#2d3bff', '#f5ecd9', 'stripes', 'Wool-blend varsity with chenille patches. Sleeves cover your knuckles.'],
  ['Faux Fur Leopard Coat', 'jackets', 'l2', 20, 70, '#ff8a3d', '#4a2a22', 'dots', 'Big, fluffy, impossible to ignore. Hip length.'],
  ['Cropped Leather Moto', 'jackets', 'l5', 17, 55, '#1b1b2f', '#cfd3e6', 'solid', 'Real leather, broken in nicely. Cropped to the waist.'],
  ['Puffer in Bubblegum', 'jackets', 'l3', 14, 40, '#ff3d8b', '#cdb4ff', 'grad', 'Cropped puffer, warm enough for a bus stop at midnight.'],
  ['Satin Bomber', 'jackets', 'l1', 12, 35, '#c9f53b', '#1b1b2f', 'stripes', 'Reversible bomber with ribbed cuffs. Pure festival.'],
  ['Corset Top Cherry', 'tops', 'l4', 9, 25, '#e02c3a', '#1b1b2f', 'stripes', 'Structured boning, lace-up back. Size by ribcage, not by vibes.'],
  ['Mesh Butterfly Top', 'tops', 'l1', 8, 20, '#cdb4ff', '#ff3d8b', 'stars', 'Sheer long-sleeve with a butterfly print. Wear a bralette.'],
  ['Baby Tee Graphic', 'tops', 'l5', 6, 15, '#f5ecd9', '#2d3bff', 'dots', 'Soft cotton, cropped and tiny. A fit-check basic.'],
  ['Halter Chain Top', 'tops', 'l2', 10, 30, '#cfd3e6', '#1b1b2f', 'grad', 'Metal chain halter with an open back. Heavier than it looks.'],
  ['Knit Polo Crop', 'tops', 'l3', 7, 20, '#9ed0ff', '#f5ecd9', 'stripes', 'Retro striped polo knit with a cropped hem.'],
  ['Pleated Tennis Mini', 'skirts', 'l1', 8, 20, '#f5ecd9', '#2d3bff', 'checks', 'Pleated with built-in shorts. Move freely.'],
  ['Tulle Layer Maxi', 'skirts', 'l4', 16, 45, '#ff3d8b', '#cdb4ff', 'grad', 'Floor-length tulle with an elastic waist. Photographs like a dream.'],
  ['Denim Micro', 'skirts', 'l5', 7, 20, '#3f5f9a', '#9ed0ff', 'solid', 'Raw hem, low rise, very short. Bring a tote.'],
  ['Plaid School Skirt', 'skirts', 'l2', 8, 20, '#e02c3a', '#1b1b2f', 'checks', 'Kilt pin and all. Hits mid-thigh.'],
  ['Mini Baguette Bag', 'bags', 'l1', 7, 30, '#c9f53b', '#1b1b2f', 'solid', 'Fits a phone, card and one lip gloss. Chain strap.'],
  ['Rhinestone Clutch', 'bags', 'l3', 9, 35, '#cfd3e6', '#cdb4ff', 'stars', 'Hand-set rhinestones. Treat it like jewelry.'],
  ['Puffy Tote', 'bags', 'l4', 6, 20, '#ff8a3d', '#f5ecd9', 'grad', 'Quilted oversized tote. Laptop friendly.'],
  ['Croc Shoulder Bag', 'bags', 'l1', 10, 40, '#4a2a22', '#ff8a3d', 'solid', 'Glossy croc-embossed baguette with a gold clasp.'],
];
// Waiting in the moderation queue (no photos: the illustration is the fallback) and one rejected piece.
const REVIEW = [
  ['Leopard Slip Dress', 'night', 'l3', 16, 45, '#ff8a3d', '#4a2a22', 'dots', 'Silky leopard slip with an open back. Worn twice.', 'pending', null],
  ['Chain Link Belt Bag', 'bags', 'l1', 11, 40, '#cfd3e6', '#1b1b2f', 'solid', 'Silver chain strap, fits a phone and a card.', 'pending', null],
  ['Low-Rise Bootcut Jeans', 'pants', 'l5', 9, 25, '#3f5f9a', '#9ed0ff', 'stripes', 'Dark wash, stretchy, a true 2000s fit.', 'pending', null],
  ['Designer Handbag Replica', 'bags', 'l2', 45, 200, '#4a2a22', '#ff8a3d', 'solid', 'Looks just like the real thing.', 'rejected', 'We cannot list replica or counterfeit items. List only authentic pieces you own.'],
];
const SZ = ['XS', 'S', 'M', 'L', 'XL'];
const DOS = ['Send a fit pic, I love it', 'Steam it, never iron', 'Return it in the same bag', 'Message me about any snag early', 'Tag me if you post it'];
const DONTS = ['No smoking in it', 'No pins, hems or alterations', 'No self-tanner', 'No lending it on', 'Keep it away from red wine'];
const uniq = (a) => a.filter((v, j) => a.indexOf(v) === j);

async function seed() {
  const demoPw = process.env.DEMO_PASSWORD || 'demo1234';
  const demoHash = await hashPw(demoPw);
  const today = TODAY();

  await tx(async (c) => {
    const uid = {};
    const mk = async (key, name, email, o = {}) => {
      const { rows } = await c.query(
        `INSERT INTO users(email,name,pw,closet,city,bio,hue,rating,resp,is_demo,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10) RETURNING id`,
        [email, name, o.pw || 'no-login', o.closet || null, o.city || 'Near you', o.bio || 'Demo account.', o.hue || PAL[0], o.rating ?? null, o.resp || 'New lender', `${o.since || 2025}-03-01`]);
      uid[key] = rows[0].id;
    };
    for (const o of OWNERS) await mk(o.key, o.name, o.email, { ...o, pw: o.demo ? demoHash : 'no-login' });
    if (!process.env.ADMIN_EMAIL) await mk('admin', 'Super Admin', 'admin@demo.rentique', { pw: demoHash, closet: 'Rentique HQ', city: 'HQ', hue: '#16133F', bio: 'Demo super admin', since: 2022 });
    if (uid.admin) await c.query("UPDATE users SET role='admin' WHERE id=$1", [uid.admin]);
    await mk('alex', 'Alex Rivera', 'alex@demo.rentique', { pw: demoHash, hue: '#9B6BFF', since: 2025 });
    for (let i = 0; i < CUSTOMERS.length; i++) await mk('c' + i, CUSTOMERS[i], `renter${i}@seed.rentique`, { hue: PAL[i % 5] });

    // items
    const items = [];
    for (let i = 0; i < RAW.length; i++) {
      const x = RAW[i], r = rng(i * 31 + 7), o = OWNERS.find((o) => o.key === x[2]);
      const bag = x[1] === 'bags', s0 = (r() * 3) | 0, n = 2 + ((r() * 2) | 0);
      const rules = {
        min: r() < .3 ? 2 : 1, max: [3, 4, 5, 7][(r() * 4) | 0], late: [5, 8, 10][(r() * 3) | 0],
        pickup: o.city + ' pickup, or a courier for $4',
        cleaning: r() < .5 ? 'I dry-clean after every rental' : 'Return it as it is, I handle the cleaning',
        dos: uniq([DOS[(r() * 5) | 0], DOS[(r() * 5) | 0]]), donts: uniq([DONTS[(r() * 5) | 0], DONTS[(r() * 5) | 0]]),
      };
      const { rows } = await c.query(
        `INSERT INTO items(owner_id,name,cat,price,deposit,c1,c2,pat,descr,tile,sizes,rules)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [uid[x[2]], x[0], x[1], x[3], x[4], x[5], x[6], x[7], x[8], TILES[i % 6], bag ? ['One size'] : SZ.slice(s0, s0 + n), rules]);
      items.push({ id: rows[0].id, name: x[0], owner: x[2], rules, sizes: bag ? ['One size'] : SZ.slice(s0, s0 + n) });
    }

    for (const x of REVIEW) {
      const bag = x[1] === 'bags', i = items.length + 40, r = rng(i);
      await c.query(
        `INSERT INTO items(owner_id,name,cat,price,deposit,c1,c2,pat,descr,tile,sizes,rules,status,review_note,reviewed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [uid[x[2]], x[0], x[1], x[3], x[4], x[5], x[6], x[7], x[8], TILES[i % 6], bag ? ['One size'] : ['S', 'M'],
         { min: 1, max: 4, late: 8, pickup: OWNERS.find((o) => o.key === x[2]).city + ' pickup, or a courier for $4', cleaning: 'I handle the cleaning after every rental', dos: ['Steam it, never iron'], donts: ['No smoking in it'] },
         x[9], x[10], x[9] === 'rejected' ? new Date() : null]);
    }

    // booking history
    const booked = {}; // item id -> [[s,e]]
    const made = []; // every booking, to hang conversations on
    const add = async (it, cust, s, e, status, created) => {
      (booked[it.id] = booked[it.id] || []).push([s, e]);
      const { rows } = await c.query('INSERT INTO bookings(item_id,customer_id,start_day,end_day,status,size,created_day) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [it.id, cust, s, e, status, it.sizes[0], created]);
      made.push({ id: rows[0].id, item: it, cust, s, e, status, created });
      return rows[0].id;
    };
    for (let k = 0; k < items.length; k++) {
      const it = items[k], r = rng(it.id * 977 + 3), busy = it.owner === 'l1';
      let cur = today - 90 + ((r() * 4) | 0);
      while (cur < today + 35) {
        const len = Math.min(1 + ((r() * 5) | 0), it.rules.max), s = cur + 1 + ((r() * (busy ? 5 : 12)) | 0), e = s + len - 1;
        const cust = uid['c' + Math.floor(r() * r() * 14)];
        const st = e < today ? (r() < .06 ? 'cancelled' : 'completed') : s <= today ? 'confirmed' : (s > today + 2 && r() < .2 ? 'pending' : 'confirmed');
        await add(it, cust, s, e, st, s - 1 - Math.ceil(r() * 9));
        cur = e + 1;
      }
    }

    // Alex (demo renter): a few rentals + saved pieces. Moves forward until the dates are free.
    const freeAt = (it, s, len) => { for (;;) { const e = s + len - 1; if (!(booked[it.id] || []).some(([a, b]) => a <= e && b >= s)) return s; s++; } };
    const byName = (n) => items.find((i) => i.name === n);
    const alexBooks = [
      ['Cherry Cola Mini', -40, 2, 'completed'], ['Cropped Leather Moto', -21, 3, 'completed'], ['Velvet Wine Wrap', -9, 2, 'completed'],
      ['Puffer in Bubblegum', 6, 3, 'confirmed'], ['Satin Bomber', 9, 2, 'pending'],
    ];
    for (const [n, off, len, st] of alexBooks) {
      const it = byName(n), s = freeAt(it, today + off, len);
      await add(it, uid.alex, s, s + len - 1, st, Math.min(today, s - 4));
    }
    for (const n of ['Disco Ball Sequin', 'Velvet Wine Wrap', 'Oversized Varsity', 'Mini Baguette Bag'])
      await c.query('INSERT INTO saves(user_id,item_id) VALUES($1,$2)', [uid.alex, byName(n).id]);

    // ---- fake conversations: one thread per renter + lender pair, messages tied to each rental ----
    const nowS = Date.now() / 1000;
    const thread = async (renter, lender) => (await c.query('INSERT INTO threads(renter_id,lender_id) VALUES($1,$2) ON CONFLICT (renter_id,lender_id) DO UPDATE SET renter_id=EXCLUDED.renter_id RETURNING id', [renter, lender])).rows[0].id;
    const say = async (tid, from, booking, body, hoursAfterCreated, unread = false) => {
      const b = made.find((m) => m.id === booking), ts = Math.min(nowS - 60, (b.created * 86400) + 36000 + hoursAfterCreated * 3600);
      await c.query('INSERT INTO messages(thread_id,sender_id,booking_id,body,created_at,read_at) VALUES($1,$2,$3,$4,to_timestamp($5),$6)', [tid, from, booking, body, ts, unread ? null : new Date((ts + 1800) * 1000)]);
    };
    const ownerKey = (b) => OWNERS.find((o) => RAW.find((r) => r[0] === b.item.name)[2] === o.key).key;
    const alexB = (name) => made.find((m) => m.cust === uid.alex && m.item.name === name);

    let b = alexB('Satin Bomber'), t = await thread(uid.alex, uid.l1);
    await say(t, uid.alex, b.id, 'Hi Mika! Is the bomber really reversible? I want it for a festival on ' + new Date((b.s) * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + '.', 0);
    await say(t, uid.l1, b.id, 'Hey Alex! Yes, lime on one side and black on the other. Is pickup Downtown ok?', 2);
    await say(t, uid.alex, b.id, 'Perfect, I can grab it the day before.', 3);
    await say(t, uid.l1, b.id, 'Great! I will leave it with the front desk if I am out. Send me a pic when you wear it!', 5, true);
    b = alexB('Velvet Wine Wrap'); t = await thread(uid.alex, uid.l4);
    await say(t, uid.alex, b.id, 'Quick question: is the wrap fully lined?', 0);
    await say(t, uid.l4, b.id, 'Fully lined and stretchy, you will be comfortable all night.', 1);
    await say(t, uid.alex, b.id, 'Returned it today, thank you so much!', 60);
    await say(t, uid.l4, b.id, 'Got it, thanks Alex! Come back anytime.', 62);
    b = alexB('Puffer in Bubblegum'); t = await thread(uid.alex, uid.l3);
    await say(t, uid.l3, b.id, 'Confirmed! I will steam it before you pick it up.', 1);
    await say(t, uid.alex, b.id, 'Thank you!! Can I come by after 6?', 2, true);

    // a renter who came back to the same lender: both rentals live in the same conversation
    const pairs = {};
    made.filter((m) => m.cust !== uid.alex && m.status !== 'cancelled').forEach((m) => { (pairs[m.cust + ':' + ownerKey(m)] = pairs[m.cust + ':' + ownerKey(m)] || []).push(m); });
    const repeat = Object.entries(pairs).filter(([k, v]) => k.endsWith(':l1') && v.length >= 2).sort((a, b) => b[1].length - a[1].length)[0];
    if (repeat) {
      const [first, second] = repeat[1].sort((a, b) => a.s - b.s), tt = await thread(first.cust, uid.l1);
      await say(tt, first.cust, first.id, 'Can I pick it up a bit early on Friday?', 0);
      await say(tt, uid.l1, first.id, 'Sure, 5pm works for me.', 3);
      await say(tt, first.cust, second.id, 'Back for another one! Same pickup spot?', 0);
      await say(tt, uid.l1, second.id, 'Love that. Yes, same place. See you then!', 2);
      await say(tt, first.cust, second.id, 'Perfect, thank you! Could I keep it one extra day if nobody else booked it?', 30, true);
    }
    // a few more conversations so the admin has plenty to read
    const lines = [['Is it true to size?', 'Runs a little small, I would size up.'], ['Can you pin a hem?', 'No alterations, sorry, but it is adjustable at the waist.'], ['Thanks, returned!', 'Received, all good!']];
    let n = 0;
    for (const [k, v] of Object.entries(pairs)) {
      if (n >= 6 || k.endsWith(':l1')) continue;
      const m = v[0], tt = await thread(m.cust, uid[ownerKey(m)]), L = lines[n % 3];
      await say(tt, m.cust, m.id, L[0], 0); await say(tt, uid[ownerKey(m)], m.id, L[1], 4); n++;
    }
  });
}

async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n === 0) { await seed(); return true; }
  return false;
}

module.exports = { seed, seedIfEmpty };

if (require.main === module) {
  (async () => {
    await init();
    if (process.argv.includes('--reset')) { await dropAll(); await init(); }
    const did = await seedIfEmpty();
    console.log(did ? 'Seeded demo data.' : 'Database already has data. Use --reset to wipe and reseed.');
    await pool.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
