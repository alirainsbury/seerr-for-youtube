// Seerr for YouTube — content script.
// Adds a button next to Subscribe on watch pages. Clicking it finds the trailer's movie or show
// on your Seerr server and lets you request it (and pick seasons for shows) without leaving YouTube.
//
// Note: YouTube enforces Trusted Types, so this file never uses innerHTML; all DOM is built by hand.
//
// Security: the button and popover live in *closed* shadow roots. YouTube's scripts (and anything
// injected into the page) can see that a host element exists, but can't read what's inside —
// your name, your Seerr address, what's in your library — or reach in to click "Request".
// Handlers also ignore synthetic events, so only real clicks and key presses do anything.
(() => {
  'use strict';
  if (window.__seerrForYouTube) return;
  window.__seerrForYouTube = true;

  const { parseTitle, detectGame, detectLang, scoreResult } = window.SeerrMatch;
  const I = window.SeerrI18n;
  const t = I.t;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CONFIDENT = 55; // minimum match score before the button shows a status for the auto match

  const ICONS = {
    film: 'M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
    plus: 'M12 5v14M5 12h14',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
    sparkles: 'M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6zM17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5V12l3 2',
    external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.8-4.8',
  };

  const CHIP_KEY = {
    available: 'status_available',
    partial: 'status_partial',
    requested: 'status_requested',
    blocked: 'status_blocked',
  };

  let cfg = { configured: false, url: '', trailersOnly: false, serverType: 'plex', account: null };
  let state = blankState(null, '');
  let btn = null;      // the button, inside btnHost's closed shadow root
  let btnHost = null;
  let pop = null;      // the popover, inside popHost's closed shadow root
  let popHost = null;
  let popRoot = null;

  const trusted = (e) => e.isTrusted; // real user input only, never page-dispatched events

  // A host element with a closed shadow root holding our styles and content.
  function shadowHost(tag, cls, content) {
    const host = document.createElement(tag);
    host.className = cls;
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = window.SeerrStyles;
    root.append(style, content);
    return { host, root };
  }

  // ---------------------------------------------------------------- helpers

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), (e) => { if (trusted(e)) v(e); });
        }
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }

  function icon(name, size = 24, stroke = 1.75, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs = {
      viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
      'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    };
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
    if (cls) svg.setAttribute('class', cls); // e.g. "sy-flip": arrows that point the other way in Arabic
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  const spinner = (small) => h('span', { class: 'sy-spin' + (small ? ' is-small' : ''), 'aria-hidden': 'true' });
  const nameOf = (item) => item.title || item.name || t('untitled');
  const yearOf = (item) => String(item.releaseDate || item.firstAirDate || '').slice(0, 4);
  const metaLine = (item) => [yearOf(item), t(item.mediaType === 'tv' ? 'type_tv' : 'type_movie')].filter(Boolean).join(' · ');

  function send(msg) {
    return new Promise((resolve, reject) => {
      const stale = () => {
        const e = new Error(t('err_stale'));
        e.code = 'stale';
        reject(e);
      };
      try {
        if (!chrome.runtime?.id) return stale();
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError || !res) return stale();
          if (res.ok) return resolve(res.data);
          const e = new Error(res.error.message);
          Object.assign(e, { code: res.error.code, params: res.error.params, detail: res.error.detail });
          reject(e);
        });
      } catch {
        stale();
      }
    });
  }

  function openSettings() {
    send({ type: 'openOptions' }).catch(() => {});
  }

  function openSeerrLogin() {
    window.open(`${cfg.url}/login`, '_blank', 'noopener');
  }

  const canPrefetch = () => cfg.configured && !!cfg.account;

  // ---------------------------------------------------------------- Seerr status logic

  // Seerr media status codes: 1 unknown, 2 pending, 3 processing, 4 partially available,
  // 5 available, 6 blocklisted, 7 deleted.
  function mediaState(info) {
    switch (info?.status) {
      case 5: return 'available';
      case 4: return 'partial';
      case 2:
      case 3: return 'requested';
      case 6: return 'blocked';
      default: return 'none';
    }
  }

  function seasonList(details) {
    const known = new Map();
    for (const ms of details?.mediaInfo?.seasons || []) {
      if (ms.status === 5) known.set(ms.seasonNumber, 'available');
      else if (ms.status === 4) known.set(ms.seasonNumber, 'partial');
      else if (ms.status === 2 || ms.status === 3) known.set(ms.seasonNumber, 'requested');
    }
    for (const req of details?.mediaInfo?.requests || []) {
      if (req.is4k || req.status === 3) continue; // ignore 4K and declined requests
      for (const rs of req.seasons || []) {
        if (!known.has(rs.seasonNumber)) known.set(rs.seasonNumber, 'requested');
      }
    }
    return (details?.seasons || [])
      .filter((s) => s.seasonNumber > 0)
      .map((s) => ({
        number: s.seasonNumber,
        name: seasonName(s),
        episodes: s.episodeCount || 0,
        airDate: s.airDate,
        state: known.get(s.seasonNumber) || 'none',
      }));
  }

  // TMDB's "Season 2" comes in the Seerr server's language; use ours instead. Real names stay.
  function seasonName(s) {
    const n = s.seasonNumber;
    const generic = !s.name || (s.name.length <= 20 && new RegExp(`(^|\\D)${n}(\\D|$)`).test(s.name));
    return generic ? t('season_n', { n }) : s.name;
  }

  function episodeLabel(se) {
    const upcoming = !se.airDate || new Date(se.airDate) > new Date();
    if (upcoming && !se.episodes) return t('upcoming');
    const eps = t('episodes', { count: se.episodes });
    return upcoming ? t('episodes_upcoming', { episodes: eps }) : eps;
  }

  // ---------------------------------------------------------------- state

  function blankState(videoId, title) {
    const parsed = parseTitle(title);
    return {
      videoId, title, parsed,
      query: parsed.query, draft: null,
      results: [], selected: null, confident: false,
      loading: false, searched: false, error: null,
      details: null, detailsFor: null, detailsLoading: false, detailsError: null,
      picks: new Set(), submitting: false, notice: null,
      signingIn: false, signInError: null,
      // Video game check: title, channel and YouTube's game card. "manual" means the person
      // searched or picked something themselves, which overrides the game check.
      channel: null, hasGameCard: false, game: { isGame: false, score: 0 }, manual: false,
    };
  }

  const looksLikeGame = (s) => s.game.isGame && !s.manual;

  // YouTube's "game" box under the description (new and older page layouts).
  const GAME_CARD = 'ytd-watch-metadata ytd-video-description-gaming-section-renderer, ytd-watch-metadata ytd-rich-metadata-row-renderer';

  function readGameSignals(s) {
    const channel = document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent?.trim() || '';
    const hasGameCard = !!document.querySelector(GAME_CARD);
    if (channel === s.channel && hasGameCard === s.hasGameCard) return false;
    s.channel = channel;
    s.hasGameCard = hasGameCard;
    s.game = detectGame({ title: s.title, channel, hasGameCard });
    return true;
  }

  async function runSearch(s, query, auto = false) {
    if (!auto) s.manual = true;
    s.query = query;
    s.draft = null;
    s.loading = true;
    s.error = null;
    s.notice = null;
    updateButton();
    render();
    try {
      let used = query;
      // Search in the trailer's language so results are titled the way the trailer names them.
      const language = (auto ? s.parsed.lang : detectLang(query)) || undefined;
      let results = await send({ type: 'search', query, language });
      // "Stranger Things 5" → retry as "Stranger Things", and remember 5 as a likely season.
      const m = query.match(/^(.*\S)\s+(\d{1,2})$/);
      if (!results.length && auto && m) {
        used = m[1];
        results = await send({ type: 'search', query: used, language });
        s.parsed.hint.trailingNumber = Number(m[2]);
      }
      if (s !== state) return;
      const ranked = results
        .map((r) => ({ r, score: scoreResult(r, used, s.parsed.hint) }))
        .sort((a, b) => b.score - a.score);
      s.results = ranked.slice(0, 6).map((x) => x.r);
      s.selected = s.results[0] || null;
      s.confident = !!ranked[0] && (!auto || ranked[0].score >= CONFIDENT);
    } catch (e) {
      if (s !== state) return;
      s.error = e;
    }
    s.loading = false;
    s.searched = true;
    s.details = null;
    s.detailsFor = null;
    s.picks = new Set();
    updateButton();
    render();
    if (s.selected && pop) loadDetails(s, s.selected);
  }

  async function loadDetails(s, item, force = false) {
    if (!force && s.detailsFor === item && (s.details || s.detailsLoading)) return;
    s.detailsFor = item;
    s.detailsLoading = true;
    s.detailsError = null;
    if (!force) s.details = null;
    render();
    try {
      const d = await send({ type: 'details', mediaType: item.mediaType, id: item.id });
      if (s !== state || s.detailsFor !== item) return;
      s.details = d;
      item.mediaInfo = d.mediaInfo;
      if (item.mediaType === 'tv') {
        s.picks = new Set();
        if (!force) {
          // Preselect the season the trailer is for, when it can still be requested.
          const want = s.parsed.hint.season || s.parsed.hint.trailingNumber;
          if (want && seasonList(d).some((x) => x.number === want && x.state === 'none')) s.picks.add(want);
        }
      }
    } catch (e) {
      if (s !== state || s.detailsFor !== item) return;
      s.detailsError = e;
    }
    s.detailsLoading = false;
    updateButton();
    render();
  }

  function select(s, item) {
    s.manual = true;
    s.selected = item;
    s.confident = true;
    s.picks = new Set();
    s.notice = null;
    s.details = null;
    s.detailsFor = null;
    updateButton();
    render();
    if (pop) pop.scrollTop = 0;
    loadDetails(s, item);
  }

  async function submit(s) {
    const item = s.selected;
    if (!item || s.submitting) return;
    const payload = { type: 'request', mediaType: item.mediaType, id: item.id };
    if (item.mediaType === 'tv') {
      payload.seasons = [...s.picks].sort((a, b) => a - b);
      if (!payload.seasons.length) return;
      const tvdbId = s.details?.externalIds?.tvdbId;
      if (tvdbId) payload.tvdbId = tvdbId;
    }
    s.submitting = true;
    s.notice = null;
    render();
    try {
      const req = await send(payload);
      if (s !== state) return;
      s.notice = {
        kind: 'ok',
        text: t(req?.status === 2 ? 'notice_approved' : 'notice_pending'),
      };
      if (item.mediaType === 'movie') item.mediaInfo = { ...(item.mediaInfo || {}), status: 2 };
      s.submitting = false;
      await loadDetails(s, item, true);
    } catch (e) {
      if (s !== state) return;
      s.notice = { kind: 'error', text: I.errText(e) };
    }
    s.submitting = false;
    updateButton();
    render();
  }

  // ---------------------------------------------------------------- the button

  function updateButton() {
    if (!btn) return;
    const s = state;
    // "Only on trailers" also hides it on video game trailers.
    btn.hidden = cfg.trailersOnly && (!s.parsed.isTrailer || looksLikeGame(s));
    if (btnHost) btnHost.hidden = btn.hidden;

    let ic = 'sparkles';
    let label = 'Seerr';
    let look = 'neutral';
    let tip = t('tip_default');
    let busy = false;

    if (!cfg.configured) {
      tip = t('tip_setup');
    } else if (looksLikeGame(s)) {
      tip = t('tip_game');
    } else if (s.error?.code === 'signed_out' || (!cfg.account && !s.searched)) {
      tip = t('tip_signin');
    } else if (s.loading) {
      busy = true;
    } else if (s.selected && s.confident) {
      const name = nameOf(s.selected);
      const st = mediaState(s.selected.mediaInfo);
      if (st === 'available') { ic = 'check'; label = t('btn_available'); look = 'available'; tip = t('tip_available', { name }); }
      else if (st === 'requested') { ic = 'clock'; label = t('btn_requested'); look = 'requested'; tip = t('tip_requested', { name }); }
      else if (st === 'blocked') { tip = t('tip_blocked', { name }); }
      else { ic = 'download'; label = t('btn_request'); look = 'request'; tip = t('tip_request', { name }); }
    }

    btn.title = tip;
    btn.lang = I.lang;
    btn.dataset.state = look;
    btn.replaceChildren(busy ? spinner() : icon(ic, 20, 2), h('span', { dir: I.dir }, label));
  }

  function mountButton() {
    const anchor = document.querySelector('ytd-watch-metadata #owner #subscribe-button');
    if (!anchor) return;
    if (!btn) {
      btn = h('button', {
        id: 'sy-button', class: 'sy-btn', type: 'button',
        'aria-haspopup': 'dialog', 'aria-expanded': 'false',
        onclick: togglePopover,
      });
      btnHost = shadowHost('span', 'sy-host-btn', btn).host;
      updateButton();
    }
    if (!btnHost.isConnected || btnHost.parentElement !== anchor.parentElement) anchor.after(btnHost);
  }

  // ---------------------------------------------------------------- popover

  function togglePopover() {
    pop ? closePopover() : openPopover();
  }

  function openPopover() {
    if (!btn) return;
    pop = h('div', { class: 'sy-pop', role: 'dialog' });
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePopover();
        btn?.focus();
      }
      e.stopPropagation(); // keep YouTube's keyboard shortcuts out of the search field
    });
    ({ host: popHost, root: popRoot } = shadowHost('div', 'sy-host-pop', pop));
    document.body.append(popHost);
    btn.setAttribute('aria-expanded', 'true');
    render();

    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onGlobalKey, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { passive: true });

    const s = state;
    if (cfg.configured && !s.searched && !s.loading && s.query && !looksLikeGame(s)) runSearch(s, s.query, true);
    else if (s.selected) loadDetails(s, s.selected);

    if (!s.query) pop.querySelector('.sy-search-input')?.focus();
  }

  function closePopover() {
    if (!pop) return;
    popHost.remove();
    pop = null;
    popHost = null;
    popRoot = null;
    btn?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onGlobalKey, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position);
  }

  function onOutside(e) {
    const path = e.composedPath();
    // Closed shadow roots hide their insides from composedPath(), so compare the hosts.
    if (pop && !path.includes(popHost) && !path.includes(btnHost)) closePopover();
  }

  function onGlobalKey(e) {
    if (e.key === 'Escape' && pop) closePopover();
  }

  function position() {
    if (!pop || !btn) return;
    const r = btn.getBoundingClientRect();
    if (!r.width) return closePopover();
    const w = pop.offsetWidth;
    // Line up with the button's start edge: its left in English, its right in Arabic.
    const start = I.dir === 'rtl' ? r.right - w : r.left;
    const left = Math.max(12, Math.min(start, window.innerWidth - w - 12));
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    pop.style.left = `${left}px`;
    if (below >= 320 || below >= above) {
      pop.style.top = `${r.bottom + 8}px`;
      pop.style.bottom = 'auto';
      pop.style.maxHeight = `${Math.min(560, below - 8)}px`;
    } else {
      pop.style.top = 'auto';
      pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
      pop.style.maxHeight = `${Math.min(560, above - 8)}px`;
    }
  }

  function render() {
    if (!pop) return;
    const focusKey = popRoot?.activeElement?.getAttribute?.('data-sy-key');
    const scroll = pop.scrollTop;
    pop.lang = I.lang;
    pop.dir = I.dir;
    pop.setAttribute('aria-label', t('tip_default'));
    pop.replaceChildren(...view(state));
    pop.scrollTop = scroll;
    if (focusKey) {
      const el = pop.querySelector(`[data-sy-key="${CSS.escape(focusKey)}"]`);
      if (el && !el.disabled) {
        el.focus();
        if (el.tagName === 'INPUT' && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length);
      }
    }
    position();
  }

  // ---------------------------------------------------------------- views

  function view(s) {
    if (!cfg.configured) {
      return [setupView(t('setup_connect'))];
    }
    if (s.error?.code === 'signed_out' && !s.loading) return [signInView(s)];
    const nodes = [searchView(s)];
    if (looksLikeGame(s) && !s.loading) nodes.push(gameView());
    else if (s.loading) nodes.push(loadingRow(t('searching')));
    else if (s.error) nodes.push(errorView(s.error, () => runSearch(s, s.query)));
    else if (!s.searched) nodes.push(h('div', { class: 'sy-empty' }, t('search_prompt')));
    else if (!s.selected) nodes.push(h('div', { class: 'sy-empty' }, t('no_matches', { query: s.query })));
    else {
      nodes.push(...detailView(s));
      if (s.results.length > 1) nodes.push(othersView(s));
      if (cfg.account) nodes.push(h('div', { class: 'sy-foot' }, t('requesting_as', { name: cfg.account.name })));
    }
    return nodes;
  }

  function gameView() {
    return h('div', { class: 'sy-setup' },
      h('p', { class: 'sy-setup-title' }, t('game_title')),
      h('p', { class: 'sy-setup-text' }, t('game_text')));
  }

  function searchView(s) {
    const input = h('input', {
      class: 'sy-search-input', type: 'text', placeholder: t('search_placeholder'),
      'aria-label': t('search_placeholder'), spellcheck: 'false', autocomplete: 'off', 'data-sy-key': 'search',
    });
    input.value = s.draft ?? s.query;
    input.addEventListener('input', () => { s.draft = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !trusted(e)) return;
      e.preventDefault();
      const q = input.value.trim();
      if (q) runSearch(s, q);
    });
    return h('div', { class: 'sy-search' }, icon('search', 18), input);
  }

  function chip(st, small) {
    if (!CHIP_KEY[st]) return null;
    return h('span', { class: 'sy-chip' + (small ? ' is-small' : ''), 'data-state': st }, t(CHIP_KEY[st]));
  }

  // Posters come from the background worker as base64 (see background.js for why). They're turned
  // straight into binary blobs (a third smaller than the text) and the text is dropped. At most
  // POSTER_CACHE_MAX stay around, so re-renders and reopening the popover are instant without the
  // tab's memory growing over a long session; evicted blobs are released.
  const POSTER_CACHE_MAX = 30;
  const posterUrls = new Map(); // "size/path" → blob: URL, oldest first
  const posterJobs = new Map(); // requests in flight, so redraws don't ask twice

  function cachePoster(key, url) {
    posterUrls.delete(key);
    posterUrls.set(key, url);
    while (posterUrls.size > POSTER_CACHE_MAX) {
      const [oldKey, oldUrl] = posterUrls.entries().next().value;
      posterUrls.delete(oldKey);
      URL.revokeObjectURL(oldUrl);
    }
  }

  function clearPosters() {
    for (const url of posterUrls.values()) URL.revokeObjectURL(url);
    posterUrls.clear();
  }

  function toBlobUrl({ type, data }) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type }));
  }

  // size: 'w154' for the main poster (shown 64px wide), 'w92' for thumbnails (32px wide).
  // Both are enough for sharp images on high-resolution screens.
  function poster(path, cls, size = 'w92') {
    const empty = () => h('div', { class: `${cls} sy-poster-empty`, 'aria-hidden': 'true' }, icon('film', 20));
    if (!path) return empty();
    const key = `${size}${path}`;
    const img = () => {
      const el = h('img', { class: cls, alt: '' });
      el.src = posterUrls.get(key);
      return el;
    };
    if (posterUrls.has(key)) {
      cachePoster(key, posterUrls.get(key)); // mark as recently used
      return img();
    }
    const slot = empty();
    if (!posterJobs.has(key)) {
      posterJobs.set(key, send({ type: 'poster', path, size })
        .then((res) => { if (res && !posterUrls.has(key)) cachePoster(key, toBlobUrl(res)); })
        .catch(() => {})
        .finally(() => posterJobs.delete(key)));
    }
    posterJobs.get(key).then(() => {
      if (slot.isConnected && posterUrls.has(key)) slot.replaceWith(img());
    });
    return slot;
  }

  function detailView(s) {
    const item = s.selected;
    const st = mediaState(item.mediaInfo);
    const nodes = [
      h('div', { class: 'sy-head' },
        poster(item.posterPath, 'sy-poster', 'w154'),
        h('div', { class: 'sy-head-text' },
          h('div', { class: 'sy-title' }, nameOf(item)),
          h('div', { class: 'sy-meta' }, metaLine(item)),
          chip(st))),
    ];
    if (item.overview) nodes.push(h('p', { class: 'sy-overview' }, item.overview));
    if (item.mediaType === 'tv') nodes.push(seasonsView(s));
    nodes.push(actionsView(s, item, st));
    if (s.notice) nodes.push(noticeView(s.notice));
    else if (s.detailsError && item.mediaType !== 'tv') nodes.push(noticeView({ kind: 'error', text: I.errText(s.detailsError) }));
    return nodes;
  }

  function seasonsView(s) {
    if (s.detailsError) return noticeView({ kind: 'error', text: I.errText(s.detailsError) });
    if (!s.details || s.detailsFor !== s.selected) return loadingRow(t('loading_seasons'));

    const seasons = seasonList(s.details);
    if (!seasons.length) return h('div', { class: 'sy-empty' }, 'No seasons listed yet.');

    const open = seasons.filter((x) => x.state === 'none');
    const allPicked = open.length > 0 && open.every((x) => s.picks.has(x.number));
    const busy = s.submitting;

    return h('div', { role: 'group', 'aria-label': t('seasons') },
      h('div', { class: 'sy-section-label' }, t(open.length ? 'choose_seasons' : 'seasons')),
      open.length > 1 ? seasonRow({
        key: 'all', label: t('all_seasons'), checked: allPicked, disabled: busy,
        onChange: () => { s.picks = allPicked ? new Set() : new Set(open.map((x) => x.number)); render(); },
      }) : null,
      open.length > 1 ? h('div', { class: 'sy-divider' }) : null,
      seasons.map((se) => seasonRow({
        key: `s${se.number}`,
        label: se.name,
        sub: se.state === 'none' ? episodeLabel(se) : null,
        chip: chip(se.state, true),
        checked: se.state === 'none' ? s.picks.has(se.number) : true,
        disabled: se.state !== 'none' || busy,
        locked: se.state !== 'none',
        onChange: () => {
          if (s.picks.has(se.number)) s.picks.delete(se.number);
          else s.picks.add(se.number);
          render();
        },
      })));
  }

  function seasonRow({ key, label, sub, chip: chipEl, checked, disabled, locked, onChange }) {
    const input = h('input', { type: 'checkbox', class: 'sy-check-input', 'data-sy-key': key });
    input.checked = !!checked;
    input.disabled = !!disabled;
    input.addEventListener('change', (e) => { if (trusted(e)) onChange(e); });
    return h('label', { class: 'sy-season' + (locked ? ' is-disabled' : '') },
      h('span', { class: 'sy-check' }, input, h('span', { class: 'sy-check-box' }, icon('check', 14, 3))),
      h('span', { class: 'sy-season-name' }, label),
      sub ? h('span', { class: 'sy-season-sub' }, sub) : null,
      chipEl);
  }

  function actionsView(s, item, st) {
    let label;
    let ic = null;
    let enabled = false;

    if (s.submitting) {
      label = t('requesting');
    } else if (item.mediaType === 'tv') {
      const ready = s.details && s.detailsFor === item;
      const open = ready ? seasonList(s.details).filter((x) => x.state === 'none') : [];
      const n = s.picks.size;
      if (!ready) label = t('btn_request');
      else if (!open.length) {
        const allAvailable = st === 'available';
        label = t(allAvailable ? 'btn_available' : 'btn_requested');
        ic = allAvailable ? 'check' : 'clock';
      } else if (!n) label = t('select_seasons');
      else {
        label = n === 1 ? t('request_season', { n: [...s.picks][0] }) : t('request_seasons', { count: n });
        ic = 'download';
        enabled = true;
      }
    } else if (st === 'none') {
      label = t('btn_request'); ic = 'download'; enabled = true;
    } else if (st === 'requested') {
      label = t('btn_requested'); ic = 'clock';
    } else if (st === 'blocked') {
      label = t('status_blocked');
    } else {
      label = t('btn_available'); ic = 'check';
    }

    const primary = h('button', { class: 'sy-primary', type: 'button', 'data-sy-key': 'primary', onclick: () => submit(s) },
      s.submitting ? spinner(true) : ic ? icon(ic, 20) : null,
      label);
    primary.disabled = !enabled || s.submitting;

    const link = h('a', {
      class: 'sy-link', href: `${cfg.url}/${item.mediaType}/${item.id}`, target: '_blank', rel: 'noopener noreferrer',
    }, t('open_in_seerr'), icon('external', 16, 1.75, 'sy-flip'));

    return h('div', { class: 'sy-actions' }, link, primary);
  }

  function othersView(s) {
    return h('div', { class: 'sy-others' },
      h('div', { class: 'sy-others-label' }, t('other_matches')),
      s.results.filter((r) => r !== s.selected).map((r) =>
        h('button', { class: 'sy-other', type: 'button', onclick: () => select(s, r) },
          poster(r.posterPath, 'sy-poster sy-poster-sm', 'w92'),
          h('span', { class: 'sy-other-text' },
            h('span', { class: 'sy-other-title' }, nameOf(r)),
            h('span', { class: 'sy-meta' }, metaLine(r))),
          chip(mediaState(r.mediaInfo), true))));
  }

  function noticeView({ kind, text }) {
    return h('div', { class: 'sy-notice' + (kind === 'error' ? ' is-error' : ''), role: 'status' },
      kind === 'ok' ? icon('check', 16, 2.25) : null,
      text);
  }

  function loadingRow(text) {
    return h('div', { class: 'sy-empty', role: 'status' }, spinner(), text);
  }

  function setupView(text, isError) {
    return h('div', { class: 'sy-setup' + (isError ? ' is-error' : '') },
      h('p', { class: 'sy-setup-text' }, text),
      h('button', { class: 'sy-secondary', type: 'button', onclick: openSettings }, t('open_settings')));
  }

  function signInView(s) {
    const isPlex = cfg.serverType === 'plex';
    const start = async () => {
      s.signingIn = true;
      s.signInError = null;
      render();
      const w = 600;
      const hgt = 720;
      const position = {
        left: window.screenX + (window.outerWidth - w) / 2,
        top: window.screenY + (window.outerHeight - hgt) / 2,
      };
      try {
        const account = await send({ type: 'signInWithPlex', position });
        if (s !== state) return;
        cfg.account = account;
        s.signingIn = false;
        if (s.query) runSearch(s, s.query, true);
        else { s.error = null; s.searched = false; render(); }
        return;
      } catch (e) {
        if (s !== state) return;
        if (e.code !== 'cancelled') s.signInError = I.errText(e);
      }
      s.signingIn = false;
      render();
    };
    const cancel = () => send({ type: 'cancelSignIn' }).catch(() => {});

    let primary;
    if (!isPlex) {
      primary = h('button', { class: 'sy-primary', type: 'button', 'data-sy-key': 'signin', onclick: openSeerrLogin },
        t('signin_seerr'), icon('external', 18, 1.75, 'sy-flip'));
    } else if (s.signingIn) {
      primary = h('button', { class: 'sy-secondary', type: 'button', 'data-sy-key': 'signin', onclick: cancel }, t('cancel'));
    } else {
      primary = h('button', { class: 'sy-primary', type: 'button', 'data-sy-key': 'signin', onclick: start }, t('signin_plex'));
    }

    return h('div', { class: 'sy-setup' },
      h('p', { class: 'sy-setup-title' }, t('signin_title')),
      h('p', { class: 'sy-setup-text' }, s.signingIn
        ? t('signin_waiting_text')
        : isPlex
          ? t('signin_plex_text')
          : t('signin_site_text')),
      h('div', { class: 'sy-setup-actions' },
        s.signingIn ? h('span', { class: 'sy-waiting' }, spinner(true), t('waiting_plex')) : null,
        primary,
        isPlex && !s.signingIn
          ? h('button', { class: 'sy-text-btn', type: 'button', onclick: openSeerrLogin }, t('other_signin'))
          : null),
      s.signInError ? noticeView({ kind: 'error', text: s.signInError }) : null);
  }

  function errorView(e, retry) {
    if (e.code === 'signed_out') return signInView(state);
    if (['not_configured', 'reconnect', 'no_permission', 'bad_response', 'csrf'].includes(e.code)) return setupView(I.errText(e), true);
    if (e.code === 'stale') return h('div', { class: 'sy-setup is-error' }, h('p', { class: 'sy-setup-text' }, I.errText(e)));
    return h('div', { class: 'sy-setup is-error' },
      h('p', { class: 'sy-setup-text' }, I.errText(e)),
      h('button', { class: 'sy-secondary', type: 'button', onclick: retry }, t('try_again')));
  }

  // ---------------------------------------------------------------- page tracking

  function newVideo(videoId, title) {
    closePopover();
    state = blankState(videoId, title);
    const s = state;
    readGameSignals(s);
    updateButton();
    if (canPrefetch() && s.parsed.isTrailer && s.query && !looksLikeGame(s)) runSearch(s, s.query, true);
  }

  function onGameSignalsChanged(s) {
    updateButton();
    render();
    // Turned out not to be a game after all: do the lookup we skipped.
    if (!looksLikeGame(s) && canPrefetch() && s.parsed.isTrailer && s.query && !s.searched && !s.loading) {
      runSearch(s, s.query, true);
    }
  }

  function tick() {
    if (location.pathname !== '/watch') {
      closePopover();
      btnHost?.remove();
      return;
    }
    mountButton();
    const videoId = new URLSearchParams(location.search).get('v');
    const title = document.querySelector('ytd-watch-metadata #title h1')?.textContent?.trim() || '';
    // YouTube is a single-page app: the URL changes before the title does, so key on both.
    if (videoId && title && (videoId !== state.videoId || title !== state.title)) newVideo(videoId, title);
    // The channel name and YouTube's game card can appear a moment after the title.
    else if (state.videoId === videoId && readGameSignals(state)) onGameSignalsChanged(state);
  }

  // After the extension is reloaded or updated, this copy of the script is cut off from it and
  // Chrome removes its CSS, which would leave an unstyled button behind. Clean up instead.
  function orphaned() {
    try {
      return !chrome.runtime?.id;
    } catch {
      return true;
    }
  }
  function shutDown() {
    clearPosters();
    closePopover();
    btnHost?.remove();
    btn = null;
    btnHost = null;
    observer.disconnect();
    document.removeEventListener('yt-navigate-finish', queueTick);
  }

  // Let the extension know this tab is YouTube, so settings can send people back here.
  function announce(type) {
    if (orphaned()) return;
    try { chrome.runtime.sendMessage({ type }, () => void chrome.runtime.lastError); } catch { /* ignore */ }
  }

  let queued = false;
  function queueTick() {
    if (orphaned()) return shutDown();
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      try { tick(); } catch (e) { console.warn('[Seerr for YouTube]', e); }
    }, 400);
  }

  async function loadConfig() {
    const c = await chrome.storage.sync.get({ url: '', trailersOnly: false, serverType: '' });
    const { account } = await chrome.storage.local.get('account');
    cfg = {
      configured: !!c.url,
      url: String(c.url || '').replace(/\/+$/, ''),
      trailersOnly: !!c.trailersOnly,
      serverType: c.serverType || 'plex',
      account: account || null,
    };
  }

  // Retry a signed-out lookup, e.g. after signing in on the Seerr site or in another tab.
  function retryIfSignedOut() {
    const s = state;
    if (s.error?.code === 'signed_out' && !s.loading && !s.signingIn && s.query) runSearch(s, s.query, true);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    const serverChanged = area === 'sync' && ('url' in changes || 'serverType' in changes);
    loadConfig().then(() => {
      if (serverChanged) {
        state.videoId = null; // new server: start over
        queueTick();
        return;
      }
      if ('account' in changes && changes.account.newValue) retryIfSignedOut();
      updateButton();
      render();
    }).catch(() => {});
  });

  I.onChange(() => { updateButton(); render(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || orphaned()) return;
    announce('youtubeHere');
    retryIfSignedOut();
  });
  window.addEventListener('pagehide', () => announce('youtubeGone'));

  const observer = new MutationObserver(queueTick);
  document.addEventListener('yt-navigate-finish', queueTick);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  Promise.all([loadConfig(), I.ready]).then(queueTick).catch(() => {});
  if (!document.hidden) announce('youtubeHere');
})();
