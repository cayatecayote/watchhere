import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStreams } from '../src/streams.js';

const offer = (tech, clear, extra = {}) => ({
  monetizationType: 'FLATRATE',
  standardWebURL: `https://${tech}.example/title`,
  deeplinkURL: `https://${tech}.example/play`,
  package: { technicalName: tech, clearName: clear },
  ...extra,
});
const disney = offer('disneyplus', 'Disney Plus');
const max = offer('max', 'Max');
const netflix = offer('netflix', 'Netflix');
const movistar = offer('movistarplay', 'MovistarTV', { deeplinkURL: null });

const user = (services, lang = 'en') => ({ country: 'ar', lang, services });

const MOVIE = { imdbId: 'tt1', objectType: 'MOVIE', terms: ['X'], episodes: new Map() };

function setup({ title = MOVIE, jw = { offers: [], seasons: [] }, timeoutMs } = {}) {
  const calls = { resolve: [], find: [] };
  const titles = {
    resolve: async (arg) => {
      calls.resolve.push(arg);
      return title;
    },
  };
  const justWatch = {
    findTitle: async (arg) => {
      calls.find.push(arg);
      return typeof jw === 'function' ? jw(arg) : jw;
    },
  };
  return { calls, getStreams: createStreams({ titles, justWatch, timeoutMs }).getStreams };
}

const movie = { type: 'movie', id: 'tt1' };
const names = (streams) => streams.map((s) => s.name);

test("one row per configured service in the user's order", async () => {
  const { getStreams } = setup({ jw: { offers: [disney, max, netflix], seasons: [] } });
  const out = await getStreams(movie, user(['netflix', 'disneyplus']));
  assert.deepEqual(names(out), ['Netflix', 'Disney+']);
  assert.deepEqual(Object.keys(out[0]).sort(), ['externalUrl', 'name', 'title']);
  assert.equal(out[0].externalUrl, 'https://netflix.example/play');
});

test('passes the request through to the lookups', async () => {
  const { getStreams, calls } = setup({ jw: { offers: [disney], seasons: [] } });
  await getStreams({ type: 'movie', id: 'tt1' }, user(['disneyplus']));
  assert.deepEqual(calls.resolve, [{ type: 'movie', id: 'tt1' }]);
  assert.deepEqual(calls.find, [
    { imdbId: 'tt1', objectType: 'MOVIE', terms: ['X'], country: 'ar' },
  ]);
});

test('never answers a service the user did not pick', async () => {
  const { getStreams } = setup({ jw: { offers: [disney, max], seasons: [] } });
  assert.deepEqual(names(await getStreams(movie, user(['netflix']))), []);
  assert.deepEqual(names(await getStreams(movie, user(['max']))), ['Max']);
});

test('duplicate offers of one service give one row', async () => {
  const { getStreams } = setup({ jw: { offers: [disney, { ...disney }, max, disney], seasons: [] } });
  assert.deepEqual(names(await getStreams(movie, user(['disneyplus', 'max']))), ['Disney+', 'Max']);
});

test('rent and buy offers are ignored', async () => {
  const rent = { ...disney, monetizationType: 'RENT' };
  const buy = { ...max, monetizationType: 'BUY' };
  const free = { ...netflix, monetizationType: 'FREE' };
  const ads = { ...offer('pluto', 'Pluto TV'), monetizationType: 'ADS' };
  const { getStreams } = setup({ jw: { offers: [rent, buy, free, ads], seasons: [] } });
  assert.deepEqual(
    names(await getStreams(movie, user(['disneyplus', 'max', 'netflix', 'pluto']))),
    ['Netflix', 'Pluto TV'],
  );
});

test('a rent offer listed first does not hide a subscription offer of the same service', async () => {
  const rent = { ...disney, monetizationType: 'RENT', deeplinkURL: 'https://disneyplus.example/rent' };
  const { getStreams } = setup({ jw: { offers: [rent, disney], seasons: [] } });
  const out = await getStreams(movie, user(['disneyplus']));
  assert.equal(out[0].externalUrl, 'https://disneyplus.example/play');
});

test('a service whose offers have no usable link yields no row', async () => {
  const junk = { ...disney, deeplinkURL: 'disneyplus://x', standardWebURL: null };
  const { getStreams } = setup({ jw: { offers: [junk, max], seasons: [] } });
  assert.deepEqual(names(await getStreams(movie, user(['disneyplus', 'max']))), ['Max']);
});

test("page links go after every play link even if first in the user's order", async () => {
  const { getStreams } = setup({ jw: { offers: [movistar, disney], seasons: [] } });
  const out = await getStreams(movie, user(['movistarplay', 'disneyplus']));
  assert.deepEqual(names(out), ['Disney+', 'MovistarTV']);
  assert.equal(out[0].externalUrl, 'https://disneyplus.example/play');
  assert.equal(out[1].externalUrl, 'https://movistarplay.example/title');
});

test('display names are friendlier for the known long ones', async () => {
  const offers = [
    offer('amazonprimevideo', 'Amazon Prime Video'),
    offer('paramountplus', 'Paramount Plus'),
    disney,
  ];
  const { getStreams } = setup({ jw: { offers, seasons: [] } });
  const out = await getStreams(movie, user(['amazonprimevideo', 'paramountplus', 'disneyplus']));
  assert.deepEqual(names(out), ['Prime Video', 'Paramount+', 'Disney+']);
});

test('labels follow the user language', async () => {
  const { getStreams } = setup({ jw: { offers: [disney, movistar], seasons: [] } });
  const es = await getStreams(movie, user(['disneyplus', 'movistarplay'], 'es'));
  assert.equal(es[0].title, 'Reproducir en Disney+');
  assert.equal(es[1].title, 'Abrir MovistarTV');
  const en = await getStreams(movie, user(['disneyplus', 'movistarplay'], 'en'));
  assert.equal(en[0].title, 'Play on Disney+');
  assert.equal(en[1].title, 'Open MovistarTV');
});

// --- episodes ---

const SHOW = {
  imdbId: 'tt2',
  objectType: 'SHOW',
  terms: ['Show'],
  episodes: new Map([
    ['1:1', '2024-03-10'],
    ['1:2', '2024-03-17'],
    ['1:3', '2024-03-24'],
  ]),
};
const showLevel = offer('disneyplus', 'Disney Plus', { deeplinkURL: 'https://disneyplus.example/show' });
const ep = (number, releaseDate, offers) => ({ number, releaseDate, offers });
const epOffer = (n) =>
  offer('disneyplus', 'Disney Plus', { deeplinkURL: `https://disneyplus.example/ep${n}` });
const jwShow = (episodes) => ({
  offers: [showLevel],
  seasons: [{ number: 1, episodes }],
});
const series = (season, episode) => ({ type: 'series', id: `tt2:${season}:${episode}`, season, episode });
const urlOf = async (getStreams, req) =>
  (await getStreams(req, user(['disneyplus'])))[0]?.externalUrl;

test('episode with matching air date opens that episode', async () => {
  const { getStreams, calls } = setup({
    title: SHOW,
    jw: jwShow([ep(1, '2024-03-10', [epOffer(1)]), ep(2, '2024-03-17', [epOffer(2)])]),
  });
  assert.equal(await urlOf(getStreams, series(1, 2)), 'https://disneyplus.example/ep2');
  assert.deepEqual(calls.resolve, [{ type: 'series', id: 'tt2:1:2' }]);
});

test('air dates one day apart still match (time zones)', async () => {
  const { getStreams } = setup({
    title: SHOW,
    jw: jwShow([ep(2, '2024-03-18', [epOffer(2)]), ep(3, '2024-03-23', [epOffer(3)])]),
  });
  assert.equal(await urlOf(getStreams, series(1, 2)), 'https://disneyplus.example/ep2');
  assert.equal(await urlOf(getStreams, series(1, 3)), 'https://disneyplus.example/ep3');
});

test('episode with a different air date falls back to the show link', async () => {
  const { getStreams } = setup({
    title: SHOW,
    jw: jwShow([ep(2, '2024-03-19', [epOffer(2)])]),
  });
  assert.equal(await urlOf(getStreams, series(1, 2)), 'https://disneyplus.example/show');
});

test('special or missing episode falls back to the show link', async () => {
  const { getStreams } = setup({
    title: { ...SHOW, episodes: new Map([...SHOW.episodes, ['0:1', '2024-03-01']]) },
    jw: jwShow([ep(1, '2024-03-10', [epOffer(1)])]),
  });
  // season 0 special: JustWatch has no such season
  assert.equal(await urlOf(getStreams, series(0, 1)), 'https://disneyplus.example/show');
  // episode JustWatch does not list
  assert.equal(await urlOf(getStreams, series(1, 2)), 'https://disneyplus.example/show');
  // season JustWatch does not list
  assert.equal(await urlOf(getStreams, series(5, 1)), 'https://disneyplus.example/show');
});

test('missing date on either side falls back to the show link, never another episode', async () => {
  const noJw = setup({ title: SHOW, jw: jwShow([ep(1, null, [epOffer(1)])]) });
  assert.equal(await urlOf(noJw.getStreams, series(1, 1)), 'https://disneyplus.example/show');
  const noCinemeta = setup({
    title: { ...SHOW, episodes: new Map() },
    jw: jwShow([ep(1, '2024-03-10', [epOffer(1)])]),
  });
  assert.equal(await urlOf(noCinemeta.getStreams, series(1, 1)), 'https://disneyplus.example/show');
});

test('episode link is chosen per service', async () => {
  const maxShow = offer('max', 'Max', { deeplinkURL: 'https://max.example/show' });
  const { getStreams } = setup({
    title: SHOW,
    jw: {
      offers: [showLevel, maxShow],
      seasons: [{ number: 1, episodes: [ep(1, '2024-03-10', [epOffer(1)])] }],
    },
  });
  const out = await getStreams(series(1, 1), user(['max', 'disneyplus']));
  assert.deepEqual(
    out.map((s) => s.externalUrl),
    ['https://max.example/show', 'https://disneyplus.example/ep1'],
  );
});

test('a service with only an episode offer: row when the episode matches, none otherwise', async () => {
  const jw = { offers: [], seasons: [{ number: 1, episodes: [ep(1, '2024-03-10', [epOffer(1)])] }] };
  const { getStreams } = setup({ title: SHOW, jw });
  assert.equal(await urlOf(getStreams, series(1, 1)), 'https://disneyplus.example/ep1');
  assert.equal(await urlOf(getStreams, series(1, 2)), undefined);
});

test('series without season and episode gets the show link', async () => {
  const { getStreams } = setup({ title: SHOW, jw: jwShow([ep(1, '2024-03-10', [epOffer(1)])]) });
  assert.equal(
    await urlOf(getStreams, { type: 'series', id: 'tt2' }),
    'https://disneyplus.example/show',
  );
});

test('movies ignore the episode map', async () => {
  const { getStreams } = setup({ jw: { offers: [disney], seasons: [] } });
  assert.equal(
    await urlOf(getStreams, { type: 'movie', id: 'tt1', season: 1, episode: 1 }),
    'https://disneyplus.example/play',
  );
});

// --- failure modes ---

test('title not found, or unknown to Cinemeta -> []', async () => {
  assert.deepEqual(await setup({ jw: null }).getStreams(movie, user(['disneyplus'])), []);
  assert.deepEqual(await setup({ title: null }).getStreams(movie, user(['disneyplus'])), []);
});

test('upstream error or timeout -> []', async () => {
  const boom = setup({
    jw: () => {
      throw new Error('JustWatch 500');
    },
  });
  assert.deepEqual(await boom.getStreams(movie, user(['disneyplus'])), []);

  const slow = setup({ jw: () => new Promise(() => {}), timeoutMs: 20 });
  const started = Date.now();
  assert.deepEqual(await slow.getStreams(movie, user(['disneyplus'])), []);
  assert.ok(Date.now() - started < 1000);

  const badTitles = createStreams({
    titles: {
      resolve: async () => {
        throw new Error('x');
      },
    },
    justWatch: { findTitle: async () => null },
  });
  assert.deepEqual(await badTitles.getStreams(movie, user(['disneyplus'])), []);
});

test('malformed JustWatch data never throws', async () => {
  const { getStreams } = setup({
    jw: { offers: [null, {}, { monetizationType: 'FLATRATE' }, disney], seasons: null },
  });
  assert.deepEqual(names(await getStreams(movie, user(['disneyplus']))), ['Disney+']);
});

test('lookup reports upstream=ok, fail or timeout alongside the rows', async () => {
  const stream = (opts) => createStreams({
    titles: { resolve: async () => MOVIE },
    justWatch: opts.justWatch,
    timeoutMs: opts.timeoutMs,
  });
  const ok = await stream({ justWatch: { findTitle: async () => ({ offers: [disney], seasons: [] }) } }).lookup(
    movie,
    user(['disneyplus']),
  );
  assert.equal(ok.upstream, 'ok');
  assert.equal(ok.rows.length, 1);

  const none = await stream({ justWatch: { findTitle: async () => null } }).lookup(movie, user(['disneyplus']));
  assert.deepEqual(none, { rows: [], upstream: 'ok' });

  const boom = await stream({
    justWatch: {
      findTitle: async () => {
        throw new Error('secret?api_key=SECRET');
      },
    },
  }).lookup(movie, user(['disneyplus']));
  assert.deepEqual(boom, { rows: [], upstream: 'fail' });

  const slow = await stream({ justWatch: { findTitle: () => new Promise(() => {}) }, timeoutMs: 20 }).lookup(
    movie,
    user(['disneyplus']),
  );
  assert.deepEqual(slow, { rows: [], upstream: 'timeout' });
});
