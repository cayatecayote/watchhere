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

test('page strings exist in both languages with the same keys', async () => {
  const { pageStrings } = await import('../src/i18n.js');
  const en = pageStrings('en');
  const es = pageStrings('es');
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  assert.ok(Object.keys(en).length >= 20);
  assert.equal(es.page_title, 'Que arranque donde ya pagás.');
  assert.equal(en.page_title, 'Play it where you already pay.');
  assert.equal(es.page_up, 'Subir {s}');
  assert.equal(en.page_remove, 'Remove {s}');
  assert.equal(es.page_dropped, '{n} servicios no están en {country} y se quitaron.');
  assert.equal(en.page_nuvio, 'In Nuvio: Settings → Add-ons → paste the link.');
});

test('pageStrings falls back to English and hides non-page strings', async () => {
  const { pageStrings } = await import('../src/i18n.js');
  assert.deepEqual(pageStrings('fr'), pageStrings('en'));
  assert.equal('play' in pageStrings('en'), false);
});
