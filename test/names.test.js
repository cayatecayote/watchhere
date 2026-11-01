import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName } from '../src/names.js';

test('known JustWatch names get their short form', () => {
  assert.equal(displayName('Disney Plus'), 'Disney+');
  assert.equal(displayName('Amazon Prime Video'), 'Prime Video');
  assert.equal(displayName('Paramount Plus'), 'Paramount+');
});

test('other names come back unchanged, prototype keys included', () => {
  assert.equal(displayName('Netflix'), 'Netflix');
  assert.equal(displayName('constructor'), 'constructor');
  assert.equal(displayName('__proto__'), '__proto__');
  assert.equal(displayName('toString'), 'toString');
});
