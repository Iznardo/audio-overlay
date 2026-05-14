# audio-overlay

> A browser-based OBS overlay for playing listener audio clips live on stream — with animated lower-thirds, real-time waveform, and a full visual customization panel.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)]()
[![Vanilla JS](https://img.shields.io/badge/built%20with-Vanilla%20JS-f0db4f)]()
[![GitHub](https://img.shields.io/github/stars/Iznardo/audio-overlay?style=social)](https://github.com/Iznardo/audio-overlay)

---

## What is this?

**audio-overlay** lets streamers play audio clips sent by their audience (via DMs, Twitter, Discord, etc.) directly during a live stream, displaying an animated lower-third in OBS with:

- 🎙 The listener's **name** and **profile picture**
- 📊 A **WhatsApp-style waveform** that fills with playback progress
- ⏱ **Current time / total time** display
- ✨ Smooth **entrance and exit animations**
- 🎨 Fully **customizable** colors, position, size and animation direction — live, from the control panel

No backend. No build step. No npm. Pure HTML + CSS + JavaScript.

---

## How it works

Two separate HTML pages communicate via the browser's [`BroadcastChannel API`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel):

| Page | Role |
|---|---|
| `control.html` | **Private control panel.** You open this in a browser tab or OBS Custom Dock. Load audio files, set names & avatars, hit play. |
| `overlay.html` | **What OBS captures.** Add it as a Browser Source. Transparent background. Only visible when audio is playing. |

Audio blobs are stored in **IndexedDB** so both pages can access them without a server. Metadata (names, order, settings) persists in **localStorage**.

---

## Getting started

### Option A — Open files directly (simplest)

1. Download or clone this repo.
2. Open `control.html` in **Chrome** or **Edge**.
3. Open `overlay.html` in another tab **of the same browser window**.

> ⚠️ Both pages must run in the same browser process for `BroadcastChannel` to work. Opening them in different windows or browsers will not work.

### Option B — Local server (recommended for OBS)

```bash
# Python 3
python -m http.server 8000

# Node.js (npx)
npx serve .
```

Then open:
- Control panel → `http://localhost:8000/control.html`
- Overlay → `http://localhost:8000/overlay.html`

---

## OBS Setup

### Overlay (Browser Source)

1. In OBS, go to **Sources → Add → Browser Source**.
2. Check **Local file** if using files directly, or enter the URL if using a local server.
3. Set width to **1920** and height to **1080**.
4. Check **"Refresh browser when scene becomes active"**.
5. Under **Custom CSS**, leave it empty (the page handles its own transparency).

### Control Panel (Custom Browser Dock) — recommended

This lets you control the overlay without leaving OBS:

1. Go to **Docks → Custom Browser Docks**.
2. Add a new dock:
   - **Name**: Audio Control (or anything you like)
   - **URL**: path to `control.html` or `http://localhost:8000/control.html`
3. Click **Apply**.

> With this setup both pages run inside OBS's browser engine (CEF), so `BroadcastChannel` works seamlessly — no extra server needed.

---

## Features

### Control panel
- **Drag & drop** multiple audio files at once (mp3, wav, ogg, m4a, aac, flac…)
- Set a **custom name and profile picture** for each listener
- **Drag to reorder** the list
- **Persistent** — reload the page and everything is still there
- **Active player** bar at the bottom with seek, pause/resume/stop
- **Settings panel** — customize the overlay appearance live

### Overlay
- Animated lower-third with **entrance/exit animations**
- **WhatsApp-style waveform** — pre-analyzed at load time, zero delay at play
- Transparent background — works out of the box in OBS, no chroma key needed
- Automatically hides when audio ends or is stopped

### Settings (fully customizable)

| Setting | Options |
|---|---|
| **Size** | Large (full width) · Small (half width) |
| **Position** | 6 positions: top/bottom × left/center/right |
| **Animation** | From top · From bottom · From left · From right |
| **Banner color** | Color picker + opacity slider |
| **Text color** | Color picker |
| **Waveform (filled)** | Color picker |
| **Waveform (empty)** | Color picker |
| **Avatar border** | Color picker |

All settings are saved automatically and synced to the overlay in real time.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Pause / Resume active audio |
| `Esc` | Stop active audio |
| `↑` / `↓` | Navigate the audio list |
| `Enter` | Play selected audio |

---

## Customizing the branding

By default, audio-overlay ships with a dark red color scheme. To use your own branding:

1. Open the **Settings panel** (⚙ button in the header) and adjust colors to match your brand.
2. Replace `assets/default-avatar.png` with your own default avatar image.
3. Place your logo at `assets/logo.png` — it will appear in the control panel header automatically. If the file doesn't exist, the project name is shown as text instead.

---

## Project structure

```
audio-overlay/
├── control.html        # Streamer control panel
├── overlay.html        # OBS browser source
├── css/
│   ├── control.css
│   └── overlay.css
├── js/
│   ├── db.js           # IndexedDB wrapper
│   ├── channel.js      # BroadcastChannel wrapper
│   ├── settings.js     # Configuration persistence & sync
│   ├── control.js      # Control panel logic
│   ├── overlay.js      # Overlay logic
│   └── waveform.js     # Waveform analysis & rendering
└── assets/
    ├── default-avatar.png
    └── logo.png        # Optional — replace with your own
```

---

## Troubleshooting

**Audio not playing in the overlay**
The browser blocks autoplay without a prior user gesture. In OBS this is not an issue. In a regular browser tab, click anywhere on the overlay page once to unlock audio.

**Overlay not connecting (red indicator in control panel)**
Both pages must share the same browser process. Use the OBS Custom Browser Dock method, or open both as tabs in the same Chrome/Edge window served from the same origin (same `localhost` port, or both as `file://` from the same folder).

**Changes not showing after a code update**
ES modules are cached aggressively. Press `Ctrl+Shift+R` (hard refresh) on both pages, or click "Refresh" in the OBS Browser Source properties.

**Waveform not filling / staying empty**
Make sure you're using a supported audio format (mp3, wav, ogg, m4a). Corrupt files or DRM-protected audio may fail the pre-analysis step silently.

**Settings not applying to the overlay**
The overlay reads settings at load time and also listens for live updates. If it was open before you changed settings, hard-refresh the overlay page.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[MIT](LICENSE) — free to use, modify and distribute.
