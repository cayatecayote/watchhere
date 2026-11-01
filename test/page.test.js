import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPage } from '../src/page.js';
import { COUNTRIES } from '../src/countries.js';
import { parseUserConfig } from '../src/userConfig.js';

const page = createPage();

/** The embedded JSON blob the page boots from. */
function blobOf(html) {
  const m = /<script type="application\/json" id="boot">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'boot blob present');
  return JSON.parse(m[1]);
}

test('renders a full HTML document in the asked language', () => {
  const es = page.render(null, 'es');
  assert.match(es, /^<!doctype html>/i);
  assert.match(es, /<html lang="es">/);
  assert.match(es, /Elegí tus servicios/);
  assert.match(es, /<h1[^>]*>Que arranque donde ya pagás\.<\/h1>/);

  const en = page.render(null, 'en');
  assert.match(en, /<html lang="en">/);
  assert.match(en, /Pick your services/);
  assert.match(en, /<h1[^>]*>Play it where you already pay\.<\/h1>/);
  assert.doesNotMatch(en, /<h1[^>]*>Que arranque/);
});

test('the user language wins over the asked language', () => {
  const user = parseUserConfig('ar-es-netflix');
  assert.match(page.render(user, 'en'), /<html lang="es">/);
});

test('pre-fills country, language and ordered services from the user config', () => {
  const user = parseUserConfig('ar-es-max,netflix');
  const blob = blobOf(page.render(user, 'es'));
  assert.deepEqual(
    { country: blob.country, lang: blob.lang, services: blob.services },
    { country: 'ar', lang: 'es', services: ['max', 'netflix'] },
  );
});

test('without a user config it starts on Argentina with nothing picked', () => {
  const blob = blobOf(page.render(null, 'en'));
  assert.deepEqual(
    { country: blob.country, lang: blob.lang, services: blob.services },
    { country: 'ar', lang: 'en', services: [] },
  );
});

test('the blob is valid JSON and cannot close the script tag', () => {
  // Hostile values never come out of parseUserConfig, but the page must not
  // rely on that: feed it a user object that bypasses the parser.
  const hostile = { country: 'ar', lang: 'es', services: ['</script><script>alert(1)</script>'] };
  const html = page.render(hostile, 'es');
  const blob = blobOf(html);
  assert.deepEqual(blob.services, hostile.services);
  const inner = /id="boot">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(!inner.includes('<'), 'every < in the blob is escaped');
  assert.equal((html.match(/<script/g) ?? []).length, 2, 'only the blob and the page script');
});

test('the blob carries both languages and the country list', () => {
  const blob = blobOf(page.render(null, 'es'));
  assert.equal(blob.strings.es.page_search, 'Buscar un servicio');
  assert.equal(blob.strings.en.page_search, 'Search a service');
  assert.deepEqual(blob.strings.es.page_up.includes('{s}'), true);
  assert.equal(blob.countries.length, COUNTRIES.length);
});

test('the page is self-contained: no external scripts, styles or fonts', () => {
  const html = page.render(null, 'en');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']?stylesheet/i);
  assert.doesNotMatch(html, /@import|fonts\.googleapis/i);
  assert.match(html, /prefers-reduced-motion/);
});

test('the page script knows the config segment format', () => {
  const html = page.render(null, 'en');
  assert.match(html, /\/api\/packages\?country=/);
  assert.match(html, /\/manifest\.json/);
  assert.match(html, /stremio:\/\//);
});

test('COUNTRIES has lowercase codes, both names, no duplicates, and the required markets', () => {
  const codes = COUNTRIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of COUNTRIES) {
    assert.match(c.code, /^[a-z]{2}$/);
    assert.ok(c.en && c.es);
  }
  const required = 'ar bo br cl co cr ec sv gt hn mx ni pa py pe do uy ve us ca es pt fr de it gb ie nl be at ch pl se no dk fi au nz jp kr in'.split(' ');
  for (const code of required) assert.ok(codes.includes(code), code);
});
