import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tvLink, buildLink, BUILDERS } from '../src/links.js';

test('tvLink unwraps an Android TV intent', () => {
  assert.equal(
    tvLink('intent://www.netflix.com/watch/80057281#Intent;launchFlags=0x00800000;scheme=https;package=com.netflix.ninja;end'),
    'https://www.netflix.com/watch/80057281',
  );
  assert.equal(
    tvLink('intent://play.hbomax.com/video/watch/abc?utm_source=universal_search#Intent;scheme=https;end'),
    'https://play.hbomax.com/video/watch/abc?utm_source=universal_search',
  );
});

test('tvLink passes http(s) through', () => {
  assert.equal(tvLink('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(tvLink('http://example.com/a'), 'http://example.com/a');
});

test('tvLink refuses non-http schemes', () => {
  assert.equal(tvLink('intent://x#Intent;scheme=nflx;end'), null);
  assert.equal(tvLink('nflx://x'), null);
  assert.equal(tvLink(null), null);
});

test('deep link is a play link', () => {
  assert.deepEqual(
    buildLink({
      monetizationType: 'flatrate',
      deeplinkURL: 'intent://www.disneyplus.com/play/x#Intent;scheme=https;end',
      standardWebURL: 'https://www.disneyplus.com/movies/x',
      package: { technicalName: 'disneyplus', clearName: 'Disney Plus' },
    }),
    { url: 'https://www.disneyplus.com/play/x', kind: 'play' },
  );
});

test('web link only is a page link', () => {
  assert.deepEqual(
    buildLink({
      monetizationType: 'flatrate',
      deeplinkURL: null,
      standardWebURL: 'https://www.play.movistar.com.ar/details/movie/1',
      package: { technicalName: 'movistarplus', clearName: 'Movistar Play' },
    }),
    { url: 'https://www.play.movistar.com.ar/details/movie/1', kind: 'page' },
  );
});

test('unusable deep link falls back to the web link', () => {
  assert.deepEqual(
    buildLink({ deeplinkURL: 'nflx://x', standardWebURL: 'https://example.com/p' }),
    { url: 'https://example.com/p', kind: 'page' },
  );
});

test('no usable link gives null', () => {
  assert.equal(buildLink({ deeplinkURL: null, standardWebURL: null }), null);
  assert.equal(buildLink({ deeplinkURL: 'nflx://x', standardWebURL: 'nflx://y' }), null);
});

test('BUILDERS is the ordered extension point', () => {
  assert.ok(Array.isArray(BUILDERS));
  assert.ok(BUILDERS.length >= 1);
});

test('tvLink decodes HTML entities in a passthrough URL (live Paramount+ case)', () => {
  assert.equal(
    tvLink(
      'https://www.paramountplus.com/shows/yellowstone/video/vPXPeC4posOemTL_KvmcbAPhi6j_s7_f/yellowstone-daybreak?searchReferral=&amp;utm_source=publisher',
    ),
    'https://www.paramountplus.com/shows/yellowstone/video/vPXPeC4posOemTL_KvmcbAPhi6j_s7_f/yellowstone-daybreak?searchReferral=&utm_source=publisher',
  );
  assert.equal(tvLink('https://x.test/a?b=1&#38;c=2&#x26;d=3&quot;&#39;&lt;&gt;'), 'https://x.test/a?b=1&c=2&d=3"\'<>');
});

test('tvLink decodes entities only once', () => {
  assert.equal(tvLink('https://x.test/a?b=1&amp;amp;c=2'), 'https://x.test/a?b=1&amp;c=2');
});

test('tvLink decodes entities in an unwrapped intent query', () => {
  assert.equal(
    tvLink('intent://www.paramountplus.com/shows/x?a=1&amp;b=2#Intent;scheme=https;end'),
    'https://www.paramountplus.com/shows/x?a=1&b=2',
  );
});

test('tvLink refuses a link with no host', () => {
  assert.equal(tvLink('intent://#Intent;scheme=https;end'), null);
  assert.equal(tvLink('https://'), null);
  assert.equal(tvLink('http:///path'), null);
  assert.equal(tvLink('intent:///path#Intent;scheme=https;end'), null);
});
