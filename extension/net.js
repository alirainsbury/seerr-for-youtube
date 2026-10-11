// Seerr for YouTube — address rules shared by the settings page and the background worker.
// Seerr is reached at its web address: a domain name (seerr.example.com), a LAN hostname
// (nas.local) or an IP address (10.0.1.11:5055), over https or plain http.
//
// Fork note: upstream accepts https domain names only. This fork also allows http and IP
// addresses so a Seerr on the local network can be used without a reverse proxy.
(function (root) {
  'use strict';

  const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

  // Seerr's own pages. People often paste the address of the page they're looking at,
  // so a trailing page path like /login is dropped; any other path is kept (subpath installs).
  const PAGE_PATHS = /\/(?:login|discover|requests|issues|settings|users|profile|movie|tv|person|collection)(?:\/.*)?$/i;

  function isHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (!h) return false;
    if (IPV4.test(h)) return true;
    if (/^\[.*\]$/.test(h)) return true; // IPv6 literal, already validated by URL
    return HOSTNAME.test(h);
  }

  // What the person typed → { url } or { error } (a message key, translated by the settings page).
  function parseServerAddress(raw) {
    const value = String(raw || '').trim();
    if (!value) return { error: 'addr_empty' };
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
      return { error: 'addr_scheme' };
    }
    let u;
    try {
      u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return { error: 'addr_invalid' };
    }
    if (u.username || u.password || u.search || u.hash) {
      return { error: 'addr_extra' };
    }
    if (!isHost(u.hostname)) {
      return { error: 'addr_not_domain' };
    }
    const path = u.pathname.replace(PAGE_PATHS, '');
    return { url: (u.origin + path).replace(/\/+$/, '') };
  }

  // Double-check a saved address before every connection.
  function isAllowedServer(url) {
    try {
      const u = new URL(url);
      return (u.protocol === 'https:' || u.protocol === 'http:') && isHost(u.hostname);
    } catch {
      return false;
    }
  }

  // Host permission for exactly this server: scheme, host and port.
  function originPattern(url) {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}/*`;
  }

  root.SeerrNet = { parseServerAddress, isAllowedServer, originPattern };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SeerrNet;
})(typeof globalThis !== 'undefined' ? globalThis : this);
