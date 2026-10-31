import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n.js';

test('strings follow the language and fill variables', () => {
  assert.equal(t('en', 'play', { service: 'Netflix' }), 'Play on Netflix');
  assert.equal(t('es', 'play', { service: 'Netflix' }), 'Reproducir en Netflix');
  assert.equal(t('en', 'open', { service: 'X' }), 'Open X');
  assert.equal(t('es', 'open', { service: 'X' }), 'Abrir X');
});

test('unknown language falls back to English', () => {
  assert.equal(t('fr', 'play', { service: 'X' }), 'Play on X');
  assert.equal(t(undefined, 'open', { service: 'X' }), 'Open X');
});

test('unknown key returns the key itself', () => {
  assert.equal(t('en', 'nope'), 'nope');
});
