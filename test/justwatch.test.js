import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHttp } from '../src/http.js';
import { createCache } from '../src/cache.js';
import { createJustWatch } from '../src/justwatch.js';
import { createFakeFetch, gql, offer, titlesResponse } from './helpers/fakeFetch.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const lionKing = (imdbId, offers) => ({
  objectType: 'MOVIE',
  content: { title: 'The Lion King', externalIds: { imdbId } },
  offers,
});

function setup(handler, { delayMs, timeoutMs = 1000, now } = {}) {
  const fetchImpl = createFakeFetch(handler, { delayMs });
  const http = createHttp({ fetchImpl, timeoutMs });
  const cache = createCache(now ? { now } : {});
  const jw = createJustWatch({ http, cache });
  return { fetchImpl, jw, cache };
}

test('picks the result whose IMDb id matches, not the first', async () => {
  const { jw } = setup(() =>
    titlesResponse(
      lionKing('tt0110357', [offer('disneyplus')]),
      lionKing('tt6105098', [offer('netflix'), offer('max')]),
    ),
  );
  const title = await jw.findTitle({
    imdbId: 'tt6105098',
    objectType: 'MOVIE',
    terms: ['The Lion King'],
    country: 'AR',
  });
  assert.deepEqual(
    title.offers.map((o) => o.package.technicalName),
    ['netflix', 'max'],
  );
  assert.deepEqual(title.seasons, []);
});

test('tries the next search term when the first finds no match', async () => {
  const { jw, fetchImpl } = setup(({ body }) =>
    body.variables.filter.searchQuery === 'Der Konig der Lowen'
      ? titlesResponse(lionKing('tt0110357', [offer('disneyplus')]))
      : titlesResponse(lionKing('tt9999999', [offer('netflix')])),
  );
  const title = await jw.findTitle({
    imdbId: 'tt0110357',
    objectType: 'MOVIE',
    terms: ['The Lion King', 'Der Konig der Lowen'],
    country: 'AR',
  });
  assert.equal(title.offers[0].package.technicalName, 'disneyplus');
  assert.deepEqual(
    fetchImpl.calls.map((c) => c.body.variables.filter.searchQuery),
    ['The Lion King', 'Der Konig der Lowen'],
  );
});

test('sends first: 10, the object type filter and a POST to the JustWatch endpoint', async () => {
  const { jw, fetchImpl } = setup(() => titlesResponse());
  await jw.findTitle({ imdbId: 'tt1', objectType: 'SHOW', terms: ['x'], country: 'AR' });
  const [call] = fetchImpl.calls;
  assert.equal(call.url, 'https://apis.justwatch.com/graphql');
  assert.equal(call.method, 'POST');
  assert.deepEqual(call.body.variables, {
    country: 'AR',
    first: 10,
    filter: { searchQuery: 'x', objectTypes: ['SHOW'] },
  });
});

test('maps seasons and episodes with their offers and release date', async () => {
  const { jw } = setup(() => fixture('jw-bluey-show.json'));
  const title = await jw.findTitle({
    imdbId: 'tt7678620',
    objectType: 'SHOW',
    terms: ['Bluey'],
    country: 'AR',
  });
  assert.equal(title.offers[0].package.technicalName, 'disneyplus');
  assert.deepEqual(
    title.seasons.map((s) => [s.number, s.episodes.length]),
    [
      [1, 3],
      [2, 3],
    ],
  );
  const ep = title.seasons[1].episodes[2];
  assert.equal(ep.number, 3);
  assert.equal(ep.releaseDate, '2020-03-19');
  assert.match(ep.offers[0].deeplinkURL, /^intent:\/\/www\.disneyplus\.com\/play\/4e8e6891/);
  assert.equal(ep.offers[0].package.clearName, 'Disney Plus');
});

test('a missing release date maps to null and missing offers to an empty list', async () => {
  const { jw } = setup(() =>
    titlesResponse({
      objectType: 'SHOW',
      content: { externalIds: { imdbId: 'tt1' } },
      offers: null,
      seasons: [{ content: { seasonNumber: 1 }, episodes: [{ content: { episodeNumber: 1, originalReleaseDate: null }, offers: null }] }],
    }),
  );
  const title = await jw.findTitle({ imdbId: 'tt1', objectType: 'SHOW', terms: ['x'], country: 'AR' });
  assert.deepEqual(title.offers, []);
  assert.deepEqual(title.seasons, [{ number: 1, episodes: [{ number: 1, releaseDate: null, offers: [] }] }]);
});

test('caches a hit and a miss per country and type', async () => {
  const { jw, fetchImpl } = setup(({ body }) =>
    body.variables.filter.searchQuery === 'known'
      ? titlesResponse(lionKing('tt1', [offer('netflix')]))
      : titlesResponse(),
  );
  const hit = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['known'], country: 'AR' };
  const miss = { imdbId: 'tt2', objectType: 'MOVIE', terms: ['unknown'], country: 'AR' };

  await jw.findTitle(hit);
  await jw.findTitle(hit);
  assert.equal(fetchImpl.calls.length, 1);

  assert.equal(await jw.findTitle(miss), null);
  assert.equal(await jw.findTitle(miss), null);
  assert.equal(fetchImpl.calls.length, 2);

  await jw.findTitle({ ...hit, country: 'US' });
  assert.equal(fetchImpl.calls.length, 3);
  await jw.findTitle({ ...hit, objectType: 'SHOW' });
  assert.equal(fetchImpl.calls.length, 4);
});

test('hits live 12 hours and misses 3 hours', async () => {
  let t = 0;
  const { jw, fetchImpl } = setup(
    ({ body }) =>
      body.variables.filter.searchQuery === 'known'
        ? titlesResponse(lionKing('tt1', [offer('netflix')]))
        : titlesResponse(),
    { now: () => t },
  );
  const hit = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['known'], country: 'AR' };
  const miss = { imdbId: 'tt2', objectType: 'MOVIE', terms: ['unknown'], country: 'AR' };
  await jw.findTitle(hit);
  await jw.findTitle(miss);

  t = 3 * 3600e3 - 1;
  await jw.findTitle(hit);
  await jw.findTitle(miss);
  assert.equal(fetchImpl.calls.length, 2);

  t = 3 * 3600e3 + 1; // miss expired, hit still fresh
  await jw.findTitle(hit);
  await jw.findTitle(miss);
  assert.equal(fetchImpl.calls.length, 3);

  t = 12 * 3600e3 + 1;
  await jw.findTitle(hit);
  assert.equal(fetchImpl.calls.length, 4);
});

test('GraphQL errors and HTTP 503 throw', async () => {
  const args = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['x'], country: 'AR' };

  const gqlErr = setup(() => ({ errors: [{ message: 'Cannot query field "nope"' }], data: null }));
  await assert.rejects(gqlErr.jw.findTitle(args), /Cannot query field/);

  const http503 = setup(() => ({ status: 503, json: { error: 'down' } }));
  await assert.rejects(http503.jw.findTitle(args), /503/);

  const pk = setup(() => ({ errors: [{ message: 'boom' }] }));
  await assert.rejects(pk.jw.listPackages('AR'), /boom/);
});

test('a failed lookup is not cached', async () => {
  let fail = true;
  const { jw, fetchImpl } = setup(() => (fail ? { status: 503, json: {} } : titlesResponse()));
  const args = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['x'], country: 'AR' };
  await assert.rejects(jw.findTitle(args));
  fail = false;
  assert.equal(await jw.findTitle(args), null);
  assert.equal(fetchImpl.calls.length, 2);
});

test('request timeout throws', async () => {
  const { jw } = setup(() => titlesResponse(), { delayMs: 200, timeoutMs: 20 });
  await assert.rejects(
    jw.findTitle({ imdbId: 'tt1', objectType: 'MOVIE', terms: ['x'], country: 'AR' }),
    /timed out after 20ms/,
  );
});

test('sends the country upper-cased', async () => {
  const { jw, fetchImpl } = setup(({ body }) =>
    body.query.includes('packages(') ? gql({ packages: [] }) : titlesResponse(),
  );
  await jw.findTitle({ imdbId: 'tt1', objectType: 'MOVIE', terms: ['x'], country: 'ar' });
  await jw.listPackages('br');
  assert.equal(fetchImpl.calls[0].body.variables.country, 'AR');
  assert.equal(fetchImpl.calls[1].body.variables.country, 'BR');
});

test('listPackages keeps subscription and free services only', async () => {
  const { jw } = setup(() => fixture('jw-packages-ar.json'));
  assert.deepEqual(await jw.listPackages('AR'), [
    { id: 'netflix', name: 'Netflix' },
    { id: 'plutotv', name: 'Pluto TV' },
    { id: 'tubitv', name: 'Tubi TV' },
    { id: 'mubi', name: 'MUBI' },
  ]);
});

test('listPackages caches per country', async () => {
  const { jw, fetchImpl } = setup(() => fixture('jw-packages-ar.json'));
  await jw.listPackages('AR');
  await jw.listPackages('ar');
  assert.equal(fetchImpl.calls.length, 1);
  await jw.listPackages('BR');
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[0].body.query, /packages\(country: \$country, platform: WEB\)/);
});

// --- http and cache, the small layers underneath ---

test('createHttp getJson parses a 200 as a GET', async () => {
  const fetchImpl = createFakeFetch(() => ({ ok: 1 }));
  const http = createHttp({ fetchImpl, timeoutMs: 1000 });
  assert.deepEqual(await http.getJson('https://x.test/a'), { ok: 1 });
  assert.equal(fetchImpl.calls[0].method, 'GET');
});

test('createHttp turns a network failure into a readable error', async () => {
  const http = createHttp({
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
    timeoutMs: 1000,
  });
  await assert.rejects(http.getJson('https://x.test/a'), /https:\/\/x\.test\/a.*fetch failed/);
});

test('createCache returns undefined on a miss and keeps null and []', () => {
  let t = 0;
  const cache = createCache({ now: () => t });
  assert.equal(cache.get('k'), undefined);
  cache.set('n', null, 100);
  cache.set('e', [], 100);
  assert.equal(cache.get('n'), null);
  assert.deepEqual(cache.get('e'), []);
  t = 100;
  assert.equal(cache.get('n'), undefined);
  assert.equal(cache.get('e'), undefined);
});

test('createCache evicts the oldest entry past maxEntries', () => {
  const cache = createCache({ maxEntries: 2 });
  cache.set('a', 1, 1000);
  cache.set('b', 2, 1000);
  cache.set('c', 3, 1000);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
});
