import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHttp } from '../src/http.js';
import { createCache } from '../src/cache.js';
import { createJustWatch } from '../src/justwatch.js';
import { createFakeFetch, createFakeJustWatch, gql, offer, titlesResponse } from './helpers/fakeFetch.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const lionKing = (id, imdbId, offers, extra = {}) => ({
  id,
  imdbId,
  objectType: 'MOVIE',
  detail: { offers },
  ...extra,
});

const FAILURE_TTL = 2 * 60e3;

const searchCalls = (fetchImpl) => fetchImpl.calls.filter((c) => c.body.query.includes('popularTitles'));
const detailCalls = (fetchImpl) => fetchImpl.calls.filter((c) => c.body.query.includes('node(id'));

function setup(handler, { delayMs, timeoutMs = 1000, now } = {}) {
  const fetchImpl = createFakeFetch(handler, { delayMs });
  const http = createHttp({ fetchImpl, timeoutMs });
  const cache = createCache(now ? { now } : {});
  const jw = createJustWatch({ http, cache, ...(now ? { now } : {}) });
  return { fetchImpl, jw, cache };
}

test('picks the result whose IMDb id matches, not the first', async () => {
  const { jw } = setup(
    createFakeJustWatch([
      lionKing('tm1', 'tt0110357', [offer('disneyplus')]),
      lionKing('tm2', 'tt6105098', [offer('netflix'), offer('max')]),
    ]),
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

test('the detail query is only sent for the matched node id', async () => {
  const { jw, fetchImpl } = setup(
    createFakeJustWatch([
      lionKing('tm1', 'tt0110357', [offer('disneyplus')]),
      lionKing('tm2', 'tt6105098', [offer('netflix')]),
    ]),
  );
  await jw.findTitle({ imdbId: 'tt6105098', objectType: 'MOVIE', terms: ['The Lion King'], country: 'ar' });
  assert.equal(searchCalls(fetchImpl).length, 1);
  const details = detailCalls(fetchImpl);
  assert.equal(details.length, 1);
  assert.deepEqual(details[0].body.variables, { id: 'tm2', country: 'AR' });
  assert.equal(details[0].url, 'https://apis.justwatch.com/graphql');
  assert.equal(details[0].method, 'POST');
});

test('the search stays light: no offers, seasons or episodes', async () => {
  const { jw, fetchImpl } = setup(createFakeJustWatch([]));
  await jw.findTitle({ imdbId: 'tt1', objectType: 'SHOW', terms: ['x'], country: 'AR' });
  const { query } = searchCalls(fetchImpl)[0].body;
  assert.doesNotMatch(query, /offers|seasons|episodes/);
  assert.match(query, /\bid\b/);
});

test('a miss sends no detail request', async () => {
  const { jw, fetchImpl } = setup(createFakeJustWatch([lionKing('tm1', 'tt9999999', [offer('netflix')])]));
  const title = await jw.findTitle({ imdbId: 'tt1', objectType: 'MOVIE', terms: ['a', 'b'], country: 'AR' });
  assert.equal(title, null);
  assert.equal(searchCalls(fetchImpl).length, 2);
  assert.equal(detailCalls(fetchImpl).length, 0);
});

test('tries the next search term when the first finds no match', async () => {
  const { jw, fetchImpl } = setup(
    createFakeJustWatch([
      lionKing('tm9', 'tt9999999', [offer('netflix')], { terms: ['The Lion King'] }),
      lionKing('tm1', 'tt0110357', [offer('disneyplus')], { terms: ['Der Konig der Lowen'] }),
    ]),
  );
  const title = await jw.findTitle({
    imdbId: 'tt0110357',
    objectType: 'MOVIE',
    terms: ['The Lion King', 'Der Konig der Lowen'],
    country: 'AR',
  });
  assert.equal(title.offers[0].package.technicalName, 'disneyplus');
  assert.deepEqual(
    searchCalls(fetchImpl).map((c) => c.body.variables.filter.searchQuery),
    ['The Lion King', 'Der Konig der Lowen'],
  );
  assert.equal(detailCalls(fetchImpl).length, 1);
});

test('the search sends first: 10, the object type filter and a POST to the JustWatch endpoint', async () => {
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
  const { jw } = setup(({ body }) =>
    body.query.includes('popularTitles') ? fixture('jw-search-bluey.json') : fixture('jw-detail-bluey.json'),
  );
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

test('the detail request asks for the matched Bluey node by id', async () => {
  const { jw, fetchImpl } = setup(({ body }) =>
    body.query.includes('popularTitles') ? fixture('jw-search-bluey.json') : fixture('jw-detail-bluey.json'),
  );
  await jw.findTitle({ imdbId: 'tt7678620', objectType: 'SHOW', terms: ['Bluey'], country: 'AR' });
  assert.deepEqual(detailCalls(fetchImpl).map((c) => c.body.variables.id), ['ts84270']);
  assert.match(detailCalls(fetchImpl)[0].body.query, /\.\.\. on MovieOrShow/);
  assert.match(detailCalls(fetchImpl)[0].body.query, /\.\.\. on Show/);
});

test('a missing release date maps to null and missing offers to an empty list', async () => {
  const { jw } = setup(
    createFakeJustWatch([
      {
        id: 'ts1',
        imdbId: 'tt1',
        objectType: 'SHOW',
        detail: {
          offers: null,
          seasons: [
            { content: { seasonNumber: 1 }, episodes: [{ content: { episodeNumber: 1, originalReleaseDate: null }, offers: null }] },
          ],
        },
      },
    ]),
  );
  const title = await jw.findTitle({ imdbId: 'tt1', objectType: 'SHOW', terms: ['x'], country: 'AR' });
  assert.deepEqual(title.offers, []);
  assert.deepEqual(title.seasons, [{ number: 1, episodes: [{ number: 1, releaseDate: null, offers: [] }] }]);
});

test('caches a hit and a miss per country and type', async () => {
  const { jw, fetchImpl } = setup(
    createFakeJustWatch([lionKing('tm1', 'tt1', [offer('netflix')], { terms: ['known'] })]),
  );
  const hit = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['known'], country: 'AR' };
  const miss = { imdbId: 'tt2', objectType: 'MOVIE', terms: ['unknown'], country: 'AR' };

  await jw.findTitle(hit);
  await jw.findTitle(hit);
  assert.equal(fetchImpl.calls.length, 2); // search + detail, once

  assert.equal(await jw.findTitle(miss), null);
  assert.equal(await jw.findTitle(miss), null);
  assert.equal(fetchImpl.calls.length, 3);

  await jw.findTitle({ ...hit, country: 'US' });
  assert.equal(fetchImpl.calls.length, 5);
  await jw.findTitle({ ...hit, objectType: 'SHOW' });
  assert.equal(fetchImpl.calls.length, 7);
});

test('hits live 12 hours and misses 3 hours', async () => {
  let t = 0;
  const { jw, fetchImpl } = setup(
    createFakeJustWatch([lionKing('tm1', 'tt1', [offer('netflix')], { terms: ['known'] })]),
    { now: () => t },
  );
  const hit = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['known'], country: 'AR' };
  const miss = { imdbId: 'tt2', objectType: 'MOVIE', terms: ['unknown'], country: 'AR' };
  await jw.findTitle(hit);
  await jw.findTitle(miss);
  assert.equal(fetchImpl.calls.length, 3);

  t = 3 * 3600e3 - 1;
  await jw.findTitle(hit);
  await jw.findTitle(miss);
  assert.equal(fetchImpl.calls.length, 3);

  t = 3 * 3600e3 + 1; // miss expired, hit still fresh
  await jw.findTitle(hit);
  await jw.findTitle(miss);
  assert.equal(fetchImpl.calls.length, 4);

  t = 12 * 3600e3 + 1;
  await jw.findTitle(hit);
  assert.equal(fetchImpl.calls.length, 6);
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

test('a GraphQL error in the detail step throws and is not cached as a hit', async () => {
  let fail = true;
  let t = 0;
  const world = createFakeJustWatch([lionKing('tm1', 'tt1', [offer('netflix')])]);
  const { jw, fetchImpl } = setup(
    (req) =>
      fail && req.body.query.includes('node(id')
        ? { errors: [{ message: 'complexity 668450 exceeds 350000' }] }
        : world(req),
    { now: () => t },
  );
  const args = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['x'], country: 'AR' };
  await assert.rejects(jw.findTitle(args), /complexity/);
  fail = false;
  t = FAILURE_TTL + 1;
  const title = await jw.findTitle(args);
  assert.equal(title.offers[0].package.technicalName, 'netflix');
  assert.equal(fetchImpl.calls.length, 4);
});

test('a failed lookup is not cached as a hit or a miss', async () => {
  let fail = true;
  let t = 0;
  const { jw, fetchImpl } = setup(() => (fail ? { status: 503, json: {} } : titlesResponse()), { now: () => t });
  const args = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['x'], country: 'AR' };
  await assert.rejects(jw.findTitle(args));
  fail = false;
  t = FAILURE_TTL + 1;
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
    { id: 'netflix', name: 'Netflix', icon: 'https://images.justwatch.com/icon/207360008/s100/netflix.png' },
    { id: 'plutotv', name: 'Pluto TV', icon: 'https://images.justwatch.com/icon/1/s100/plutotv.png' },
    { id: 'tubitv', name: 'Tubi TV', icon: null },
    { id: 'mubi', name: 'MUBI', icon: null },
  ]);
});

test('listPackages names services the way the stream rows do', async () => {
  const { jw } = setup(() => ({
    data: {
      packages: [
        { technicalName: 'disneyplus', clearName: 'Disney Plus', monetizationTypes: ['FLATRATE'], icon: null },
        { technicalName: 'amazonprimevideo', clearName: 'Amazon Prime Video', monetizationTypes: ['FLATRATE'], icon: null },
        { technicalName: 'paramountplus', clearName: 'Paramount Plus', monetizationTypes: ['FLATRATE'], icon: null },
      ],
    },
  }));
  assert.deepEqual((await jw.listPackages('AR')).map((p) => p.name), ['Disney+', 'Prime Video', 'Paramount+']);
});

test('listPackages caches per country', async () => {
  const { jw, fetchImpl } = setup(() => fixture('jw-packages-ar.json'));
  await jw.listPackages('AR');
  await jw.listPackages('ar');
  assert.equal(fetchImpl.calls.length, 1);
  await jw.listPackages('BR');
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[0].body.query, /packages\(country: \$country, platform: WEB\)/);
  assert.match(fetchImpl.calls[0].body.query, /icon\(profile: S100, format: PNG\)/);
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

// --- production hardening: failure cache, concurrency cap, dedupe, memory ---

/** fetch wrapper that records how many requests are in flight at once. */
function countingFetch(handler, delayMs) {
  const inner = createFakeFetch(handler, { delayMs });
  const stats = { active: 0, max: 0 };
  async function fetchImpl(url, init) {
    stats.active++;
    stats.max = Math.max(stats.max, stats.active);
    try {
      return await inner(url, init);
    } finally {
      stats.active--;
    }
  }
  fetchImpl.calls = inner.calls;
  return { fetchImpl, stats };
}

const lookup = (imdbId, extra = {}) => ({ imdbId, objectType: 'MOVIE', terms: ['x'], country: 'AR', ...extra });

test('a failed findTitle is cached for 2 minutes: the repeat throws without a fetch', async () => {
  let t = 0;
  const { jw, fetchImpl } = setup(() => ({ status: 503, json: {} }), { now: () => t });
  await assert.rejects(jw.findTitle(lookup('tt1')), /503/);
  assert.equal(fetchImpl.calls.length, 1);

  t = FAILURE_TTL - 1;
  await assert.rejects(jw.findTitle(lookup('tt1')), /503/);
  assert.equal(fetchImpl.calls.length, 1);

  await assert.rejects(jw.findTitle(lookup('tt2')), /503/); // another title still goes upstream
  assert.equal(fetchImpl.calls.length, 2);

  t = FAILURE_TTL + 1;
  await assert.rejects(jw.findTitle(lookup('tt1')), /503/);
  assert.equal(fetchImpl.calls.length, 3);
});

test('a timed-out findTitle is cached as a failure too', async () => {
  const { jw, fetchImpl } = setup(() => titlesResponse(), { delayMs: 200, timeoutMs: 20 });
  await assert.rejects(jw.findTitle(lookup('tt1')), /timed out/);
  await assert.rejects(jw.findTitle(lookup('tt1')), /timed out/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('a failed listPackages is cached for 2 minutes', async () => {
  let t = 0;
  const { jw, fetchImpl } = setup(() => ({ status: 503, json: {} }), { now: () => t });
  await assert.rejects(jw.listPackages('AR'), /503/);
  t = FAILURE_TTL - 1;
  await assert.rejects(jw.listPackages('ar'), /503/);
  assert.equal(fetchImpl.calls.length, 1);
  await assert.rejects(jw.listPackages('BR'), /503/);
  assert.equal(fetchImpl.calls.length, 2);
  t = FAILURE_TTL + 1;
  await assert.rejects(jw.listPackages('AR'), /503/);
  assert.equal(fetchImpl.calls.length, 3);
});

test('never more than 4 JustWatch requests in flight', async () => {
  const { fetchImpl, stats } = countingFetch(() => titlesResponse(), 20);
  const jw = createJustWatch({ http: createHttp({ fetchImpl, timeoutMs: 1000 }), cache: createCache() });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => jw.findTitle(lookup(`tt${i}`))));
  assert.equal(results.length, 10);
  assert.equal(fetchImpl.calls.length, 10);
  assert.equal(stats.max, 4);
});

test('the concurrency slot is released when a request fails', async () => {
  const { fetchImpl, stats } = countingFetch(() => ({ status: 503, json: {} }), 5);
  const jw = createJustWatch({ http: createHttp({ fetchImpl, timeoutMs: 1000 }), cache: createCache() });
  const settled = await Promise.allSettled(Array.from({ length: 9 }, (_, i) => jw.findTitle(lookup(`tt${i}`))));
  assert.equal(settled.filter((r) => r.status === 'rejected').length, 9);
  assert.equal(fetchImpl.calls.length, 9);
  assert.ok(stats.max <= 4);
});

test('5 parallel identical findTitle calls share one search and one detail fetch', async () => {
  const { fetchImpl, stats } = countingFetch(
    createFakeJustWatch([lionKing('tm1', 'tt1', [offer('netflix')], { terms: ['x'] })]),
    20,
  );
  const jw = createJustWatch({ http: createHttp({ fetchImpl, timeoutMs: 1000 }), cache: createCache() });
  const all = await Promise.all(Array.from({ length: 5 }, () => jw.findTitle(lookup('tt1'))));
  assert.equal(searchCalls(fetchImpl).length, 1);
  assert.equal(detailCalls(fetchImpl).length, 1);
  assert.equal(stats.max, 1);
  for (const title of all) assert.equal(title.offers[0].package.technicalName, 'netflix');
});

test('5 parallel identical failing lookups share one fetch and all reject', async () => {
  const { fetchImpl } = countingFetch(() => ({ status: 503, json: {} }), 20);
  const jw = createJustWatch({ http: createHttp({ fetchImpl, timeoutMs: 1000 }), cache: createCache() });
  const settled = await Promise.allSettled(Array.from({ length: 5 }, () => jw.findTitle(lookup('tt1'))));
  assert.deepEqual(settled.map((r) => r.status), Array(5).fill('rejected'));
  assert.equal(fetchImpl.calls.length, 1);
});

test('5 parallel listPackages for the same country share one fetch', async () => {
  const { fetchImpl } = countingFetch(() => fixture('jw-packages-ar.json'), 20);
  const jw = createJustWatch({ http: createHttp({ fetchImpl, timeoutMs: 1000 }), cache: createCache() });
  const all = await Promise.all(Array.from({ length: 5 }, (_, i) => jw.listPackages(i % 2 ? 'ar' : 'AR')));
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(all[0].length, 4);
  await jw.listPackages('BR');
  assert.equal(fetchImpl.calls.length, 2);
});

test('mapped offers keep only counted types and only the fields the picker reads', async () => {
  const full = (technicalName, monetizationType) => ({
    ...offer(technicalName, monetizationType),
    presentationType: 'HD',
    retailPrice: '$9.99',
    package: { technicalName, clearName: technicalName.toUpperCase(), id: 8, icon: '/icon/8/{profile}' },
  });
  const { jw } = setup(
    createFakeJustWatch([
      {
        id: 'ts1',
        imdbId: 'tt1',
        objectType: 'SHOW',
        detail: {
          offers: [full('a', 'FLATRATE'), full('b', 'RENT'), full('c', 'BUY'), full('d', 'ADS'), full('e', 'FREE'), null],
          seasons: [
            {
              content: { seasonNumber: 1 },
              episodes: [{ content: { episodeNumber: 1, originalReleaseDate: '2020-01-01' }, offers: [full('f', 'RENT'), full('g', 'FLATRATE')] }],
            },
          ],
        },
      },
    ]),
  );
  const title = await jw.findTitle({ imdbId: 'tt1', objectType: 'SHOW', terms: ['x'], country: 'AR' });
  assert.deepEqual(title.offers.map((o) => o.monetizationType), ['FLATRATE', 'ADS', 'FREE']);
  for (const o of [...title.offers, ...title.seasons[0].episodes[0].offers]) {
    assert.deepEqual(Object.keys(o).sort(), ['deeplinkURL', 'monetizationType', 'package', 'standardWebURL']);
    assert.deepEqual(Object.keys(o.package).sort(), ['clearName', 'technicalName']);
  }
  assert.deepEqual(title.seasons[0].episodes[0].offers.map((o) => o.package.technicalName), ['g']);
});

test('the title cache holds at most 300 entries and does not touch the shared cache', async () => {
  const { jw, fetchImpl, cache } = setup(() => titlesResponse());
  for (let i = 0; i < 301; i++) await jw.findTitle(lookup(`tt${i}`));
  assert.equal(fetchImpl.calls.length, 301);
  await jw.findTitle(lookup('tt300')); // newest is still cached
  assert.equal(fetchImpl.calls.length, 301);
  await jw.findTitle(lookup('tt0')); // oldest was evicted
  assert.equal(fetchImpl.calls.length, 302);
  assert.equal(cache.get('title:AR:MOVIE:tt300'), undefined);
});

test('null season and episode content is skipped, not a crash', async () => {
  const { jw } = setup(
    createFakeJustWatch([
      {
        id: 'ts1',
        imdbId: 'tt1',
        objectType: 'SHOW',
        detail: {
          offers: [],
          seasons: [
            { content: null, episodes: [{ content: { episodeNumber: 1 }, offers: [] }] },
            { content: { seasonNumber: null }, episodes: [] },
            {
              content: { seasonNumber: 2 },
              episodes: [
                { content: null, offers: [] },
                { content: { episodeNumber: null }, offers: [] },
                { content: { episodeNumber: 3, originalReleaseDate: '2020-01-02' }, offers: [offer('netflix')] },
              ],
            },
            null,
          ],
        },
      },
    ]),
  );
  const title = await jw.findTitle({ imdbId: 'tt1', objectType: 'SHOW', terms: ['x'], country: 'AR' });
  assert.deepEqual(
    title.seasons.map((s) => [s.number, s.episodes.map((e) => e.number)]),
    [[2, [3]]],
  );
});

test('a detail node that comes back null is an error, never a cached empty hit', async () => {
  let t = 0;
  let ghost = true;
  const world = createFakeJustWatch([lionKing('tm1', 'tt1', [offer('netflix')])]);
  const { jw, fetchImpl } = setup(
    (req) => (ghost && req.body.query.includes('node(id') ? { data: { node: null } } : world(req)),
    { now: () => t },
  );
  await assert.rejects(jw.findTitle(lookup('tt1')), /no node/i);
  ghost = false;
  t = FAILURE_TTL + 1; // only the brief failure entry could be in the way
  const title = await jw.findTitle(lookup('tt1'));
  assert.equal(title.offers[0].package.technicalName, 'netflix');
  assert.equal(fetchImpl.calls.length, 4);
});

test('only episode offers ask for the per-episode ANDROID link, and it is kept on the offer', async () => {
  const { jw, fetchImpl } = setup(({ body }) =>
    body.query.includes('popularTitles') ? fixture('jw-search-breaking-bad.json') : fixture('jw-detail-breaking-bad.json'),
  );
  const title = await jw.findTitle({ imdbId: 'tt0903747', objectType: 'SHOW', terms: ['Breaking Bad'], country: 'AR' });
  const { query } = detailCalls(fetchImpl)[0].body;
  assert.equal(query.match(/deeplinkURL\(platform: ANDROID\)/g).length, 1);
  assert.match(query, /episodes \{[^]*episodeURL: deeplinkURL\(platform: ANDROID\)/);
  assert.equal(title.offers[0].episodeURL, undefined);
  assert.equal(title.seasons[1].episodes[0].offers[0].episodeURL, 'https://www.netflix.com/watch/70196263');
});
