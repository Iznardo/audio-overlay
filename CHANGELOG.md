# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-14

### Added
- Control panel (`control.html`) with drag & drop audio file loading
- OBS overlay (`overlay.html`) as a transparent Browser Source
- Cross-tab communication via `BroadcastChannel` API
- IndexedDB storage for audio and avatar blobs (no server required)
- Per-item custom listener name and profile picture
- Drag-to-reorder audio list
- WhatsApp-style pre-analyzed waveform with progress fill
- Waveform pre-analysis at file load time (zero delay at play)
- Animated lower-third: entrance and exit animations
- Active player bar with seek, pause, resume and stop
- Overlay connection status indicator (PING/PONG heartbeat)
- Keyboard shortcuts: Space, Esc, Arrow keys, Enter
- **Settings panel** with live sync to overlay:
  - Banner size (large / small)
  - Position (6 positions: top/bottom × left/center/right)
  - Animation direction (from top / bottom / left / right)
  - Color customization: background, opacity, text, waveform, avatar border
- Settings persistence in `localStorage`
- Optional branding logo (`assets/logo.png`) with text fallback
- Grain texture on overlay card via SVG turbulence + `mix-blend-mode`
- Full SVG icon set (no emoji/unicode) for consistent CEF rendering in OBS
