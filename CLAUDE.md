# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build and launch (ALWAYS use this, never npm start or electron .)
npm run build && open dist/mac-arm64/FloatNote.app

# Kill any running instance before rebuilding
pkill -f FloatNote || true && npm run build && open dist/mac-arm64/FloatNote.app

# Install dependencies (after cloning or adding deps)
npm install

# Rebuild native modules after Electron version changes
npx electron-rebuild
```

> **Important:** Never use `npm start` or `electron .` — those run under the generic Electron.app process, not FloatNote.app. The real app bundle is required for tray icon, global hotkey, and login item behavior to work correctly.

## Architecture

FloatNotes is a frameless, always-on-top macOS menu bar app. No bundler or transpiler — plain JS/HTML/CSS loaded directly by Electron.

### Process boundary

- **`main.js`** — Electron main process. Owns the SQLite DB, BrowserWindow, Tray, global shortcut, and all IPC handlers. Settings are persisted as JSON at `~/.floating-notes/settings.json`.
- **`preload.js`** — Exposes `window.electronAPI` to the renderer via `contextBridge`. All renderer→main communication goes through this bridge.
- **`renderer.js`** — All UI logic: note loading/saving, formatting, panel toggling, auto-save, window resize requests.
- **`index.html`** / **`styles.css`** — Markup and styles. No framework.

### Data

- SQLite DB at `~/.floating-notes/notes.db` via `better-sqlite3` (synchronous API).
- Note `content` is stored as raw HTML (preserves bold/italic/links).
- Note IDs are `Date.now().toString()`.

### Transparency / vibrancy

Two paths depending on macOS version:
1. **`electron-liquid-glass`** (macOS 26 Tahoe+): `liquidGlass.addView()` with `GlassMaterialVariant.clear`.
2. **Vibrancy fallback**: `vibrancy: 'under-window'` + toggling `setVibrancy(null)` → `'under-window'` on `blur` to prevent the "frozen backdrop" bug.

### Window behavior

- `setAlwaysOnTop(true, 'status')` — keeps window above other apps in the macOS compositor chain, required for live backdrop sampling.
- Toggle visibility with Option+Cmd+N (global hotkey) or tray left-click.
- Window height is adjusted dynamically via `resize-window-height` IPC; `mainWindow.setSize()` is called from main.

### Icons

All buttons use inline SVG (Lucide-style, `viewBox="0 0 24 24"`, `stroke="currentColor"`). SF Symbols do not work in Electron/Chromium. SVG sizes are set in CSS per button class.

### IPC pattern

Renderer sends via `ipcRenderer.send(channel, payload)` → main handles with `ipcMain.on(channel, handler)` → main replies with `event.reply(replyChannel, data)` → renderer listens with `ipcRenderer.on(replyChannel, cb)`. All channels are declared in `preload.js`.

### Build

`electron-builder` outputs to `dist/mac-arm64/FloatNote.app`. `better-sqlite3` and `electron-liquid-glass` are listed in `asarUnpack` because they contain native `.node` binaries.
