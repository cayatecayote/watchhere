import pkg from '../package.json' with { type: 'json' };

/**
 * The manifest id and name never change with the configuration: Nuvio's
 * autoplay picks add-ons by name.
 *
 * @param {import('./userConfig.js').UserConfig | null} user
 * @param {'en' | 'es'} [lang] language for the unconfigured description
 */
export function manifest(user, lang = 'en') {
  return {
    id: 'community.watchhere',
    version: pkg.version,
    name: 'WatchHere',
    description: describe(user, user?.lang ?? lang),
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:'],
    catalogs: [],
    behaviorHints: { configurable: true },
  };
}

function describe(user, lang) {
  if (!user) {
    return lang === 'es'
      ? 'Sin configurar: usa la lista por defecto. Abre cada título en tus servicios de streaming.'
      : 'Not configured: using the default list. Opens each title in your streaming services.';
  }
  const services = user.services.join(', ');
  const country = user.country.toUpperCase();
  return lang === 'es'
    ? `Abre cada título en tus servicios de streaming. País: ${country}. Servicios: ${services}.`
    : `Opens each title in your streaming services. Country: ${country}. Services: ${services}.`;
}
