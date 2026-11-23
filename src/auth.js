const crypto = require('crypto');

function hashPw(pw) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(pw, salt, 64, (err, key) => err ? reject(err) : resolve(`s1:${salt.toString('hex')}:${key.toString('hex')}`));
  });
}

function verifyPw(pw, stored) {
  return new Promise((resolve) => {
    const [v, saltHex, keyHex] = String(stored).split(':');
    if (v !== 's1' || !saltHex || !keyHex) return resolve(false); // accounts without a usable password (seed lenders/renters)
    crypto.scrypt(pw, Buffer.from(saltHex, 'hex'), 64, (err, key) => {
      if (err) return resolve(false);
      const want = Buffer.from(keyHex, 'hex');
      resolve(key.length === want.length && crypto.timingSafeEqual(key, want));
    });
  });
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

module.exports = { hashPw, verifyPw, sha, newToken };
