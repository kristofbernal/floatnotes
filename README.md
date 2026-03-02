# Floating Notes

A lightweight, always-on-top floating notes app for macOS built with Electron.

## Features

- **Global Hotkey:** Option+Command+N to open/close the floating window
- **Quick Navigation:** Command+Left/Right to switch between notes
- **Dynamic Window:** Expands as you type, scrolls at 600px height max
- **Markdown Support:** Bold (**), Italic (*), Underline (__), Bullets, To-Do lists, Links
- **Auto-Save:** Notes automatically save as you type
- **Timestamps:** See when notes were created and last edited
- **Export:** Copy to clipboard or transfer notes to Apple Notes
- **System Theme:** Automatically adapts to macOS light/dark mode
- **Always-On-Top:** Stays visible above all other windows

## Setup

1. Navigate to the project directory:
```bash
cd ~/Claude/floating-notes
```

2. Install dependencies (already done):
```bash
npm install
```

## Running the App

Start the app:
```bash
npm start
```

The app will open with a floating window. Notes are stored in `~/.floating-notes/notes.db`.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Option+Cmd+N | Toggle window visibility |
| Cmd+Left Arrow | Previous note |
| Cmd+Right Arrow | Next note |
| Cmd+B | Insert bold markdown |
| Cmd+I | Insert italic markdown |
| Cmd+U | Insert underline markdown |

## Toolbar Buttons

- **B** - Bold (**text**)
- **I** - Italic (*text*)
- **U** - Underline (__text__)
- **•** - Bullet point (- text)
- **☐** - To-Do item (- [ ] text)
- **🔗** - Add link ([text](url))
- **+** - Create new note
- **−** - Delete current note

## Export Features

- **Copy to Clipboard** - Copy note content to clipboard
- **Transfer to Apple Notes** - Create a new note in Apple Notes (opens via AppleScript)

## First Run

When you first use the global hotkey (Option+Command+N), macOS may ask for accessibility permissions. Grant them when prompted so the hotkey works properly.

## Notes Storage

Notes are stored in a SQLite database at `~/.floating-notes/notes.db`. Each note contains:
- Content (raw markdown)
- Title
- Creation timestamp
- Last-edited timestamp

## Development

The app consists of:
- `main.js` - Electron main process (window management, database, hotkeys)
- `preload.js` - IPC bridge (secure communication between processes)
- `renderer.js` - Frontend logic (UI interactions, auto-save)
- `index.html` - UI structure
- `styles.css` - Styling with dark/light mode support

## Known Limitations

- Very long notes (>100k characters) may impact performance
- Transfer to Apple Notes requires Apple Notes to be installed
- Liquid Glass doesn't update dynamically when you use other apps

## Future Enhancements

- Note search/filtering
- Syncing across devices
- Rich text preview mode
- Note tagging/organization
- Customizable window appearance
