# FloatNotes

A lightweight, always-on-top floating note-taking app for macOS. Lives in your menu bar and stays above every window so you never lose your notes.

## Download

Download the latest `.dmg` from the [Releases](../../releases) page.

## Install

1. Open the downloaded `FloatNotes-*.dmg` file.
2. Drag **FloatNote.app** into your **Applications** folder.
3. Eject the disk image.

## First Launch (Gatekeeper Bypass)

FloatNotes is not signed with an Apple Developer certificate, so macOS will block it on first launch. This is normal for open-source and indie apps distributed outside the App Store.

**To open it anyway:**

### Option A — Right-click method (easiest)
1. Open **Finder** and go to your **Applications** folder.
2. **Right-click** (or Control-click) on **FloatNote.app**.
3. Select **Open** from the context menu.
4. In the dialog that appears, click **Open** again.

You only need to do this once. After that, double-clicking works normally.

### Option B — System Settings
1. Try to open FloatNote.app normally (it will be blocked).
2. Open **System Settings → Privacy & Security**.
3. Scroll down to the **Security** section.
4. You'll see a message like *"FloatNote was blocked..."* — click **Open Anyway**.
5. Confirm by clicking **Open** in the dialog.

### Option C — Terminal (one-liner)
If both options above fail, run this in Terminal to remove the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/FloatNote.app
```

Then open the app normally.

---

## Features

- **Global Hotkey:** Option+Command+N to toggle the floating window
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
- **Option + Cmd + N** toggles the window from anywhere.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Option+Cmd+N | Toggle window visibility |
| Cmd+Left Arrow | Previous note |
| Cmd+Right Arrow | Next note |
| Cmd+B | Bold |
| Cmd+I | Italic |
| Cmd+U | Underline |

## Requirements

- macOS 13 Ventura or later (Apple Silicon / arm64)
- macOS 26 Tahoe or later recommended for the liquid glass effect

## Building from Source

```bash
git clone <this-repo>
cd floating-notes
npm install
npm run build
open dist/mac-arm64/FloatNote.app
```

> **Note:** Always use `npm run build`, not `npm start` — the built `.app` bundle is required for the tray icon, global hotkey, and menu bar behavior to work correctly.

## Known Limitations

- Very long notes (>100k characters) may impact performance
- Transfer to Apple Notes requires Apple Notes to be installed
- Liquid Glass background doesn't update dynamically on older macOS versions
