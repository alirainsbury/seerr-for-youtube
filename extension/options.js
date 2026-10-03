// Seerr for YouTube — settings page.
// Step 1: find the Seerr server by its https web address.
// Step 2: sign in (Plex, or the Seerr site for other account types).

const DEFAULTS = { url: '', trailersOnly: false, serverType: '', serverTitle: '' };
const { parseServerAddress, isAllowedServer, originPattern } = window.SeerrNet;
const $ = (id) => document.getElementById(id);
const I = window.SeerrI18n;
const t = I.t;

let cfg = { ...DEFAULTS };
let accountState = null;

// ------------------------------------------------------------------ helpers

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const spinner = () => el('span', { class: 'spin', 'aria-hidden': 'true' });

async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (!res) throw Object.assign(new Error(t('err_no_response')), { code: 'no_response' });
  if (!res.ok) {
    const e = new Error(res.error.message);
    Object.assign(e, { code: res.error.code, params: res.error.params, detail: res.error.detail });
    throw e;
  }
  return res.data;
}

function setStatus(id, kind, text, busy) {
  const node = $(id);
  if (!node) return;
  node.className = `status ${kind || ''}`;
  node.replaceChildren(...(busy ? [spinner()] : []), ...(text ? [text] : []));
}

async function reloadConfig() {
  cfg = await chrome.storage.sync.get(DEFAULTS);
}

function popupPosition() {
  const w = 600;
  const h = 720;
  return {
    left: window.screenX + (window.outerWidth - w) / 2,
    top: window.screenY + (window.outerHeight - h) / 2,
  };
}

// ------------------------------------------------------------------ steps

function showServerStep() {
  $('step-server').hidden = false;
  $('step-account').hidden = true;
  $('prefs').hidden = true;
  $('url').value = cfg.url && isAllowedServer(cfg.url) ? cfg.url.replace(/^https:\/\//, '') : '';
  setStatus('server-status', '', '');
  $('url').focus();
}

function showAccountStep() {
  $('step-server').hidden = true;
  $('step-account').hidden = false;
  $('prefs').hidden = false;
  $('server-title').textContent = cfg.serverTitle || 'Seerr';
  $('server-url').textContent = cfg.url;
  $('trailersOnly').checked = !!cfg.trailersOnly;
}

$('server-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { url, error } = parseServerAddress($('url').value);
  if (error) {
    setStatus('server-status', 'error', t(error));
    return;
  }

  // Must be the first await so Chrome still treats this as the click's user gesture.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [originPattern(url), 'https://plex.tv/*', 'https://image.tmdb.org/*'] });
  } catch (err) {
    setStatus('server-status', 'error', err.message);
    return;
  }
  if (!granted) {
    setStatus('server-status', 'error', t('err_permission_denied'));
    return;
  }

  $('continue').disabled = true;
  setStatus('server-status', '', t('looking'), true);
  const previous = { url: cfg.url, serverType: cfg.serverType, serverTitle: cfg.serverTitle };
  await chrome.storage.sync.set({ url });
  try {
    await send({ type: 'serverInfo' });
  } catch (err) {
    await chrome.storage.sync.set(previous); // keep the old server if the new one didn't work
    await reloadConfig();
    $('continue').disabled = false;
    setStatus('server-status', 'error', I.errText(err));
    return;
  }

  if (previous.url && previous.url !== url) {
    await chrome.storage.local.remove('account');
    // Give back access to the old server.
    let old = null;
    try { old = originPattern(previous.url); } catch { /* unparseable old address */ }
    if (old && old !== originPattern(url)) await chrome.permissions.remove({ origins: [old] }).catch(() => {});
  }
  await reloadConfig();
  $('continue').disabled = false;
  showAccountStep();
  refreshAccount();
});

$('change-server').addEventListener('click', showServerStep);

// ------------------------------------------------------------------ account

async function refreshAccount({ quiet = false } = {}) {
  if (!quiet) renderAccount({ state: 'checking' });
  try {
    const me = await send({ type: 'me' });
    await reloadConfig();
    if (!me) {
      if (!quiet || accountState !== 'signed_out') renderAccount({ state: 'signed_out' });
    } else {
      renderAccount({ state: 'signed_in', me });
    }
  } catch (err) {
    if (!quiet) renderAccount({ state: 'error', error: err });
  }
}

async function plexSignIn() {
  renderAccount({ state: 'waiting' });
  try {
    const me = await send({ type: 'signInWithPlex', position: popupPosition() });
    renderAccount({ state: 'signed_in', me });
  } catch (err) {
    renderAccount({ state: 'signed_out', error: err.code === 'cancelled' ? null : err });
  }
}

function openSeerrLogin() {
  window.open(`${cfg.url}/login`, '_blank', 'noopener');
  setStatus('signin-status', '', t('opt_waiting_site'), true);
}

async function signOut() {
  renderAccount({ state: 'checking' });
  await send({ type: 'signOut' }).catch(() => {});
  renderAccount({ state: 'signed_out' });
}

function avatarFor(me) {
  const initial = el('span', { class: 'avatar', 'aria-hidden': 'true' }, (me.name || '?').trim().charAt(0).toUpperCase());
  if (!me.avatar) return initial;
  const img = el('img', { class: 'avatar', src: me.avatar, alt: '', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(initial));
  return img;
}

function doneNote() {
  const back = el('button', { type: 'button', class: 'primary', onclick: goBackToYouTube }, t('back_to_youtube'));
  // Fresh installs have no YouTube tab to return to yet, so say what will actually happen.
  send({ type: 'hasYouTubeTab' })
    .then((has) => { if (!has) back.textContent = t('open_youtube'); })
    .catch(() => {});
  return el('div', { class: 'done' },
    el('div', { class: 'done-text' },
      el('strong', null, t('all_set')),
      el('p', null, t('all_set_text'))),
    back);
}

async function goBackToYouTube() {
  try {
    await send({ type: 'backToYouTube' }); // the background closes this tab, and only this tab
  } catch {
    window.open('https://www.youtube.com/', '_blank', 'noopener');
  }
}

let lastView = null;

function renderAccount(view) {
  lastView = view;
  accountState = view.state;
  const root = $('account');
  const isPlex = (cfg.serverType || 'plex') === 'plex';
  let content;

  switch (view.state) {
    case 'checking':
      content = el('p', { class: 'status' }, spinner(), t('checking_signin'));
      break;

    case 'signed_out':
    case 'waiting': {
      const waiting = view.state === 'waiting';
      const actions = isPlex
        ? [
          waiting
            ? el('button', { type: 'button', class: 'ghost', onclick: () => send({ type: 'cancelSignIn' }).catch(() => {}) }, t('cancel'))
            : el('button', { type: 'button', class: 'plex', onclick: plexSignIn }, t('signin_plex')),
          waiting ? null : el('button', { type: 'button', class: 'link', onclick: openSeerrLogin }, t('other_signin')),
        ]
        : [el('button', { type: 'button', class: 'primary', onclick: openSeerrLogin }, t('signin_seerr'))];

      content = el('div', { class: 'signin' },
        el('div', { class: 'step-head' }, el('span', { class: 'step-num', 'aria-hidden': 'true' }, '2'), el('h2', null, t('signin_heading'))),
        el('p', null, isPlex
          ? t('opt_signin_plex_text')
          : t('opt_signin_site_text')),
        el('div', { class: 'actions' }, actions),
        el('p', { id: 'signin-status', class: 'status' }));
      root.replaceChildren(content);
      if (waiting) setStatus('signin-status', '', t('opt_waiting_plex'), true);
      else if (view.error) setStatus('signin-status', 'error', I.errText(view.error));
      return;
    }

    case 'signed_in': {
      const me = view.me;
      content = el('div', null,
        el('div', { class: 'who' },
          avatarFor(me),
          el('div', { class: 'who-text' },
            el('div', { class: 'who-name' }, me.name),
            el('div', { class: 'who-sub', dir: 'auto' }, me.email || t('signed_in'))),
          el('button', { type: 'button', class: 'ghost', onclick: signOut, title: t('sign_out_tip') }, t('sign_out'))),
        doneNote());
      break;
    }

    case 'error': {
      const reconnect = ['no_permission', 'network', 'not_configured', 'reconnect'].includes(view.error?.code);
      content = el('div', { class: 'signin' },
        el('p', { class: 'status error' }, I.errText(view.error)),
        el('div', { class: 'actions' },
          reconnect
            ? el('button', { type: 'button', class: 'primary', onclick: showServerStep }, t('connect_again'))
            : null,
          el('button', { type: 'button', class: 'ghost', onclick: () => refreshAccount() }, t('try_again'))));
      break;
    }
  }
  root.replaceChildren(content);
}

// Signed in on the Seerr site in another tab? Pick it up when this page gets focus again.
window.addEventListener('focus', () => {
  if (accountState === 'signed_out') refreshAccount({ quiet: true });
});

// ------------------------------------------------------------------ preferences

$('trailersOnly').addEventListener('change', (e) => {
  chrome.storage.sync.set({ trailersOnly: e.target.checked });
});

// ------------------------------------------------------------------ language

function applyLanguage() {
  document.documentElement.lang = I.lang;
  document.documentElement.dir = I.dir;
  document.title = t('extName');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  if (lastView) renderAccount(lastView);
}

async function setUpLanguagePicker() {
  const { language = 'auto' } = await chrome.storage.sync.get('language');
  const select = $('language');
  const options = [['auto', t('lang_auto')], ...I.SUPPORTED.map((code) => [code, I.NATIVE_NAMES[code]])];
  select.replaceChildren(...options.map(([value, label]) => {
    const o = el('option', { value, lang: value === 'auto' ? null : value }, label);
    o.selected = value === language;
    return o;
  }));
}

$('language').addEventListener('change', (e) => {
  chrome.storage.sync.set({ language: e.target.value }); // i18n.js picks this up everywhere, YouTube tabs too
});

I.onChange(() => {
  applyLanguage();
  setUpLanguagePicker(); // "Automatic (…)" label in the new language
});

// ------------------------------------------------------------------ start

(async () => {
  await I.ready;
  applyLanguage();
  setUpLanguagePicker();
  await reloadConfig();
  if (!cfg.url) {
    showServerStep();
    return;
  }
  if (!isAllowedServer(cfg.url)) {
    showServerStep();
    setStatus('server-status', 'error', t('err_reconnect'));
    return;
  }
  showAccountStep();
  refreshAccount();
  // Refresh the server's name in the background; keeps it current if it was renamed.
  send({ type: 'serverInfo' })
    .then(async () => {
      await reloadConfig();
      $('server-title').textContent = cfg.serverTitle || 'Seerr';
    })
    .catch(() => {});
})();
