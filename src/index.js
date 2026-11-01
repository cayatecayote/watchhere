import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createHttp } from './http.js';
import { createCache } from './cache.js';
import { createJustWatch } from './justwatch.js';
import { createTitles } from './titles.js';
import { createStreams } from './streams.js';
import { createPage } from './page.js';
import { createApp } from './server.js';

const cfg = loadConfig(process.env);

const http = createHttp({ timeoutMs: cfg.requestTimeoutMs });
const cache = createCache();
const justWatch = createJustWatch({ http, cache });
const titles = createTitles({ http, cache, tmdbKey: cfg.tmdbKey });
const streams = createStreams({ titles, justWatch, timeoutMs: cfg.streamTimeoutMs });

const app = createApp({ streams, justWatch, page: createPage({ defaultCountry: cfg.defaults.country }), cfg, logger: console });

createServer(app).listen(cfg.port, () => {
  console.log(`WatchHere listening on :${cfg.port}`);
});
