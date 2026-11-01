// Live suite: talks to the real JustWatch and Cinemeta. Run with `npm run live`.
// It is the only place the network is allowed; `npm test` stays offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp } from '../src/http.js';
import { createCache } from '../src/cache.js';
import { createJustWatch } from '../src/justwatch.js';
import { createTitles } from '../src/titles.js';
import { createStreams } from '../src/streams.js';

const http = createHttp({ timeoutMs: 8000 });
const cache = createCache();
const justWatch = createJustWatch({ http, cache });
const titles = createTitles({ http, cache });
const streams = createStreams({ titles, justWatch, timeoutMs: 20000 });

const user = (services) => ({ country: 'ar', lang: 'en', services });

async function ask(type, id, services) {
  const m = /^(tt\d+):(\d+):(\d+)$/.exec(id);
  const req = m ? { type, id, season: Number(m[2]), episode: Number(m[3]) } : { type, id };
  return streams.getStreams(req, user(services));
}

test('Coco (movie) on Disney+ opens a play link', async () => {
  const rows = await ask('movie', 'tt2380307', ['disneyplus']);
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.match(rows[0].externalUrl, /^https:\/\/www\.disneyplus\.com\/play\//);
});

test('Stranger Things 1x1 on Netflix opens /watch/', async () => {
  const rows = await ask('series', 'tt4574334:1:1', ['netflix']);
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.match(rows[0].externalUrl, /^https:\/\/www\.netflix\.com\/watch\//);
});

test('Bluey 2x5 on Disney+ is episode-specific, not the show link', async () => {
  const episode = await ask('series', 'tt7678620:2:5', ['disneyplus']);
  const show = await ask('series', 'tt7678620', ['disneyplus']);
  assert.equal(episode.length, 1, JSON.stringify(episode));
  assert.equal(show.length, 1, JSON.stringify(show));
  assert.match(episode[0].externalUrl, /^https:\/\/www\.disneyplus\.com\/play\//);
  assert.match(show[0].externalUrl, /^https:\/\/www\.disneyplus\.com\/play\//);
  assert.notEqual(episode[0].externalUrl, show[0].externalUrl);
});

test('The Last of Us 2x5 on Max opens a HBO Max watch link', async () => {
  const rows = await ask('series', 'tt3581920:2:5', ['max']);
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.match(rows[0].externalUrl, /^https:\/\/play\.hbomax\.com\/video\/watch\//);
});
