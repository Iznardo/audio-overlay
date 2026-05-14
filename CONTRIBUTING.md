# Contributing to audio-overlay

Thank you for your interest in contributing! This is a small vanilla JS project — no build tools, no dependencies — so getting started is quick.

---

## Ground rules

- **No external dependencies.** No npm, no frameworks, no bundlers. Everything must work by opening the HTML files directly in a browser or via a simple static server.
- **No build step.** The project is distributed as-is. What you see in the repo is what users run.
- **ES modules only.** Use `import`/`export`. All scripts are loaded with `type="module"`.
- **SVG icons, not emoji.** OBS runs a Chromium Embedded Framework (CEF) whose emoji renderer differs from desktop Chrome. Always use inline SVG for icons.
- **CSS variables for theming.** Any new color or sizing value should go through a CSS custom property defined in `:root`.

---

## How to set up locally

```bash
git clone https://github.com/Iznardo/audio-overlay.git
cd audio-overlay

# Start a local server (Python or Node)
python -m http.server 8000
# or
npx serve .
```

Open two tabs:
- `http://localhost:8000/control.html`
- `http://localhost:8000/overlay.html`

No install step, no compilation. Changes are live on browser refresh (`Ctrl+Shift+R` for a hard refresh that clears the ES module cache).

---

## Project structure

```
js/
  db.js         — IndexedDB wrapper (blobs storage)
  channel.js    — BroadcastChannel wrapper + message constants
  settings.js   — Settings module (defaults, persistence, broadcast)
  control.js    — Control panel logic
  overlay.js    — Overlay logic
  waveform.js   — Waveform pre-analysis + canvas renderer
css/
  control.css
  overlay.css
```

If you're adding a new feature that touches communication between the two pages, add a new message type to `MSG` in `channel.js` and handle it in both `control.js` and `overlay.js`.

---

## Making a pull request

1. **Fork** the repo and create a branch from `main`.
2. Keep commits focused — one logical change per commit.
3. Test in **Chrome** (or OBS's Browser Source if the change is OBS-specific).
4. Make sure the overlay still has a **transparent background** and renders correctly at 1920×1080.
5. Update `CHANGELOG.md` under an `[Unreleased]` section.
6. Open the PR with a clear description of what changed and why.

---

## Reporting bugs

Open a GitHub Issue with:
- What you did
- What you expected to happen
- What actually happened
- Browser / OBS version
- Any console errors (F12 → Console)

---

## Ideas & feature requests

Open an Issue tagged `enhancement`. Please check existing issues first to avoid duplicates.
