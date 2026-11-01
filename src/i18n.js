/** Plain strings table per language; `{name}` placeholders are filled by `t`. */
const STRINGS = {
  en: {
    play: 'Play on {service}',
    open: 'Open {service}',
    page_title: 'Play it where you already pay.',
    page_lead:
      'Pick your services and their order. When you press Play in Nuvio or Stremio, it opens in the first one that has it.',
    page_previewTitle: 'How it shows up in Nuvio',
    page_previewEmpty: 'Pick at least one service',
    page_country: 'Country',
    page_yours: 'Your services',
    page_add: 'Add services',
    page_search: 'Search a service',
    page_noResults: 'Nothing with that name',
    page_loading: 'Loading services',
    page_up: 'Move {s} up',
    page_down: 'Move {s} down',
    page_remove: 'Remove {s}',
    page_install: 'Install in Stremio',
    page_urlLabel: 'Install link',
    page_copy: 'Copy',
    page_copied: 'Copied',
    page_nuvio: 'In Nuvio: Settings → Add-ons → paste the link.',
    page_dropped: "{n} services aren't available in {country} and were removed.",
    page_droppedOne: "1 service isn't available in {country} and was removed.",
    page_loadError: "Couldn't load the services for {country}. Try again in a moment.",
    page_language: 'Language',
    page_footer: 'Data from JustWatch. This add-on runs on your own server.',
  },
  es: {
    play: 'Reproducir en {service}',
    open: 'Abrir {service}',
    page_title: 'Que arranque donde ya pagás.',
    page_lead:
      'Elegí tus servicios y su orden. Cuando apretes Play en Nuvio o Stremio, se abre en el primero que la tenga.',
    page_previewTitle: 'Así lo vas a ver en Nuvio',
    page_previewEmpty: 'Elegí al menos un servicio',
    page_country: 'País',
    page_yours: 'Tus servicios',
    page_add: 'Agregar servicios',
    page_search: 'Buscar un servicio',
    page_noResults: 'Nada con ese nombre',
    page_loading: 'Cargando servicios',
    page_up: 'Subir {s}',
    page_down: 'Bajar {s}',
    page_remove: 'Quitar {s}',
    page_install: 'Instalar en Stremio',
    page_urlLabel: 'Link de instalación',
    page_copy: 'Copiar',
    page_copied: 'Copiado',
    page_nuvio: 'En Nuvio: Configuración → Addons → pegá el link.',
    page_dropped: '{n} servicios no están en {country} y se quitaron.',
    page_droppedOne: '1 servicio no está en {country} y se quitó.',
    page_loadError: 'No pude traer los servicios de {country}. Probá de nuevo en un rato.',
    page_language: 'Idioma',
    page_footer: 'Datos de JustWatch. Este addon corre en tu propio servidor.',
  },
};

/**
 * @param {string | undefined} lang unknown languages fall back to English
 * @param {string} key unknown keys return the key itself
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(lang, key, vars = {}) {
  const table = Object.hasOwn(STRINGS, lang ?? '') ? STRINGS[lang] : STRINGS.en;
  const text = table[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * The configure page's strings for one language, placeholders left unfilled
 * (the page fills them in the browser). Unknown languages fall back to English.
 * @param {string | undefined} lang
 * @returns {Record<string, string>}
 */
export function pageStrings(lang) {
  const table = Object.hasOwn(STRINGS, lang ?? '') ? STRINGS[lang] : STRINGS.en;
  return Object.fromEntries(
    Object.keys(STRINGS.en)
      .filter((k) => k.startsWith('page_'))
      .map((k) => [k, table[k] ?? STRINGS.en[k]]),
  );
}
