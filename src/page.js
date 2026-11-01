import { COUNTRIES } from './countries.js';
import { pageStrings, t } from './i18n.js';

const DEFAULT_COUNTRY = 'ar';

/** @param {unknown} s */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON that is safe inside a <script type="application/json"> element. */
function safeJson(value) {
  const bs = String.fromCharCode(92); // a backslash
  const lineSeparators = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
  return JSON.stringify(value)
    .replace(/</g, bs + 'u003c')
    .replace(lineSeparators, (c) => bs + 'u' + c.charCodeAt(0).toString(16));
}

const CSS = `
:root {
  --night: #10263A; --panel: #183650; --line: #2A4D6B;
  --ink: #EEF3F6; --haze: #93AEC0; --glow: #F5B841;
  --display: "Segoe UI Variable Display", "SF Pro Display", system-ui, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--night); color-scheme: dark; }
body {
  margin: 0; min-height: 100vh; color: var(--ink); font: 16px/1.5 var(--body);
  background: radial-gradient(120% 50% at 50% -8%, #1d4668 0%, var(--night) 62%) no-repeat;
}
main { max-width: 680px; margin: 0 auto; padding: 20px 20px 48px; }
h1, h2, p { margin: 0; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--glow); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brand { font: 750 20px/1 var(--display); letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; }
.brand i { width: 10px; height: 10px; border-radius: 50%; background: var(--glow); box-shadow: 0 0 12px 2px rgba(245, 184, 65, 0.65); }
.langs { display: flex; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); }
.langs button { border: 0; background: none; padding: 6px 14px; min-height: 36px; border-radius: 999px; color: var(--haze); font-weight: 650; font-size: 14px; }
.langs button[aria-pressed="true"] { background: var(--glow); color: var(--night); }

h1 { font: 800 clamp(28px, 7vw, 40px)/1.1 var(--display); letter-spacing: -0.02em; margin-top: 36px; text-wrap: balance; }
.lead { margin-top: 12px; max-width: 60ch; color: var(--ink); opacity: 0.88; }

section { margin-top: 32px; }
[hidden] { display: none !important; }
h2 { font: 700 20px/1.3 var(--display); }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
.small { font-size: 14px; color: var(--haze); }
.ptitle { font-size: 14px; font-weight: 600; color: var(--haze); }

.rows { list-style: none; margin: 12px 0 0; padding: 0; position: relative; display: grid; gap: 8px; }
.prow { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 10px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line); }
.num { font: 700 2rem/1 var(--display); font-variant-numeric: tabular-nums; color: var(--glow); min-width: 1.4ch; text-align: center; }
.prow .label { flex: 1; min-width: 0; font-weight: 600; }
.play { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; color: var(--haze); flex: none; }
.empty { margin-top: 12px; color: var(--haze); }

.field { display: block; width: 100%; margin-top: 10px; min-height: 48px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); }
select.field { appearance: none; padding-right: 44px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M3 6l5 5 5-5' fill='none' stroke='%2393AEC0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; }
input.field::placeholder { color: var(--haze); }
.label-l { font: 700 20px/1.3 var(--display); display: block; }
.notice { margin-top: 10px; color: var(--glow); font-size: 14px; }
.notice:empty { display: none; }

.lineup li { display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 14px; border-radius: 14px; background: var(--panel); border: 1px solid var(--line); }
.lineup .name { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.ctl { display: flex; gap: 4px; flex: none; }
.ctl button { width: 40px; height: 40px; border-radius: 999px; border: 1px solid var(--line); background: none; display: grid; place-items: center; color: var(--ink); }
.ctl button:hover:not(:disabled) { border-color: var(--haze); }
.ctl button:disabled { opacity: 0.3; cursor: default; }

.logo { width: 40px; height: 40px; border-radius: 10px; flex: none; background: var(--line); object-fit: contain; display: grid; place-items: center; font-weight: 750; font-size: 14px; color: var(--ink); }
img.logo { background: #fff; }

.grid { margin-top: 12px; max-height: 26rem; overflow-y: auto; overscroll-behavior: contain; padding: 3px; margin-inline: -3px; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 6px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); text-align: center; font-size: 14px; line-height: 1.25; min-height: 104px; }
.tile:hover { border-color: var(--haze); }
.tile[aria-pressed="true"] { border-color: var(--glow); box-shadow: 0 0 0 2px var(--glow); }
.tile .logo { width: 44px; height: 44px; }
.tile span.t { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tile b { position: absolute; top: 6px; right: 6px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 999px; background: var(--glow); color: var(--night); font-size: 13px; line-height: 22px; font-variant-numeric: tabular-nums; }
.status { margin-top: 12px; color: var(--haze); }

.install { margin-top: 36px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 24px; border-radius: 999px; border: 1px solid transparent; font-weight: 700; text-decoration: none; }
.btn.main { background: var(--glow); color: var(--night); }
.btn.main[aria-disabled="true"] { background: var(--night); color: var(--haze); border-color: var(--line); cursor: not-allowed; }
.btn.ghost { background: none; border-color: var(--line); color: var(--ink); }
.btn.ghost:hover:not(:disabled) { border-color: var(--haze); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.urlrow { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-top: 14px; }
.urlrow textarea { flex: 1 1 280px; min-width: 0; min-height: 48px; padding: 10px 14px; resize: none; border-radius: 12px; border: 1px solid var(--line); background: var(--night); font: 14px/1.4 ui-monospace, "Cascadia Mono", Menlo, monospace; word-break: break-all; field-sizing: content; }
.install .small { margin-top: 12px; }
footer { margin-top: 32px; }

@media (max-width: 400px) {
  main { padding: 16px 16px 40px; }
  .ctl button { width: 36px; height: 36px; }
  .lineup li { gap: 10px; padding-left: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
`;

/**
 * Runs in the browser. It is serialised with toString(), so it must not close
 * over anything from this module.
 */
function client() {
  const boot = JSON.parse(document.getElementById('boot').textContent);
  const $ = (id) => document.getElementById(id);
  const SERVICE_ID = /^[a-z0-9]+$/;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The page can sit at /configure, /<segment>/configure or behind a prefix.
  const base = location.pathname
    .replace(/\/configure\/?$/, '')
    .replace(/\/[a-z]{2}-(?:en|es)-[a-z0-9]+(?:(?:,|%2C)[a-z0-9]+)*$/i, '');

  const state = {
    country: boot.country,
    lang: boot.lang,
    services: boot.services.slice(),
    packages: [],
    status: 'loading',
    query: '',
    notice: null,
  };
  let loadToken = 0;
  let copiedTimer = 0;

  const tr = (key, vars) =>
    boot.strings[state.lang][key].replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
  const countryEntry = (cc) => boot.countries.find((c) => c.code === cc);
  const countryName = (cc) => {
    const c = countryEntry(cc);
    return c ? c[state.lang] : cc.toUpperCase();
  };
  const pkgOf = (id) => state.packages.find((p) => p.id === id);
  const nameOf = (id) => (pkgOf(id) ? pkgOf(id).name : id);
  const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const flag = (cc) =>
    String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

  const ICONS = {
    up: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    play: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>',
  };

  function make(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const kid of kids) if (kid) node.append(kid);
    return node;
  }

  function logo(id) {
    const p = pkgOf(id);
    const initials = () => {
      const words = nameOf(id).split(/[^A-Za-z0-9]+/).filter(Boolean);
      const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || id).slice(0, 2);
      return make('span', { class: 'logo', 'aria-hidden': 'true', text: letters.toUpperCase() });
    };
    if (!p || !p.icon) return initials();
    const img = make('img', { class: 'logo', src: p.icon, width: 40, height: 40, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(initials()));
    return img;
  }

  // --- the one motion moment: rows slide to their new place (FLIP) ---------
  const rowTops = () => {
    const m = new Map();
    document.querySelectorAll('[data-flip]').forEach((n) => m.set(n.dataset.flip, n.offsetTop));
    return m;
  };
  function slide(before) {
    if (reduced.matches || typeof Element.prototype.animate !== 'function') return;
    document.querySelectorAll('[data-flip]').forEach((n) => {
      const old = before.get(n.dataset.flip);
      const opts = { duration: 180, easing: 'ease-out' };
      if (old === undefined) {
        n.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], opts);
      } else if (old !== n.offsetTop) {
        n.animate([{ transform: 'translateY(' + (old - n.offsetTop) + 'px)' }, { transform: 'none' }], opts);
      }
    });
  }

  // --- rendering ------------------------------------------------------------
  function renderTexts() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = tr(n.dataset.i18n)));
    $('search').placeholder = tr('page_search');
    $('search').setAttribute('aria-label', tr('page_search'));
    $('url').setAttribute('aria-label', tr('page_urlLabel'));
    $('langs').setAttribute('aria-label', tr('page_language'));
    document.querySelectorAll('#langs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));

    const sel = $('country');
    const codes = boot.countries.map((c) => c.code);
    if (!codes.includes(state.country)) codes.push(state.country);
    sel.replaceChildren(
      ...codes.map((cc) => {
        const o = make('option', { value: cc, text: flag(cc) + '  ' + countryName(cc) });
        o.selected = cc === state.country;
        return o;
      }),
    );
  }

  function renderPreview() {
    const list = $('preview');
    list.replaceChildren(
      ...state.services.map((id, i) =>
        make(
          'li',
          { class: 'prow', 'data-flip': 'p:' + id },
          make('span', { class: 'num', text: String(i + 1) }),
          make('span', { class: 'label', text: boot.play[state.lang].replace('{service}', nameOf(id)) }),
          make('span', { class: 'play', html: ICONS.play }),
        ),
      ),
    );
    $('previewEmpty').hidden = state.services.length > 0;
    $('previewEmpty').textContent = tr('page_previewEmpty');
  }

  function renderLineup() {
    const list = $('lineup');
    const last = state.services.length - 1;
    list.replaceChildren(
      ...state.services.map((id, i) => {
        const name = nameOf(id);
        const btn = (act, label, icon, disabled) => {
          const b = make('button', { type: 'button', 'data-act': act, 'data-id': id, 'aria-label': tr(label, { s: name }), html: icon });
          b.disabled = disabled;
          return b;
        };
        return make(
          'li',
          { 'data-flip': 'l:' + id },
          make('span', { class: 'num', text: String(i + 1) }),
          logo(id),
          make('span', { class: 'name', text: name }),
          make(
            'span',
            { class: 'ctl' },
            btn('up', 'page_up', ICONS.up, i === 0),
            btn('down', 'page_down', ICONS.down, i === last),
            btn('remove', 'page_remove', ICONS.x, false),
          ),
        );
      }),
    );
    $('yours').hidden = state.services.length === 0;
  }

  function renderTiles() {
    const grid = $('tiles');
    const status = $('status');
    status.textContent = '';
    if (state.status === 'loading') {
      grid.replaceChildren();
      status.textContent = tr('page_loading') + '…';
      return;
    }
    if (state.status === 'error') {
      grid.replaceChildren();
      status.textContent = tr('page_loadError', { country: countryName(state.country) });
      return;
    }
    const q = plain(state.query.trim());
    const shown = state.packages.filter((p) => SERVICE_ID.test(p.id) && (!q || plain(p.name).includes(q)));
    if (!shown.length) status.textContent = tr('page_noResults');
    grid.replaceChildren(
      ...shown.map((p) => {
        const at = state.services.indexOf(p.id);
        const tile = make(
          'button',
          { type: 'button', class: 'tile', 'data-act': 'toggle', 'data-id': p.id, 'aria-pressed': String(at >= 0) },
          logo(p.id),
          make('span', { class: 't', text: p.name }),
          at >= 0 ? make('b', { text: String(at + 1), 'aria-hidden': 'true' }) : null,
        );
        return tile;
      }),
    );
  }

  const segment = () => state.country + '-' + state.lang + '-' + state.services.join(',');
  function renderInstall() {
    const ready = state.services.length > 0;
    const path = base + '/' + segment() + '/manifest.json';
    const url = ready ? location.origin + path : '';
    const link = $('stremio');
    $('url').value = url;
    $('copy').disabled = !ready;
    $('urlrow').hidden = !ready;
    $('need').hidden = ready;
    $('need').textContent = tr('page_previewEmpty');
    if (ready) {
      link.href = 'stremio://' + location.host + path;
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('aria-describedby', 'need');
    }
    if (!copiedTimer) $('copy').textContent = tr('page_copy');
  }

  function renderNotice() {
    const n = state.notice;
    $('notice').textContent = !n
      ? ''
      : tr(n.count === 1 ? 'page_droppedOne' : 'page_dropped', { n: n.count, country: countryName(state.country) });
  }

  function renderAll() {
    renderTexts();
    renderPreview();
    renderLineup();
    renderTiles();
    renderInstall();
    renderNotice();
  }

  /** Re-renders what a service change touches, animates, and keeps keyboard focus. */
  function changeServices(mutate, focus) {
    const before = rowTops();
    mutate();
    renderPreview();
    renderLineup();
    renderTiles();
    renderInstall();
    slide(before);
    if (focus) {
      const target = focus();
      if (target) target.focus();
    }
  }
  const control = (act, id) => document.querySelector('[data-act="' + act + '"][data-id="' + id + '"]');

  // --- data -----------------------------------------------------------------
  async function loadPackages(initial) {
    const token = ++loadToken;
    state.status = 'loading';
    state.packages = [];
    renderTiles();
    try {
      const res = await fetch(base + '/api/packages?country=' + encodeURIComponent(state.country));
      if (!res.ok) throw new Error(String(res.status));
      const list = await res.json();
      if (token !== loadToken) return;
      state.packages = list;
      state.status = 'ready';
      if (!initial) {
        const ids = new Set(list.map((p) => p.id));
        const kept = state.services.filter((id) => ids.has(id));
        const dropped = state.services.length - kept.length;
        state.notice = dropped ? { count: dropped } : null;
        state.services = kept;
      }
      renderPreview();
      renderLineup();
      renderTiles();
      renderInstall();
      renderNotice();
    } catch {
      if (token !== loadToken) return;
      state.status = 'error';
      renderTiles();
    }
  }

  // --- events ---------------------------------------------------------------
  $('country').addEventListener('change', (e) => {
    state.country = e.target.value;
    state.notice = null;
    renderNotice();
    renderInstall();
    loadPackages(false);
  });
  $('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderTiles();
  });
  $('langs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b || b.dataset.lang === state.lang) return;
    state.lang = b.dataset.lang;
    renderAll();
  });

  $('lineup').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    const i = state.services.indexOf(id);
    const act = b.dataset.act;
    if (act === 'remove') {
      changeServices(
        () => state.services.splice(i, 1),
        () => {
          const next = state.services[i] || state.services[i - 1];
          return next ? control('remove', next) : $('search');
        },
      );
    } else {
      const j = act === 'up' ? i - 1 : i + 1;
      changeServices(
        () => ([state.services[i], state.services[j]] = [state.services[j], state.services[i]]),
        () => {
          const same = control(act, id);
          return same && !same.disabled ? same : control(act === 'up' ? 'down' : 'up', id);
        },
      );
    }
  });

  $('tiles').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act="toggle"]');
    if (!b) return;
    const id = b.dataset.id;
    changeServices(
      () => {
        const i = state.services.indexOf(id);
        if (i >= 0) state.services.splice(i, 1);
        else state.services.push(id);
        state.notice = null;
        renderNotice();
      },
      () => control('toggle', id),
    );
  });

  $('stremio').addEventListener('click', (e) => {
    if (!state.services.length) e.preventDefault();
  });

  $('copy').addEventListener('click', async () => {
    const url = $('url').value;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Plain-http LAN installs have no Clipboard API: fall back to selection.
      $('url').select();
      document.execCommand('copy');
    }
    $('copy').textContent = tr('page_copied');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedTimer = 0;
      $('copy').textContent = tr('page_copy');
    }, 2000);
  });
  $('url').addEventListener('focus', (e) => e.target.select());

  renderAll();
  loadPackages(true);
}

/**
 * The configure page: one self-contained HTML string (inline CSS and JS).
 * @returns {{ render(user: import('./userConfig.js').UserConfig | null, lang: 'en' | 'es'): string }}
 */
export function createPage() {
  const strings = { en: pageStrings('en'), es: pageStrings('es') };
  const play = { en: t('en', 'play'), es: t('es', 'play') };

  return {
    render(user, lang) {
      const pageLang = user ? user.lang : lang === 'es' ? 'es' : 'en';
      const s = strings[pageLang];
      const boot = {
        country: user ? user.country : DEFAULT_COUNTRY,
        lang: pageLang,
        services: user ? user.services : [],
        countries: COUNTRIES,
        strings,
        play,
      };
      const txt = (key) => esc(s[key]);
      return `<!doctype html>
<html lang="${pageLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:,">
<title>WatchHere</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <span class="brand"><i aria-hidden="true"></i>WatchHere</span>
  <div class="langs" id="langs" role="group" aria-label="${txt('page_language')}">
    <button type="button" data-lang="es" aria-pressed="${pageLang === 'es'}">ES</button>
    <button type="button" data-lang="en" aria-pressed="${pageLang === 'en'}">EN</button>
  </div>
</header>

<h1 data-i18n="page_title">${txt('page_title')}</h1>
<p class="lead" data-i18n="page_lead">${txt('page_lead')}</p>

<section class="panel" aria-labelledby="previewTitle">
  <p class="ptitle" id="previewTitle" data-i18n="page_previewTitle">${txt('page_previewTitle')}</p>
  <ol class="rows" id="preview"></ol>
  <p class="empty" id="previewEmpty" data-i18n="page_previewEmpty">${txt('page_previewEmpty')}</p>
</section>

<section>
  <label class="label-l" for="country" data-i18n="page_country">${txt('page_country')}</label>
  <select class="field" id="country"></select>
  <p class="notice" id="notice" role="status"></p>
</section>

<section id="yours" aria-labelledby="yoursTitle" hidden>
  <h2 id="yoursTitle" data-i18n="page_yours">${txt('page_yours')}</h2>
  <ol class="rows lineup" id="lineup"></ol>
</section>

<section aria-labelledby="addTitle">
  <h2 id="addTitle" data-i18n="page_add">${txt('page_add')}</h2>
  <input class="field" id="search" type="search" autocomplete="off" placeholder="${txt('page_search')}" aria-label="${txt('page_search')}">
  <div class="grid" id="tiles"></div>
  <p class="status" id="status" role="status"></p>
</section>

<section class="panel install" aria-label="${txt('page_install')}">
  <a class="btn main" id="stremio" data-i18n="page_install" aria-disabled="true">${txt('page_install')}</a>
  <p class="small" id="need" data-i18n="page_previewEmpty">${txt('page_previewEmpty')}</p>
  <div class="urlrow" id="urlrow" hidden>
    <textarea id="url" rows="2" readonly spellcheck="false" aria-label="${txt('page_urlLabel')}"></textarea>
    <button class="btn ghost" id="copy" type="button" aria-live="polite" data-i18n="page_copy">${txt('page_copy')}</button>
  </div>
  <p class="small" data-i18n="page_nuvio">${txt('page_nuvio')}</p>
</section>

<footer class="small" data-i18n="page_footer">${txt('page_footer')}</footer>
</main>
<script type="application/json" id="boot">${safeJson(boot)}</script>
<script>(${client.toString()})();</script>
</body>
</html>
`;
    },
  };
}
