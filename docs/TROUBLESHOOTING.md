# Seerr for YouTube — Troubleshooting

## Troubleshooting

| Problem | What to do |
|---|---|
| The button doesn't appear | Refresh the YouTube tab. If you just installed or updated the extension, already-open tabs don't have it yet. |
| "Seerr sent back a web page instead of data" | Your Seerr is behind a login proxy (Authelia, Authentik, etc.). Let `/api` paths through the proxy. |
| "Seerr's CSRF protection blocks extensions" | Turn off CSRF protection in Seerr under **Settings → Network**. |
| "Your Plex account doesn't have access" | Ask the server owner to import your Plex user in Seerr. |
| No posters, just a film-strip icon | On the settings page, click **Change**, then **Continue**, and allow access when Chrome asks. |
| Two Request buttons | You have two copies installed. Remove the old one in `chrome://extensions`. |

## Known limitations

- **YouTube changes.** The button attaches next to YouTube's Subscribe button. If YouTube redesigns its watch page, the button may not appear until the extension is updated.
- **Title-based matching.** Matches are worked out from the video title. Usually the first match is right; when it isn't, use **Other matches** or the search box.
- **Game detection is a best guess.** It combines several signals, but an unusual game trailer may slip through, or a film may be held back. You can always search by hand.
- **AI-written translations.** Corrections from native speakers are very welcome.
- **Not on the Chrome Web Store**, so it's installed with Developer mode, as described above.
