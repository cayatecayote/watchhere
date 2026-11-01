// Live suite: talks to the real JustWatch and Cinemeta. Run with `npm run live`.
// It is the only place the network is allowed; `npm test` stays offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp } from '../src/http.js';
import { createCache } from '../src/cache.js';
import { createJustWatch } from '../src/justwatch.js';
import { createTitles } from '../src/titles.js';
import { createStreams } from '../src/streams.js';
import { loadConfig } from '../src/config.js';

// Same timeouts as production, so a passing live run means production would answer too.
const cfg = loadConfig({});
const realHttp = createHttp({ timeoutMs: cfg.requestTimeoutMs });
/** @type {{ kind: string, ms: number }[]} */
const timings = [];
const http = {
  getJson: (url) => realHttp.getJson(url),
  async postJson(url, body) {
    const started = Date.now();
    try {
      return await realHttp.postJson(url, body);
    } finally {
      timings.push({ kind: body.query.includes('node(id') ? 'detail' : 'other', ms: Date.now() - started });
    }
  },
};
const cache = createCache();
const justWatch = createJustWatch({ http, cache });
const titles = createTitles({ http, cache });
const streams = createStreams({ titles, justWatch, timeoutMs: cfg.streamTimeoutMs });

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

test('The Simpsons 30x1 (a very long show) completes inside the stream timeout', async () => {
  timings.length = 0;
  const started = Date.now();
  const { rows, upstream } = await streams.lookup(
    { type: 'series', id: 'tt0096697:30:1', season: 30, episode: 1 },
    user(['disneyplus', 'hulu', 'star', 'starplus']),
  );
  const ms = Date.now() - started;
  console.log(`  [simpsons 30x1] ${ms}ms upstream=${upstream} rows=${rows.length} ${JSON.stringify(rows.map((r) => r.name))} requests=${JSON.stringify(timings)}`);
  // Rows may be empty (no offer in AR); what matters is that the lookup did not fail or time out.
  assert.equal(upstream, 'ok');
  assert.ok(ms < cfg.streamTimeoutMs, `took ${ms}ms`);
  for (const row of rows) assert.match(row.externalUrl, /^https:\/\//);
});
