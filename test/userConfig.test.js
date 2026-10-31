import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserConfig, formatUserConfig } from '../src/userConfig.js';

test('parses country, lang and ordered services', () => {
  assert.deepEqual(parseUserConfig('ar-es-disneyplus,netflix,max'), {
    country: 'ar',
    lang: 'es',
    services: ['disneyplus', 'netflix', 'max'],
  });
});

test('removes duplicate services keeping the first', () => {
  assert.deepEqual(parseUserConfig('ar-en-max,netflix,max'), {
    country: 'ar',
    lang: 'en',
    services: ['max', 'netflix'],
  });
});

test('rejects anything else', () => {
  const tooMany = 'ar-es-' + Array.from({ length: 41 }, (_, i) => `s${i}`).join(',');
  for (const bad of ['', 'AR-es-netflix', 'ar-fr-netflix', 'ar-es-', 'ar-es-net flix', 'ar-es-a,,b', tooMany]) {
    assert.equal(parseUserConfig(bad), null, JSON.stringify(bad));
  }
});

test('accepts exactly 40 services', () => {
  const forty = 'ar-es-' + Array.from({ length: 40 }, (_, i) => `s${i}`).join(',');
  assert.equal(parseUserConfig(forty).services.length, 40);
});

test('rejects non-string input', () => {
  for (const bad of [undefined, null, 42, {}]) {
    assert.equal(parseUserConfig(bad), null);
  }
});

test('format is the inverse of parse', () => {
  const segment = 'ar-es-disneyplus,netflix,max';
  assert.equal(formatUserConfig(parseUserConfig(segment)), segment);
});
