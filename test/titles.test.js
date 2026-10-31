import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHttp } from '../src/http.js';
import { createCache } from '../src/cache.js';
import { createTitles } from '../src/titles.js';
import { createFakeFetch } from './helpers/fakeFetch.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const CINEMETA = 'https://v3-cinemeta.strem.io/meta';
const DAY = 24 * 60 * 60 * 1000;

function setup(handler, { tmdbKey, now } = {}) {
  const fetchImpl = createFakeFetch(handler);
  const http = createHttp({ fetchImpl, timeoutMs: 1000 });
  const cache = createCache(now ? { now } : {});
  const titles = createTitles({ http, cache, tmdbKey });
  return { fetchImpl, titles };
}

const cinemeta = ({ url }) => {
  if (url === `${CINEMETA}/movie/tt2380307.json`) return fixture('cinemeta-coco-movie.json');
  if (url === `${CINEMETA}/series/tt7678620.json`) return fixture('cinemeta-bluey-series.json');
  return { status: 404, json: { err: 'not found' } };
};

test('movie: imdb id and Cinemeta name as search term', async () => {
  const { titles, fetchImpl } = setup(cinemeta);
  const title = await titles.resolve({ type: 'movie', id: 'tt2380307' });
  assert.equal(title.imdbId, 'tt2380307');
  assert.equal(title.objectType, 'MOVIE');
  assert.deepEqual(title.terms, ['Coco']);
  assert.equal(title.episodes.size, 0);
  assert.equal(fetchImpl.calls[0].url, `${CINEMETA}/movie/tt2380307.json`);
});

test('series: episodes keyed "S:E" with release date', async () => {
  const { titles } = setup(cinemeta);
  const title = await titles.resolve({ type: 'series', id: 'tt7678620' });
  assert.equal(title.objectType, 'SHOW');
  assert.deepEqual(title.terms, ['Bluey']);
  assert.equal(title.episodes.get('2:5'), '2020-03-21');
  assert.equal(title.episodes.get('1:1'), '2018-10-01');
  assert.equal(title.episodes.get('0:6'), '2019-10-01'); // specials stay keyed as usual
  assert.equal(title.episodes.has('3:52'), false); // no release date, nothing to compare
});

test('series: a Stremio episode id resolves to its show', async () => {
  const { titles, fetchImpl } = setup(cinemeta);
  const title = await titles.resolve({ type: 'series', id: 'tt7678620:2:5' });
  assert.equal(title.imdbId, 'tt7678620');
  assert.equal(fetchImpl.calls[0].url, `${CINEMETA}/series/tt7678620.json`);
});

test('tmdb id without key answers null and fetches nothing', async () => {
  const { titles, fetchImpl } = setup(cinemeta);
  assert.equal(await titles.resolve({ type: 'movie', id: 'tmdb:354912' }), null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('tmdb id with key goes through TMDB external ids', async () => {
  const { titles, fetchImpl } = setup(
    ({ url }) => {
      if (url.startsWith('https://api.themoviedb.org/3/movie/354912/external_ids')) {
        return { imdb_id: 'tt2380307' };
      }
      return cinemeta({ url });
    },
    { tmdbKey: 'k3y' },
  );
  const title = await titles.resolve({ type: 'movie', id: 'tmdb:354912' });
  assert.equal(title.imdbId, 'tt2380307');
  assert.deepEqual(title.terms, ['Coco']);
  assert.equal(
    fetchImpl.calls[0].url,
    'https://api.themoviedb.org/3/movie/354912/external_ids?api_key=k3y',
  );
  assert.equal(fetchImpl.calls[1].url, `${CINEMETA}/movie/tt2380307.json`);
});

test('tmdb series uses the tv endpoint', async () => {
  const { titles, fetchImpl } = setup(
    ({ url }) => (url.includes('/3/tv/82728/') ? { imdb_id: 'tt7678620' } : cinemeta({ url })),
    { tmdbKey: 'k3y' },
  );
  const title = await titles.resolve({ type: 'series', id: 'tmdb:82728' });
  assert.equal(title.objectType, 'SHOW');
  assert.match(fetchImpl.calls[0].url, /\/3\/tv\/82728\/external_ids\?api_key=k3y$/);
});

test('tmdb id without an imdb id answers null', async () => {
  const { titles } = setup(() => ({ imdb_id: null }), { tmdbKey: 'k3y' });
  assert.equal(await titles.resolve({ type: 'movie', id: 'tmdb:1' }), null);
});

test('Cinemeta 404 → null', async () => {
  const { titles } = setup(cinemeta);
  assert.equal(await titles.resolve({ type: 'movie', id: 'tt0000001' }), null);
});

test('empty meta or meta without a name → null', async () => {
  const { titles } = setup(({ url }) => (url.includes('tt0000002') ? { meta: {} } : {}));
  assert.equal(await titles.resolve({ type: 'movie', id: 'tt0000002' }), null);
  assert.equal(await titles.resolve({ type: 'movie', id: 'tt0000003' }), null);
});

test('a network failure never throws, it answers null', async () => {
  const http = {
    getJson: async () => {
      throw new Error('boom');
    },
  };
  const titles = createTitles({ http, cache: createCache() });
  assert.equal(await titles.resolve({ type: 'movie', id: 'tt2380307' }), null);
});

test('ids and types it cannot handle answer null without a request', async () => {
  const { titles, fetchImpl } = setup(cinemeta);
  for (const req of [
    { type: 'movie', id: 'kitsu:1' },
    { type: 'movie', id: 'tt1/../x' },
    { type: 'channel', id: 'tt2380307' },
    { type: 'movie', id: '' },
    { type: 'movie' },
  ]) {
    assert.equal(await titles.resolve(req), null);
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test('a found title is cached for 7 days', async () => {
  let t = 0;
  const { titles, fetchImpl } = setup(cinemeta, { now: () => t });
  await titles.resolve({ type: 'movie', id: 'tt2380307' });
  t = 7 * DAY - 1;
  await titles.resolve({ type: 'movie', id: 'tt2380307' });
  assert.equal(fetchImpl.calls.length, 1);
  t = 7 * DAY;
  await titles.resolve({ type: 'movie', id: 'tt2380307' });
  assert.equal(fetchImpl.calls.length, 2);
});

test('an unknown title is remembered only briefly, so a hiccup heals', async () => {
  let t = 0;
  let down = true;
  const { titles, fetchImpl } = setup(
    (req) => (down ? { status: 500, json: {} } : cinemeta(req)),
    { now: () => t },
  );
  assert.equal(await titles.resolve({ type: 'movie', id: 'tt2380307' }), null);
  assert.equal(await titles.resolve({ type: 'movie', id: 'tt2380307' }), null);
  assert.equal(fetchImpl.calls.length, 1); // not hammered meanwhile
  down = false;
  t = 60 * 60 * 1000; // an hour later
  const title = await titles.resolve({ type: 'movie', id: 'tt2380307' });
  assert.equal(title.terms[0], 'Coco');
});
