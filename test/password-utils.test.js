const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, isPasswordHash } = require('../password-utils');

test('hashes are salted, verifiable, and do not contain the password', async () => {
  const password = 'example password';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(isPasswordHash(firstHash), true);
  assert.equal(firstHash.includes(password), false);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword('incorrect password', firstHash), false);
});

test('rejects malformed or unsupported hashes', async () => {
  assert.equal(isPasswordHash('plaintext'), false);
  assert.equal(await verifyPassword('password', 'plaintext'), false);
});
