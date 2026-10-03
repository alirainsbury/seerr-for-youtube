// Seerr for YouTube — background service worker.
// All Seerr and Plex calls happen here so they aren't blocked by YouTube's CORS / mixed-content
// rules (a LAN Seerr on plain http works fine from the service worker).
//
// Auth: the extension uses the person's own Seerr session (the same cookie Seerr's website uses),
// created by signing in with Plex or on the Seerr site. It never holds a password or API key.
// Seerr is only ever reached at its https web address.

importScripts('net.js');
const { isAllowedServer, originPattern } = self.SeerrNet;

const SYNC_DEFAULTS = { url: '', trailersOnly: false, serverType: '', serverTitle: '' };
const EXTENSION_BASE = chrome.runtime.getURL(''); // "chrome-extension://<id>/"
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const PLEX_PRODUCT = 'Seerr for YouTube';
const PLEX_WINDOW = { width: 600, height: 720 };
const RECONNECT = 'Seerr for YouTube now connects only through your Seerr’s https web address. Open settings and enter it, like seerr.example.com.';

// Errors carry a code (+ params) that the YouTube side and settings page translate; the English
// message is only a fallback. "detail" is Seerr's own error text, shown as-is.
function fail(code, message, params, detail) {
  const e = new Error(message);
  e.code = code;
  if (params) e.params = params;
  if (detail) e.detail = detail;
  return e;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getConfig() {
  const cfg = await chrome.storage.sync.get(SYNC_DEFAULTS);
  cfg.url = String(cfg.url || '').trim().replace(/\/+$/, '');
  return cfg;
}

async function hasHost(url) {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(url)] });
  } catch {
    return false;
  }
}

// Seerr rejects some reserved characters in the search query unless they're percent-encoded.
function encodeQuery(q) {
  return encodeURIComponent(q).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// ------------------------------------------------------------------ Seerr API

async function raw(path, { method = 'GET', body, cfg } = {}) {
  cfg = cfg || (await getConfig());
  if (!cfg.url) throw fail('not_configured', 'Add your Seerr server in the extension settings.');
  if (!isAllowedServer(cfg.url)) throw fail('reconnect', RECONNECT);
  if (!(await hasHost(cfg.url))) {
    throw fail('no_permission', 'Chrome needs permission to reach your Seerr server. Open settings and connect again.');
  }

  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(`${cfg.url}/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal: ctrl.signal,
    });
  } catch {
    throw fail('network', `Can’t reach Seerr at ${cfg.url}. Check the address and that the server is running.`, { url: cfg.url });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // An HTML page here usually means a login proxy (Authelia, Authentik…) or a wrong address.
    throw fail('bad_response', 'Seerr sent back a web page instead of data. Check the address, or let /api through your login proxy.');
  }

  if (!res.ok) {
    const message = data?.message || data?.error || '';
    if (/csrf/i.test(message)) {
      throw fail('csrf', 'Seerr’s CSRF protection blocks extensions. Ask the server owner to turn it off in Seerr under Settings → Network.');
    }
    if (res.status === 401 || res.status === 403) {
      let e;
      if (res.status === 401) e = fail('signed_out', 'You’re signed out of Seerr.');
      else e = fail('forbidden', message || 'Seerr refused the request.', null, message);
      e.status = res.status;
      throw e;
    }
    throw fail('http', message || `Seerr returned an error (${res.status}).`, { status: res.status }, message);
  }
  return data;
}

// Seerr answers 403 both for "not signed in" and "signed in but not allowed", so on a 403
// check the session before deciding which one it is.
async function api(path, opts = {}) {
  try {
    return await raw(path, opts);
  } catch (e) {
    if (e.code === 'forbidden') {
      let me;
      try {
        me = await getMe();
      } catch {
        throw e; // couldn't check; report the original error
      }
      if (!me) throw fail('signed_out', 'You’re signed out of Seerr.');
    }
    if (e.code === 'signed_out') await chrome.storage.local.remove('account');
    throw e;
  }
}

// Only load avatars from the Seerr server, Plex or Gravatar (Seerr's default for local accounts),
// so a crafted profile can't make the settings page load an image from anywhere else.
function safeAvatar(avatar, serverUrl) {
  if (!avatar) return '';
  try {
    const u = new URL(avatar, serverUrl + '/');
    const okHost = u.origin === new URL(serverUrl).origin
      || /(^|\.)plex\.tv$/.test(u.hostname) || /(^|\.)gravatar\.com$/.test(u.hostname);
    return okHost && /^https?:$/.test(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

function publicUser(user, url) {
  if (!user) return null;
  const avatar = safeAvatar(user.avatar, url);
  return {
    id: user.id,
    name: user.displayName || user.username || user.plexUsername || user.jellyfinUsername || user.email || 'Seerr user',
    email: user.email || '',
    avatar,
  };
}

async function getMe() {
  const cfg = await getConfig();
  try {
    const user = publicUser(await raw('/auth/me', { cfg }), cfg.url);
    await chrome.storage.local.set({ account: { name: user.name } }); // YouTube tabs only need the name
    return user;
  } catch (e) {
    if (e.code === 'signed_out' || e.code === 'forbidden') {
      await chrome.storage.local.remove('account');
      return null;
    }
    throw e;
  }
}

async function serverInfo() {
  const cfg = await getConfig();
  let data;
  try {
    data = await raw('/settings/public', { cfg });
  } catch (e) {
    if (e.code === 'http' || e.code === 'bad_response') {
      throw fail('not_seerr', 'That address doesn’t look like a Seerr server. Use the address you open Seerr at.');
    }
    throw e;
  }
  if (!data || typeof data !== 'object' || !('applicationTitle' in data || 'initialized' in data)) {
    throw fail('not_seerr', 'That address doesn’t look like a Seerr server. Use the address you open Seerr at.');
  }
  // 1 Plex, 2 Jellyfin, 3 Emby. Older Overseerr doesn't send it and is always Plex.
  const serverType = { 1: 'plex', 2: 'jellyfin', 3: 'emby' }[data.mediaServerType] || 'plex';
  const serverTitle = data.applicationTitle || 'Seerr';
  await chrome.storage.sync.set({ serverType, serverTitle });
  return { serverType, serverTitle };
}

async function signOut() {
  try {
    await raw('/auth/logout', { method: 'POST' });
  } catch { /* already signed out */ }
  await chrome.storage.local.remove('account');
  return true;
}

// ------------------------------------------------------------------ Plex sign-in
// Same PIN flow Seerr's own "Sign in with Plex" button uses:
// create a PIN on plex.tv → person approves it in a Plex window → we receive a Plex token →
// Seerr exchanges the token for a normal Seerr session.

async function plexClientId() {
  let { plexClientId: id } = await chrome.storage.local.get('plexClientId');
  if (!id) {
    id = crypto.randomUUID();
    await chrome.storage.local.set({ plexClientId: id });
  }
  return id;
}

function plexHeaders(clientId) {
  return {
    Accept: 'application/json',
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Version': chrome.runtime.getManifest().version,
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Platform': 'Chrome',
    'X-Plex-Device': 'Browser extension',
    'X-Plex-Device-Name': PLEX_PRODUCT,
    'X-Plex-Model': 'Plex OAuth',
  };
}

function plexAuthUrl(clientId, code) {
  const params = {
    clientID: clientId,
    'context[device][product]': PLEX_PRODUCT,
    'context[device][version]': chrome.runtime.getManifest().version,
    'context[device][platform]': 'Chrome',
    'context[device][device]': 'Browser extension',
    'context[device][deviceName]': PLEX_PRODUCT,
    'context[device][model]': 'Plex OAuth',
    'context[device][layout]': 'desktop',
    code,
  };
  const query = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `https://app.plex.tv/auth/#!?${query}`;
}

let plexFlow = null;

function signInWithPlex(position) {
  if (plexFlow) {
    if (plexFlow.windowId) chrome.windows.update(plexFlow.windowId, { focused: true }).catch(() => {});
    return plexFlow.promise;
  }
  const flow = { windowId: null, cancelled: false };
  plexFlow = flow;

  flow.promise = (async () => {
    const cfg = await getConfig();
    if (!cfg.url) throw fail('not_configured', 'Add your Seerr server in the extension settings first.');
    if (!(await hasHost(cfg.url))) throw fail('no_permission', 'Chrome needs permission to reach your Seerr server. Open settings and connect again.');
    if (!isAllowedServer(cfg.url)) throw fail('reconnect', RECONNECT);

    const clientId = await plexClientId();
    const headers = plexHeaders(clientId);

    let pin;
    try {
      const res = await fetch('https://plex.tv/api/v2/pins?strong=true', { method: 'POST', headers });
      if (!res.ok) throw new Error();
      pin = await res.json();
    } catch {
      throw fail('plex_unreachable', 'Couldn’t reach Plex. Check your connection and try again.');
    }

    const win = await chrome.windows.create({
      url: plexAuthUrl(clientId, pin.code),
      type: 'popup',
      focused: true,
      ...PLEX_WINDOW,
      ...(position && Number.isFinite(position.left) ? { left: Math.max(0, Math.round(position.left)), top: Math.max(0, Math.round(position.top)) } : {}),
    });
    flow.windowId = win.id;

    const deadline = Date.now() + 5 * 60 * 1000;
    let token = null;
    while (!token) {
      await sleep(1200);
      if (flow.cancelled) throw fail('cancelled', 'Sign-in cancelled.');
      if (Date.now() > deadline) throw fail('signin_timeout', 'Sign-in timed out. Try again.');
      // Also keeps the service worker awake while we wait, and notices if the window was closed.
      try {
        await chrome.windows.get(win.id);
      } catch {
        throw fail('cancelled', 'Sign-in cancelled.');
      }
      try {
        const res = await fetch(`https://plex.tv/api/v2/pins/${pin.id}`, { headers });
        if (res.status === 404) throw fail('plex_expired', 'The Plex sign-in expired. Try again.');
        if (res.ok) token = (await res.json()).authToken || null;
      } catch (e) {
        if (e.code) throw e; // network blips: keep polling
      }
    }
    chrome.windows.remove(win.id).catch(() => {});

    let user;
    try {
      user = await raw('/auth/plex', { method: 'POST', body: { authToken: token }, cfg });
    } catch (e) {
      if (e.code === 'forbidden' || e.code === 'signed_out' || e.status === 403) {
        throw fail('no_access', 'Your Plex account doesn’t have access to this Seerr server yet. Ask the server owner to add you.');
      }
      throw e;
    }

    const account = publicUser(user, cfg.url);
    await chrome.storage.local.set({ account: { name: account.name } });
    return account;
  })().finally(() => {
    if (flow.windowId) chrome.windows.remove(flow.windowId).catch(() => {});
    if (plexFlow === flow) plexFlow = null;
  });

  return flow.promise;
}

function cancelSignIn() {
  if (!plexFlow) return false;
  plexFlow.cancelled = true;
  if (plexFlow.windowId) chrome.windows.remove(plexFlow.windowId).catch(() => {});
  return true;
}

// ------------------------------------------------------------------ posters
// The page can't load image.tmdb.org itself (Chrome blocks that cross-site load from a content
// script), so posters are fetched here and handed over as base64. Nothing is kept afterwards:
// the YouTube tab holds the (small, capped) cache, and this worker is shut down when idle anyway.

const POSTER_SIZES = new Set(['w92', 'w154']);
const posterJobs = new Map(); // only requests in flight, so two asks for one poster share a download

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function getPoster(path, size) {
  if (!POSTER_SIZES.has(size)) size = 'w92';
  if (typeof path !== 'string' || !/^\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(path)) return Promise.resolve(null);
  const key = size + path;
  if (posterJobs.has(key)) return posterJobs.get(key);
  const job = (async () => {
    try {
      const res = await fetch(`https://image.tmdb.org/t/p/${size}${path}`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) return null;
      const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (!type.startsWith('image/')) return null;
      return { type, data: toBase64(await res.arrayBuffer()) };
    } catch {
      return null;
    }
  })().finally(() => posterJobs.delete(key));
  posterJobs.set(key, job);
  return job;
}

// ------------------------------------------------------------------ getting back to YouTube
// YouTube tabs announce themselves when they're shown, so settings can return people to the
// video they came from. No "tabs" permission needed: we only ever use the tab's id.

async function rememberYouTubeTab(tab) {
  if (tab?.id == null) return;
  await chrome.storage.session.set({ youtubeTab: { id: tab.id, windowId: tab.windowId } });
}

async function forgetYouTubeTab(tab) {
  const { youtubeTab } = await chrome.storage.session.get('youtubeTab');
  if (youtubeTab && youtubeTab.id === tab?.id) await chrome.storage.session.remove('youtubeTab');
}

async function findYouTubeTab() {
  const { youtubeTab } = await chrome.storage.session.get('youtubeTab');
  if (!youtubeTab) return null;
  try {
    return await chrome.tabs.get(youtubeTab.id);
  } catch {
    await chrome.storage.session.remove('youtubeTab');
    return null;
  }
}

async function backToYouTube(sender) {
  const closeTabId = sender?.tab?.id;
  const tab = await findYouTubeTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: 'https://www.youtube.com/' });
  }
  if (closeTabId != null && closeTabId !== tab?.id) chrome.tabs.remove(closeTabId).catch(() => {});
  return true;
}

// ------------------------------------------------------------------ messages
// Content scripts run inside YouTube's page, so they're treated as less trusted than the
// extension's own pages: they get a short list of actions, and every input is checked.

const YOUTUBE_ACTIONS = new Set([
  'search', 'details', 'request', 'poster', 'signInWithPlex', 'cancelSignIn',
  'youtubeHere', 'youtubeGone', 'openOptions',
]);

function allowed(type, sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  // Our own pages (settings): everything. Checked by URL prefix, which can't be spoofed by a page.
  if (!sender.tab?.url?.startsWith('https://') && typeof sender.url === 'string' && sender.url.startsWith(EXTENSION_BASE)) return true;
  return sender.origin === YOUTUBE_ORIGIN && !!sender.tab && YOUTUBE_ACTIONS.has(type);
}

const isMediaType = (t) => t === 'movie' || t === 'tv';
const isId = (n) => Number.isSafeInteger(n) && n > 0;

function invalid() {
  return fail('invalid', 'The extension sent a request it shouldn’t have. Reload the page.');
}

async function handle(msg, sender) {
  switch (msg?.type) {
    case 'search': {
      const query = typeof msg.query === 'string' ? msg.query.trim() : '';
      if (!query || query.length > 200) throw invalid();
      // The trailer's language, so results come back titled the way the trailer names them.
      const language = ['en', 'ja', 'ko', 'ar'].includes(msg.language) ? `&language=${msg.language}` : '';
      const data = await api(`/search?query=${encodeQuery(query)}&page=1${language}`);
      return (data?.results || []).filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv');
    }
    case 'details':
      if (!isMediaType(msg.mediaType) || !isId(msg.id)) throw invalid();
      return api(`/${msg.mediaType}/${msg.id}`);

    case 'request': {
      if (!isMediaType(msg.mediaType) || !isId(msg.id)) throw invalid();
      const body = { mediaType: msg.mediaType, mediaId: msg.id };
      if (msg.mediaType === 'tv') {
        const seasons = Array.isArray(msg.seasons) ? [...new Set(msg.seasons)] : [];
        if (!seasons.length || seasons.length > 100 || !seasons.every((n) => isId(n) && n < 1000)) throw invalid();
        body.seasons = seasons;
        if (msg.tvdbId != null) {
          if (!isId(msg.tvdbId)) throw invalid();
          body.tvdbId = msg.tvdbId;
        }
      }
      return api('/request', { method: 'POST', body });
    }

    case 'serverInfo':
      return serverInfo();
    case 'me':
      return getMe();
    case 'signInWithPlex':
      return signInWithPlex(msg.position && { left: Number(msg.position.left), top: Number(msg.position.top) });
    case 'cancelSignIn':
      return cancelSignIn();
    case 'signOut':
      return signOut();

    case 'poster':
      return getPoster(msg.path, msg.size);

    case 'youtubeHere':
      await rememberYouTubeTab(sender?.tab);
      return true;
    case 'youtubeGone':
      await forgetYouTubeTab(sender?.tab);
      return true;
    case 'hasYouTubeTab':
      return !!(await findYouTubeTab());
    case 'backToYouTube':
      return backToYouTube(sender);

    case 'openOptions':
      await chrome.runtime.openOptionsPage();
      return true;

    default:
      throw fail('unknown', 'Unknown message.');
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !allowed(msg.type, sender)) {
    sendResponse({ ok: false, error: { code: 'forbidden_sender', message: 'Not allowed.' } });
    return false;
  }
  handle(msg, sender).then(
    (data) => sendResponse({ ok: true, data }),
    (e) => sendResponse({ ok: false, error: { code: e.code || 'unknown', message: e.message, params: e.params, detail: e.detail } }),
  );
  return true; // keep the channel open for the async response
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const cfg = await getConfig();
  if (!cfg.url) chrome.runtime.openOptionsPage();
});
