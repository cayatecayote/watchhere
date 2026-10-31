import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { manifest } from '../src/manifest.js';
import pkg from '../package.json' with { type: 'json' };

const cfg = loadConfig({});

function quietLogger() {
  const lines = [];
  return { lines, info: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
}

/** Starts the app on a random port with fake collaborators. */
async function start({ streams, justWatch, page, logger = quietLogger() } = {}) {
  const calls = { streams: [], packages: [], render: [] };
  const fakeStreams = streams ?? {
    async getStreams(req, user) {
      calls.streams.push({ req, user });
      return [{ name: 'Disney+', title: 'Play on Disney+', externalUrl: 'https://x.test/play/1' }];
    },
  };
  const fakeJw = justWatch ?? {
    async listPackages(country) {
      calls.packages.push(country);
      return [{ id: 'netflix', name: 'Netflix' }];
    },
  };
  const fakePage =
    page === undefined
      ? {
          render(user, lang) {
            calls.render.push({ user, lang });
            return '<html>page</html>';
          },
        }
      : page;
  const server = createServer(
    createApp({ streams: fakeStreams, justWatch: fakeJw, page: fakePage, cfg, logger }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, logger, close: () => new Promise((r) => server.close(r)) };
}

test('loadConfig: defaults', () => {
  assert.deepEqual(loadConfig({}), {
    port: 7020,
    requestTimeoutMs: 4000,
    streamTimeoutMs: 5000,
    defaults: { country: 'ar', lang: 'es', services: ['disneyplus', 'netflix'] },
    tmdbKey: '',
  });
});

test('loadConfig: reads PORT, DEFAULT_CONFIG and TMDB_API_KEY', () => {
  const c = loadConfig({ PORT: '8080', DEFAULT_CONFIG: 'us-en-hulu,max', TMDB_API_KEY: 'k' });
  assert.equal(c.port, 8080);
  assert.deepEqual(c.defaults, { country: 'us', lang: 'en', services: ['hulu', 'max'] });
  assert.equal(c.tmdbKey, 'k');
});

test('loadConfig: invalid DEFAULT_CONFIG or PORT throws', () => {
  assert.throws(() => loadConfig({ DEFAULT_CONFIG: 'nonsense' }), /DEFAULT_CONFIG/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
});

test('manifest: constant identity, configured description lists country and services', () => {
  const plain = manifest(null);
  const conf = manifest({ country: 'us', lang: 'en', services: ['hulu', 'max'] });
  for (const m of [plain, conf]) {
    assert.equal(m.id, 'community.watchhere');
    assert.equal(m.name, 'WatchHere');
    assert.deepEqual(m.resources, ['stream']);
    assert.deepEqual(m.types, ['movie', 'series']);
    assert.deepEqual(m.idPrefixes, ['tt', 'tmdb:']);
    assert.deepEqual(m.catalogs, []);
    assert.deepEqual(m.behaviorHints, { configurable: true });
    assert.equal(m.version, pkg.version);
  }
  assert.match(conf.description, /hulu/);
  assert.match(conf.description, /max/);
  assert.match(conf.description, /US/);
  assert.match(plain.description, /Not configured: using the default list/);
});

test('manifest: Spanish description when lang is es', () => {
  const m = manifest({ country: 'ar', lang: 'es', services: ['netflix'] });
  assert.match(m.description, /netflix/);
  assert.doesNotMatch(m.description, /Not configured/);
  assert.match(manifest(null, 'es').description, /Sin configurar/);
});

test('GET /manifest.json and /<segment>/manifest.json', async () => {
  const s = await start();
  try {
    const a = await fetch(`${s.base}/manifest.json`);
    assert.equal(a.status, 200);
    assert.match(a.headers.get('content-type'), /application\/json/);
    const ma = await a.json();
    const b = await fetch(`${s.base}/ar-es-disneyplus,netflix/manifest.json`);
    const mb = await b.json();
    assert.equal(ma.id, mb.id);
    assert.equal(ma.name, mb.name);
    assert.equal(mb.behaviorHints.configurable, true);
    assert.match(mb.description, /disneyplus/);
    const c = await fetch(`${s.base}/ar-es-disneyplus%2Cnetflix/manifest.json`);
    assert.equal(c.status, 200);
  } finally {
    await s.close();
  }
});

test('invalid segment is 404 on manifest, stream and configure', async () => {
  const s = await start();
  try {
    for (const path of [
      '/bogus/manifest.json',
      '/bogus/stream/movie/tt2380307.json',
      '/bogus/configure',
      '/ar-xx-netflix/manifest.json',
    ]) {
      const r = await fetch(s.base + path);
      assert.equal(r.status, 404, path);
    }
    assert.equal(s.calls.streams.length, 0);
  } finally {
    await s.close();
  }
});

test('movie stream: configured segment is passed to streams', async () => {
  const s = await start();
  try {
    const r = await fetch(`${s.base}/ar-es-disneyplus,netflix/stream/movie/tt2380307.json`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.streams.length, 1);
    assert.equal(s.calls.streams.length, 1);
    const { req, user } = s.calls.streams[0];
    assert.equal(req.type, 'movie');
    assert.equal(req.id, 'tt2380307');
    assert.equal(req.season, undefined);
    assert.deepEqual(user, { country: 'ar', lang: 'es', services: ['disneyplus', 'netflix'] });
  } finally {
    await s.close();
  }
});

test('stream without segment uses cfg.defaults', async () => {
  const s = await start();
  try {
    await fetch(`${s.base}/stream/movie/tt2380307.json`);
    assert.deepEqual(s.calls.streams[0].user, cfg.defaults);
  } finally {
    await s.close();
  }
});

test('series ids: season and episode are Numbers; %3A is decoded', async () => {
  const s = await start();
  try {
    await fetch(`${s.base}/stream/series/tt7678620%3A2%3A5.json`);
    await fetch(`${s.base}/us-en-hulu/stream/series/tmdb:82728:2:5.json`);
    await fetch(`${s.base}/stream/movie/tmdb%3A354912.json`);
    const [a, b, c] = s.calls.streams;
    assert.equal(a.req.id, 'tt7678620:2:5');
    assert.strictEqual(a.req.season, 2);
    assert.strictEqual(a.req.episode, 5);
    assert.equal(b.req.id, 'tmdb:82728:2:5');
    assert.strictEqual(b.req.season, 2);
    assert.strictEqual(b.req.episode, 5);
    assert.deepEqual(b.user, { country: 'us', lang: 'en', services: ['hulu'] });
    assert.equal(c.req.id, 'tmdb:354912');
    assert.equal(c.req.season, undefined);
  } finally {
    await s.close();
  }
});

test('a throwing streams still answers 200 {streams:[]}', async () => {
  const s = await start({
    streams: {
      async getStreams() {
        throw new Error('boom?api_key=SECRET');
      },
    },
  });
  try {
    const r = await fetch(`${s.base}/stream/movie/tt2380307.json`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { streams: [] });
    assert.ok(!s.logger.lines.join('\n').includes('SECRET'));
  } finally {
    await s.close();
  }
});

test('malformed stream ids and types answer 200 {streams:[]} without calling streams', async () => {
  const s = await start();
  try {
    for (const path of ['/stream/movie/garbage.json', '/stream/tv/tt1.json', '/stream/movie/%E0%A4%A.json']) {
      const r = await fetch(s.base + path);
      assert.equal(r.status, 200, path);
      assert.deepEqual(await r.json(), { streams: [] });
    }
    assert.equal(s.calls.streams.length, 0);
  } finally {
    await s.close();
  }
});

test('one log line per stream request with id, services, rows and ms', async () => {
  const s = await start();
  try {
    await fetch(`${s.base}/ar-es-disneyplus,netflix/stream/movie/tt2380307.json`);
    assert.equal(s.logger.lines.length, 1);
    assert.match(s.logger.lines[0], /tt2380307/);
    assert.match(s.logger.lines[0], /disneyplus,netflix/);
    assert.match(s.logger.lines[0], /rows=1/);
    assert.match(s.logger.lines[0], /\d+ms/);
  } finally {
    await s.close();
  }
});

test('/api/packages passes the country', async () => {
  const s = await start();
  try {
    const r = await fetch(`${s.base}/api/packages?country=us`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), [{ id: 'netflix', name: 'Netflix' }]);
    assert.deepEqual(s.calls.packages, ['us']);
    assert.equal((await fetch(`${s.base}/api/packages?country=zzz`)).status, 400);
    assert.equal((await fetch(`${s.base}/api/packages`)).status, 400);
  } finally {
    await s.close();
  }
});

test('/api/packages upstream failure is 502 without leaking the message', async () => {
  const s = await start({
    justWatch: {
      async listPackages() {
        throw new Error('secret detail');
      },
    },
  });
  try {
    const r = await fetch(`${s.base}/api/packages?country=ar`);
    assert.equal(r.status, 502);
    assert.ok(!(await r.text()).includes('secret'));
  } finally {
    await s.close();
  }
});

test('/health', async () => {
  const s = await start();
  try {
    const r = await fetch(`${s.base}/health`);
    assert.deepEqual(await r.json(), { ok: true, version: pkg.version });
  } finally {
    await s.close();
  }
});

test('CORS on every response, OPTIONS is 204, unknown paths 404', async () => {
  const s = await start();
  try {
    for (const path of ['/manifest.json', '/health', '/nope', '/stream/movie/tt1.json']) {
      const r = await fetch(s.base + path);
      assert.equal(r.headers.get('access-control-allow-origin'), '*', path);
    }
    const o = await fetch(`${s.base}/manifest.json`, { method: 'OPTIONS' });
    assert.equal(o.status, 204);
    assert.equal(o.headers.get('access-control-allow-origin'), '*');
    assert.match(o.headers.get('access-control-allow-methods'), /GET/);
    assert.equal((await fetch(`${s.base}/nope`)).status, 404);
    assert.equal((await fetch(`${s.base}/`)).status, 404);
  } finally {
    await s.close();
  }
});

test('configure: renders page with user and language', async () => {
  const s = await start();
  try {
    const r = await fetch(`${s.base}/ar-en-netflix/configure`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html; charset=utf-8/);
    assert.equal(await r.text(), '<html>page</html>');
    assert.deepEqual(s.calls.render[0], {
      user: { country: 'ar', lang: 'en', services: ['netflix'] },
      lang: 'en',
    });

    await fetch(`${s.base}/configure`, { headers: { 'accept-language': 'es-AR,es;q=0.9' } });
    assert.deepEqual(s.calls.render[1], { user: null, lang: 'es' });
    await fetch(`${s.base}/configure`, { headers: { 'accept-language': 'fr' } });
    assert.deepEqual(s.calls.render[2], { user: null, lang: 'en' });
  } finally {
    await s.close();
  }
});

test('configure is 404 when no page is wired', async () => {
  const s = await start({ page: null });
  try {
    assert.equal((await fetch(`${s.base}/configure`)).status, 404);
    assert.equal((await fetch(`${s.base}/ar-es-netflix/configure`)).status, 404);
  } finally {
    await s.close();
  }
});
