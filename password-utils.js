const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(scryptCallback);
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const HASH_PATTERN = /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/i;

function isPasswordHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

async function hashPassword(password) {
  if (typeof password !== 'string') {
    throw new TypeError('A senha deve ser um texto.');
  }

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY
  });
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || !isPasswordHash(encodedHash)) return false;

  const [, , , , saltHex, hashHex] = encodedHash.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY
  });
  return timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword, isPasswordHash };
