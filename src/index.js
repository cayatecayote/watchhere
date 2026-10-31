import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createHttp } from './http.js';
import { createCache } from './cache.js';
import { createJustWatch } from './justwatch.js';
import { createTitles } from './titles.js';
import { createStreams } from './streams.js';
import { createApp } from './server.js';

const cfg = loadConfig(process.env);

const http = createHttp({ timeoutMs: cfg.requestTimeoutMs });
const cache = createCache();
const justWatch = createJustWatch({ http, cache });
const titles = createTitles({ http, cache, tmdbKey: cfg.tmdbKey });
const streams = createStreams({ titles, justWatch, timeoutMs: cfg.streamTimeoutMs });

// The configure page arrives with its own module; until then /configure is a 404.
const app = createApp({ streams, justWatch, page: null, cfg, logger: console });

createServer(app).listen(cfg.port, () => {
  console.log(`WatchHere listening on :${cfg.port}`);
});
