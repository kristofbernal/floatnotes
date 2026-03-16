# FloatNotes

A lightweight, always-on-top floating note-taking app for macOS. Lives in your menu bar and stays above every window so you never lose your notes.

## Download

Download the latest `.dmg` from the [Releases](../../releases) page.

## Install

1. Open the downloaded `FloatNotes-*.dmg` file.
2. Drag **FloatNotes.app** into your **Applications** folder.
3. Eject the disk image.

## First Launch (Gatekeeper Bypass)

FloatNotes is not signed with an Apple Developer certificate, so macOS will block it on first launch. This is normal for open-source and indie apps distributed outside the App Store.

> **macOS Tahoe (26) note:** The Control-click → "Open" workaround was removed in macOS Sequoia and is no longer available. Use one of the methods below instead.

**To open it anyway:**

### Option A — Terminal (most reliable)
Run this in Terminal **before** opening the app to remove the quarantine flag:

```bash
xattr -r -d com.apple.quarantine /Applications/FloatNotes.app
```

Then open the app normally. You only need to do this once.

### Option B — System Settings
1. Try to open FloatNotes.app normally (it will be blocked).
2. **Within ~1 hour**, open **System Settings → Privacy & Security**.
3. Scroll down to the **Security** section.
4. You'll see a message like *"FloatNotes was blocked..."* — click **Open Anyway**.
5. Enter your administrator password to confirm.

You only need to do this once. After that, double-clicking works normally.

---

## Features

- **Customizable Global Hotkey:** Set your own toggle shortcut in Settings (defaults to ⌥⌘N)
- **Quick Navigation:** Command+Left/Right to switch between notes
- **Formatting:** Bold, Italic, Underline, Bullets, To-Do checkboxes, Links
- **Auto-Save:** Notes save automatically as you type
- **Timestamps:** See when notes were created and last edited
- **Export:** Copy to clipboard or transfer to Apple Notes
- **Always-On-Top:** Stays visible above all other windows
- **System Theme:** Adapts to macOS light/dark mode

## Usage

- The app lives in your **menu bar** (top-right area of your screen).
- **Left-click** the tray icon to show/hide the notes window.
- Use your configured toggle shortcut (default ⌥⌘N) to show/hide from anywhere.
- Change the shortcut anytime in **Settings → Toggle Shortcut**.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Configurable (default ⌥⌘N) | Toggle window visibility |
| Cmd+Left Arrow | Previous note |
| Cmd+Right Arrow | Next note |
| Cmd+B | Bold |
| Cmd+I | Italic |
| Cmd+U | Underline |

## Requirements

- macOS 13 Ventura or later (Apple Silicon / arm64)
- macOS 26 Tahoe or later recommended for the Liquid Glass effect

> **Note:** Liquid Glass app icon variants are coming soon — still working on getting them just right.

## Building from Source

```bash
git clone <this-repo>
cd floating-notes
npm install
npm run build
open dist/mac-arm64/FloatNotes.app
```

> **Note:** Always use `npm run build`, not `npm start` — the built `.app` bundle is required for the tray icon, global hotkey, and menu bar behavior to work correctly.

## Known Limitations

- Very long notes (>100k characters) may impact performance
- Transfer to Apple Notes requires Apple Notes to be installed
- Liquid Glass background doesn't update dynamically on older macOS versions
