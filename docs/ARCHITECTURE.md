# Seerr for YouTube — Architecture

## Project structure

```
seerr-for-youtube/
├── extension/            ← load this folder in Chrome
│   ├── manifest.json     Extension definition (Manifest V3)
│   ├── background.js     Talks to Seerr, Plex sign-in, security checks
│   ├── content.js        The button and popover on YouTube
│   ├── match.js          Reads trailer titles, detects game trailers, ranks matches
│   ├── i18n.js           All interface text (English, Japanese, Korean, Arabic)
│   ├── net.js            Address checks (https domain addresses only)
│   ├── styles.js         Button and popover styles
│   ├── options.html/css/js  Settings page
│   ├── icons/            Extension icons
│   └── _locales/         Extension name in Chrome's own lists
├── screenshots/          Images used in this README
├── LICENSE               CC BY-NC 4.0
└── README.md
```

There's no build step and there are no dependencies: plain JavaScript, HTML and CSS.
