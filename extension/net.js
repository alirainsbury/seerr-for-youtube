// Seerr for YouTube — address rules shared by the settings page and the background worker.
// Seerr is reached only at its https web address (a domain name like seerr.example.com),
// never by IP address and never over plain http.
(function (root) {
  'use strict';

  const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}[a-z0-9]$/;

  function isDomain(hostname) {
    const h = String(hostname || '').toLowerCase();
    return DOMAIN.test(h) && !/^\d+(\.\d+){3}$/.test(h); // a real name, not an IPv4 address
  }

  // What the person typed → { url } or { error } (a message key, translated by the settings page).
  function parseServerAddress(raw) {
    const value = String(raw || '').trim();
    if (!value) return { error: 'addr_empty' };
    if (/^http:\/\//i.test(value)) {
      return { error: 'addr_http' };
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https:\/\//i.test(value)) {
      return { error: 'addr_scheme' };
    }
    let u;
    try {
      u = new URL(/^https:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return { error: 'addr_invalid' };
    }
    if (u.username || u.password || u.search || u.hash) {
      return { error: 'addr_extra' };
    }
    if (!isDomain(u.hostname)) {
      return { error: 'addr_not_domain' };
    }
    return { url: (u.origin + u.pathname).replace(/\/+$/, '') };
  }

  // Double-check a saved address before every connection.
  function isAllowedServer(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && isDomain(u.hostname);
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
