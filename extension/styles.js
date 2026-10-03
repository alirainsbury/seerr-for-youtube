// Seerr for YouTube — styles for the button and popover (injected into their shadow roots).
window.SeerrStyles = `
/* Styles live inside closed shadow roots, so YouTube's CSS can't reach in and YouTube's scripts
   can't read what's shown. YouTube's --yt-spec-* theme variables still inherit through, so the
   popover follows YouTube's light/dark mode. */

/* ---------- The button next to Subscribe ----------
   Seerr's look (indigo → purple gradient, Seerr status colors) in YouTube's pill shape.
   "all: unset" first so YouTube's own button styles can't leak in. */

:host {
  all: initial;
  --sy-indigo-400: #818cf8;
  --sy-indigo-500: #6366f1;
  --sy-indigo-600: #4f46e5;
  --sy-purple-600: #9333ea;
  --sy-green: #15803d;
  --sy-green-border: #22c55e;
  --sy-yellow: #a16207;
  --sy-yellow-border: #eab308;
  --sy-red: #b91c1c;
  --sy-red-border: #ef4444;
  --sy-gradient: linear-gradient(to bottom right, var(--sy-indigo-600), var(--sy-purple-600));
  --sy-accent: var(--sy-indigo-600);
}
:host-context(html[dark]) { --sy-accent: var(--sy-indigo-400); }
:host(.sy-host-btn) { display: inline-flex; flex: none; align-items: center; }
:host(.sy-host-pop) { display: contents; }

#sy-button.sy-btn {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 36px;
  /* Space from Subscribe lives here, inside the shadow root, where YouTube's CSS can't reset it.
     The button itself follows the page's direction; only its label follows the extension's language. */
  margin: 0;
  margin-inline-start: 8px;
  padding-block: 0;
  padding-inline: 12px 16px;
  border: 1px solid var(--sy-indigo-500);
  border-radius: 18px;
  background: var(--sy-gradient);
  color: #fff;
  font: 500 14px/1 Inter, "Roboto", "Arial", sans-serif;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: filter 0.15s;
}
#sy-button.sy-btn:hover,
#sy-button.sy-btn[aria-expanded="true"] { filter: brightness(1.12); }
#sy-button.sy-btn:active { filter: brightness(0.95); }
#sy-button.sy-btn:focus-visible {
  outline: 2px solid var(--sy-indigo-400);
  outline-offset: 2px;
}
#sy-button.sy-btn[data-state="available"] { background: var(--sy-green); border-color: var(--sy-green-border); }
#sy-button.sy-btn[data-state="requested"] { background: var(--sy-yellow); border-color: var(--sy-yellow-border); }
#sy-button.sy-btn[hidden] { display: none !important; }
#sy-button svg { flex: none; }
#sy-button .sy-spin { width: 18px; height: 18px; opacity: 1; }

/* ---------- Popover ---------- */

.sy-pop {
  position: fixed;
  z-index: 2300;
  width: 360px;
  max-width: calc(100vw - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 0 8px;
  border-radius: 12px;
  background: var(--yt-spec-menu-background, #fff);
  color: var(--yt-spec-text-primary, #0f0f0f);
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.12);
  font: 400 14px/20px "Roboto", "Arial", sans-serif;
  text-align: start;
  animation: sy-pop-in 0.12s ease-out;
}
:host-context(html[dark]) .sy-pop { box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5); }
.sy-pop *, .sy-pop *::before, .sy-pop *::after { box-sizing: border-box; }
.sy-pop p { margin: 0; }

@keyframes sy-pop-in {
  from { opacity: 0; transform: translateY(-4px); }
}

/* Search */
.sy-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin: 0 12px 12px;
  padding-block: 0;
  padding-inline: 12px 14px;
  border-radius: 18px;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-search:focus-within {
  box-shadow: inset 0 0 0 1px var(--sy-indigo-500);
}
.sy-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--yt-spec-text-primary, #0f0f0f);
  font: 400 14px "Roboto", "Arial", sans-serif;
}
.sy-search-input::placeholder { color: var(--yt-spec-text-secondary, #606060); }

/* Selected title */
.sy-head {
  display: flex;
  gap: 12px;
  padding: 0 16px;
}
.sy-poster {
  flex: none;
  width: 64px;
  height: 96px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
}
.sy-poster-sm { width: 32px; height: 48px; border-radius: 4px; }
.sy-poster-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 2px;
}
.sy-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 16px;
  line-height: 22px;
  font-weight: 500;
}
.sy-meta {
  font-size: 12px;
  line-height: 18px;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-overview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  margin: 12px 16px 0 !important;
  font-size: 12px;
  line-height: 18px;
  color: var(--yt-spec-text-secondary, #606060);
}

/* Status badges, colored like Seerr's */
.sy-chip {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  flex: none;
  height: 22px;
  margin-top: 6px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
}
.sy-chip.is-small { margin-top: 0; height: 20px; line-height: 18px; padding: 0 8px; }
.sy-season .sy-chip, .sy-other .sy-chip { align-self: center; }
.sy-chip[data-state="available"],
.sy-chip[data-state="partial"]   { background: var(--sy-green); border-color: var(--sy-green-border); }
.sy-chip[data-state="requested"] { background: var(--sy-yellow); border-color: var(--sy-yellow-border); }
.sy-chip[data-state="blocked"]   { background: var(--sy-red); border-color: var(--sy-red-border); }

/* Seasons */
.sy-section-label {
  margin: 16px 16px 4px;
  font-size: 14px;
  font-weight: 500;
}
.sy-season {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 0 16px;
  cursor: pointer;
  user-select: none;
}
.sy-season:hover { background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1)); }
.sy-season.is-disabled { cursor: default; }
.sy-season.is-disabled:hover { background: transparent; }
.sy-season.is-disabled .sy-season-name,
.sy-season.is-disabled .sy-check { opacity: 0.5; }
.sy-season-name { flex: 1; min-width: 0; }
.sy-season-sub {
  font-size: 12px;
  color: var(--yt-spec-text-secondary, #606060);
  white-space: nowrap;
}
.sy-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
}

/* Checkbox */
.sy-check { position: relative; display: inline-flex; flex: none; }
.sy-check-input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}
.sy-check-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--yt-spec-text-secondary, #606060);
  border-radius: 3px;
  color: transparent;
  transition: background-color 0.1s, border-color 0.1s;
}
.sy-check-input:checked + .sy-check-box {
  border-color: var(--sy-indigo-600);
  background: var(--sy-indigo-600);
  color: #fff;
}
.sy-check-input:focus-visible + .sy-check-box {
  outline: 2px solid var(--sy-indigo-500);
  outline-offset: 2px;
}

/* Actions */
.sy-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 4px;
}
.sy-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  margin-inline-start: -12px;
  padding: 0 12px;
  border-radius: 18px;
  color: var(--sy-accent) !important;
  font-weight: 500;
  text-decoration: none !important;
}
.sy-link:hover { background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1)); }

.sy-primary,
.sy-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 18px;
  font: 500 14px/36px "Roboto", "Arial", sans-serif;
  white-space: nowrap;
  cursor: pointer;
}
.sy-primary {
  border: 1px solid var(--sy-indigo-500);
  background: var(--sy-gradient);
  color: #fff;
}
.sy-primary:hover:not(:disabled) { filter: brightness(1.12); }
.sy-primary:disabled {
  border-color: transparent;
  filter: none;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: var(--yt-spec-text-secondary, #606060);
  cursor: default;
}
.sy-secondary {
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: var(--yt-spec-text-primary, #0f0f0f);
}
.sy-secondary:hover { background: var(--yt-spec-button-chip-background-hover, rgba(0, 0, 0, 0.1)); }
.sy-primary:focus-visible,
.sy-secondary:focus-visible,
.sy-link:focus-visible,
.sy-other:focus-visible {
  outline: 2px solid var(--sy-indigo-500);
  outline-offset: 2px;
}

/* Notices, empty and loading states */
.sy-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 8px 16px 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-notice svg { margin-top: 1px; flex: none; color: #2ba640; }
.sy-notice.is-error { color: #cc0000; }
:host-context(html[dark]) .sy-notice.is-error { color: #ff4e45; }

.sy-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-setup { padding: 4px 16px 8px; }
.sy-setup-text { margin-bottom: 12px !important; }
.sy-setup.is-error .sy-setup-text { color: var(--yt-spec-text-primary, #0f0f0f); }

/* Other matches */
.sy-others {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
}
.sy-others-label {
  padding: 4px 16px;
  font-size: 12px;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-other {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 6px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sy-other:hover { background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1)); }
.sy-other-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.sy-other-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Spinner */
.sy-spin {
  display: inline-block;
  flex: none;
  width: 20px;
  height: 20px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  opacity: 0.7;
  animation: sy-rot 0.8s linear infinite;
}
.sy-spin.is-small { width: 16px; height: 16px; }
@keyframes sy-rot { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .sy-pop { animation: none; }
  .sy-spin { animation-duration: 2s; }
}

/* ---------- Sign-in inside the popover ---------- */

.sy-setup-title {
  margin-bottom: 4px !important;
  font-size: 16px;
  line-height: 22px;
  font-weight: 500;
}
.sy-setup-text { color: var(--yt-spec-text-secondary, #606060); }
.sy-setup-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.sy-waiting {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-inline-end: auto;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-text-btn {
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: var(--sy-accent);
  font: 500 14px/36px "Roboto", "Arial", sans-serif;
  cursor: pointer;
}
.sy-text-btn:hover { background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1)); }
.sy-text-btn:focus-visible {
  outline: 2px solid var(--sy-indigo-500);
  outline-offset: 2px;
}
.sy-setup .sy-notice { margin: 12px 0 0; }

.sy-foot {
  margin-top: 8px;
  padding: 8px 16px 0;
  border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
  font-size: 12px;
  line-height: 18px;
  color: var(--yt-spec-text-secondary, #606060);
}
.sy-others + .sy-foot { margin-top: 4px; }

/* ---------- Languages ----------
   Korean and Arabic need fonts that have their letters; YouTube's Roboto doesn't. */
[lang="ko"], [lang="ko"] .sy-search-input, [lang="ko"].sy-btn {
  font-family: "Roboto", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif !important;
  word-break: keep-all;
}
[lang="ja"], [lang="ja"] .sy-search-input, [lang="ja"].sy-btn {
  font-family: "Roboto", "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif !important;
  line-break: strict;
}
[lang="ar"], [lang="ar"] .sy-search-input, [lang="ar"].sy-btn {
  font-family: "Noto Sans Arabic", "Segoe UI", "Tahoma", "Geeza Pro", sans-serif !important;
}
[lang="ar"] .sy-title { line-height: 26px; }
/* Arrows that point "out" should point the other way in right-to-left text. */
[dir="rtl"] .sy-flip { transform: scaleX(-1); }
`;
