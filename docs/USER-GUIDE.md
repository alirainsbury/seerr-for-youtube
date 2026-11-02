# Seerr for YouTube — User guide

## Features

**Requesting**
- **One-click requests from YouTube.** The button sits next to Subscribe and matches YouTube's look, in Seerr's colours.
- **Status at a glance.** On trailers, the button already shows **Request**, **Requested** or **Available** before you click it.
- **Season picker for shows.** Choose one season or all of them. Seasons already available or requested are marked and can't be requested twice.
- **Smart preselection.** "Season 2" in the trailer title preselects Season 2. This includes anime naming like 第2期 and "2nd Season".
- **Never stuck with a wrong match.** The popover lists other possible matches, has a search box, and links to the title in Seerr.

**Finding the right title**
- **Cleans up trailer titles** like "Dune: Part Two | Official Trailer 3 | In Theaters" down to *Dune: Part Two*.
- **Understands trailer titles in English, Japanese, Korean and Arabic**, including titles in brackets such as 『葬送のフリーレン』 or 《파묘》.
- **Searches in the trailer's language**, so a Japanese trailer finds 葬送のフリーレン under its Japanese title.
- **Recognises video game trailers.** It uses the title, the channel and YouTube's game card, and doesn't offer to request games. It's tuned not to mistake shows like *The Last of Us* or *Squid Game* for games.

**Accounts**
- **Sign in with Plex.** Each person uses their own account, so requests show up under their name with their own approval rules and limits.
- **Jellyfin, Emby and local accounts** work by signing in on your Seerr site; the extension picks that up automatically.
- **Sign in from YouTube.** If you're signed out, the popover offers sign-in right there.

**Comfort**
- **Follows YouTube's light and dark mode.**
- **"Only show on trailers" option** hides the button on everything else, including game trailers.
- **Lightweight.** It only looks titles up on trailers, never on every video. Posters are small and the cache is capped.

## Languages

| Language | Interface | Understands trailer titles | Notes |
|---|:-:|:-:|---|
| English | ✅ | ✅ | |
| 日本語 Japanese | ✅ | ✅ | Includes anime conventions: PV, 本予告, 第2期, 劇場版 |
| 한국어 Korean | ✅ | ✅ | |
| العربية Arabic | ✅ | ✅ | Full right-to-left layout |

The interface follows Chrome's language automatically. You can change it under **Language** on the settings page; the change applies instantly, including on open YouTube tabs.

## Using it (button states)


1. Open a movie or TV trailer on YouTube.
2. The button next to Subscribe shows the title's status:

   | Button | Meaning |
   |---|---|
   | **Request** (purple) | Found on Seerr and not requested yet |
   | **Requested** (amber) | Already requested |
   | **Available** (green) | Already on your server |
   | **Seerr** | Not looked up yet, not sure of the match, or a video game trailer. Click to search |

3. Click it to open the popover. Check the match, choose seasons for a show, and click **Request**.
4. Wrong match? Pick one from **Other matches**, or type a title in the search box and press Enter.

