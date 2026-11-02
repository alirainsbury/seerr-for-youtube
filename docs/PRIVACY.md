# Seerr for YouTube — Privacy and security


- **No data collection.** No analytics, no tracking, no third-party servers. The extension only talks to:
  - **your Seerr server**, for searches and requests;
  - **plex.tv**, only when you click "Sign in with Plex";
  - **image.tmdb.org**, to load posters.
- **No passwords or API keys are stored.** The extension uses your normal Seerr sign-in, the same one Seerr's website uses. Your Plex sign-in token is handed to Seerr once and never saved.
- **Minimal permissions.** Chrome only grants access to your exact Seerr address, plus plex.tv and image.tmdb.org. Access is requested when you connect, not at install.
- **Isolated from YouTube.** The button and popover are sealed off from YouTube's page scripts, which can't read your name, server address or library, and can't press **Request** for you.
- **https only.** The extension refuses unencrypted addresses, so sign-ins never travel in plain text.
