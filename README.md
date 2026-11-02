# Seerr for YouTube

[![Built 100% with Claude](https://img.shields.io/badge/Built%20100%25%20with-Claude-D97757)](https://claude.ai)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)](#install)

> Watching a trailer on YouTube? Request it on your Seerr server in one click.

**Media Server** · Chrome / Chromium · Browser extension (Manifest V3) · [Latest release](../../releases/latest)

**Jump to:** [Install](#install) · [Quick start](#quick-start) · [Docs](#documentation)

> [!NOTE]
> **This is a personal fork.** Based on [Seerr for YouTube](https://github.com/nigoshi/seerr-for-youtube) by Nigoshi, licensed under CC BY-NC 4.0. Changes were made: the Seerr address may be plain `http://` and an IP address (for example `http://192.168.1.50:5055`), not only an https domain name. This trades the upstream "sign-ins never travel unencrypted" guarantee for LAN convenience; only use http on a network you trust.

## Install

The extension isn't on the Chrome Web Store, so you install it directly from this repository.

1. Download the latest release ZIP from [Releases](../../releases/latest) and unzip it somewhere permanent, such as your Documents folder. Chrome runs the extension from that folder: if you delete or move it, the extension stops working.
   Or clone it with git:
   ```bash
   git clone https://github.com/alirainsbury/seerr-for-youtube.git
   ```
2. Open `chrome://extensions` (in Edge: `edge://extensions`).
3. Turn on **Developer mode** (top-right switch; in Edge, the left sidebar).
4. Click **Load unpacked** and select the **`extension`** folder (the one containing `manifest.json`).
5. The settings page opens by itself. Type your Seerr address, click **Continue** and choose **Allow** when Chrome asks.
6. Click **Sign in with Plex** and approve in the Plex window. For other account types, click **Use another sign-in** and sign in on your Seerr site.

To update, replace the contents of your `extension` folder with the new version, click the reload icon on the extension's card in `chrome://extensions`, and refresh any open YouTube tabs.

**Requirements:** Google Chrome or another Chromium browser (Edge, Brave, Opera, Vivaldi); a [Seerr](https://github.com/seerr-team/seerr) server reachable from this machine; an account on it (Plex, Jellyfin, Emby or local). Overseerr and Jellyseerr share the same API and may work, but haven't been tested.

## What it does

Adds a **Request** button next to YouTube's Subscribe button. It works out which movie or show the trailer is for, shows whether it's already on your server, and lets you request it, picking seasons for shows, without leaving YouTube.

<table>
  <tr>
    <td align="center" valign="top">
      <img src="screenshots/popover.png" alt="The request popover on YouTube, showing the best match, a Request button and other matches" width="320"><br>
      <sub>The request popover: best match, status and other possible matches</sub>
    </td>
    <td align="center" valign="top">
      <img src="screenshots/settings.png" alt="The settings page, asking for the Seerr address" width="440"><br>
      <sub>First-time setup: enter your Seerr address, then sign in</sub>
    </td>
  </tr>
</table>

## Features

- **One-click requests** — the button sits next to Subscribe and shows Request, Requested or Available before you click it.
- **Season picker** — choose one season or all; "Season 2" in the title preselects Season 2.
- **Never stuck with a wrong match** — other possible matches, a search box, and a link to the title in Seerr.
- **Trailer title clean-up** — understands English, Japanese, Korean and Arabic titles and searches in the trailer's language.
- **Video game trailers** — recognised, and not offered for request.
- **Sign in with Plex, Jellyfin, Emby or local accounts** — each person requests under their own account.
- **Light and dark mode** — follows YouTube; an "Only show on trailers" option hides the button elsewhere.
- **No data collection** — talks only to your Seerr server, plex.tv (sign-in) and image.tmdb.org (posters).

## Quick start

1. Open a movie or TV trailer on YouTube.
2. Look at the button next to Subscribe: **Request** (not requested yet), **Requested**, **Available**, or **Seerr** (not looked up yet or not sure of the match; click to search).
3. Click it to open the popover and check the match.
4. For a show, choose the seasons.
5. Click **Request**. Wrong match? Pick one from **Other matches**, or type a title in the search box and press Enter.

## Documentation

| Doc | What's in it |
|---|---|
| [User guide](docs/USER-GUIDE.md) | Full feature list, languages, button states |
| [Privacy and security](docs/PRIVACY.md) | What the extension talks to and what it stores |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common problems and known limitations |
| [Architecture](docs/ARCHITECTURE.md) | Project structure |
| [Licensing summary](docs/LICENSING.md) | Plain-language guide to CC BY-NC 4.0 |

## Build & release

### Run from source

There is no build step and there are no dependencies: plain JavaScript, HTML and CSS. Load the `extension/` folder unpacked, as described under Install. Releases are published as a ZIP on GitHub.

## License

**Seerr for YouTube** © 2026 Nigoshi is licensed under [CC BY-NC 4.0](LICENSE): free to use, copy and modify with credit, for non-commercial purposes only. Based on [Seerr for YouTube](https://github.com/nigoshi/seerr-for-youtube) by Nigoshi; changes were made. See the [licensing summary](docs/LICENSING.md); the full legal text in [LICENSE](LICENSE) is what applies.

Written by [Claude](https://claude.ai) in collaboration with the project owner. Built for [Seerr](https://github.com/seerr-team/seerr). Posters come from [TMDB](https://www.themoviedb.org/); this product uses the TMDB API but is not endorsed or certified by TMDB. Not affiliated with or endorsed by YouTube or Google, the Seerr project, Plex, TMDB, or Anthropic.
