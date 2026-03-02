const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const os = require('os');

// Native Liquid Glass — NSGlassEffectView (macOS 26 Tahoe+)
let liquidGlass = null;
try {
  liquidGlass = require('electron-liquid-glass'); // CJS export is the instance directly
  console.log('electron-liquid-glass loaded, glass supported:', liquidGlass.isGlassSupported());
} catch (e) {
  console.log('electron-liquid-glass not available, falling back to vibrancy:', e.message);
}

// ── Settings ──────────────────────────────────────────────
const SETTINGS_PATH = path.join(os.homedir(), '.floating-notes', 'settings.json');

const DEFAULT_SETTINGS = {
  showInDock:    false,
  alwaysOnTop:   true,
  launchAtLogin: false,
  fontSize:      'medium',  // 'small' | 'medium' | 'large'
  theme:         'system'   // 'system' | 'light' | 'dark'
};

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

let appSettings = loadSettings();

// Initialize database
const dbPath = path.join(os.homedir(), '.floating-notes', 'notes.db');
const dbDir = path.dirname(dbPath);

// Create directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

let mainWindow;
let tray;
let currentNoteId = null;
let windowVisible = true;
const COMPACT_HEIGHT = 300;
const EXPANDED_HEIGHT = 680;
const WINDOW_WIDTH = 380;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: COMPACT_HEIGHT,
    minWidth: 280,
    minHeight: 200,
    maxHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false   // prevent compositor from throttling when not focused
    },
    transparent: true,
    vibrancy: liquidGlass ? undefined : 'under-window',
    // 'active' forces NSVisualEffectView to always sample live backdrop
    // (followsWindowActiveState freezes when another app takes focus)
    visualEffectState: liquidGlass ? undefined : 'active',
    frame: false,
    show: false
  });

  mainWindow.loadFile('index.html');

  // Show window after loading
  mainWindow.once('ready-to-show', () => {
    // 'status' level — above floating, participates fully in the macOS
    // compositor chain, allowing live backdrop sampling for glass/vibrancy
    if (appSettings.alwaysOnTop) mainWindow.setAlwaysOnTop(true, 'status');
    mainWindow.show();
    windowVisible = true;
    // Apply native Liquid Glass (NSGlassEffectView) if available
    if (liquidGlass && liquidGlass.isGlassSupported()) {
      try {
        const glassId = liquidGlass.addView(mainWindow.getNativeWindowHandle(), {
          cornerRadius: 20
        });
        // Use "clear" variant for maximum transparency
        liquidGlass.setVariant(glassId, liquidGlass.GlassMaterialVariant.clear);
        console.log('Liquid Glass applied, glassId:', glassId);
      } catch (e) {
        console.log('liquidGlass.addView failed:', e.message);
      }
    } else {
      console.log('Liquid Glass not supported, using vibrancy fallback');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Vibrancy fallback: toggling setVibrancy forces macOS to re-establish
  // live CABackdropLayer sampling (prevents the "frozen" backdrop bug)
  if (!liquidGlass) {
    mainWindow.on('blur', () => {
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.setVibrancy(null);
          setTimeout(() => {
            if (mainWindow) mainWindow.setVibrancy('under-window');
          }, 50);
        }
      }, 100);
    });
  }
}

function toggleWindow() {
  if (windowVisible && mainWindow) {
    mainWindow.hide();
    windowVisible = false;
  } else if (!windowVisible && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    windowVisible = true;
  }
}

// Keep the app alive when the window is closed (Tray keeps it running)
app.on('window-all-closed', (e) => e.preventDefault());

app.on('ready', () => {
  // Apply dock setting from persisted preferences
  if (appSettings.showInDock) {
    app.dock.show();
  } else {
    app.dock.hide();
  }
  app.setLoginItemSettings({ openAtLogin: appSettings.launchAtLogin });

  createWindow();

  // Menu Bar tray icon
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'resources', 'icon.png'))
    .resize({ width: 16, height: 16 });
  trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  tray.setToolTip('FloatNote');
  tray.on('click', () => toggleWindow());
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Settings',
        click: () => {
          if (!windowVisible && mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            windowVisible = true;
          }
          mainWindow.webContents.send('open-settings-panel');
        }
      },
      { type: 'separator' },
      { label: 'Quit FloatNotes', click: () => app.quit() }
    ]);
    tray.popUpContextMenu(contextMenu);
  });

  // Register global hotkey: Option+Command+N
  const ret = globalShortcut.register('Option+Cmd+n', () => {
    toggleWindow();
  });

  if (!ret) {
    console.log('Failed to register global hotkey');
  }

  // Get or create first note
  const stmt = db.prepare('SELECT id FROM notes ORDER BY createdAt ASC LIMIT 1');
  const firstNote = stmt.get();

  if (!firstNote) {
    // Create default note
    const noteId = Date.now().toString();
    const now = Date.now();
    db.prepare('INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(noteId, 'Note 1', '', now, now);
    currentNoteId = noteId;
  } else {
    currentNoteId = firstNote.id;
  }

  // Send initial note data and settings to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    const notes = db.prepare('SELECT id, title FROM notes ORDER BY createdAt ASC').all();
    const currentNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(currentNoteId);
    mainWindow.webContents.send('load-notes', { notes, currentNote });
    mainWindow.webContents.send('load-settings', appSettings);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  db.close();
});

// IPC Handlers

ipcMain.on('get-notes', (event) => {
  const notes = db.prepare('SELECT id, title FROM notes ORDER BY createdAt ASC').all();
  event.reply('notes-list', notes);
});

ipcMain.on('get-note', (event, noteId) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (note) {
    currentNoteId = noteId;
    event.reply('note-content', note);
  }
});

ipcMain.on('save-note', (event, { noteId, content }) => {
  const now = Date.now();
  db.prepare('UPDATE notes SET content = ?, updatedAt = ? WHERE id = ?')
    .run(content, now, noteId);
  event.reply('note-saved', { noteId, updatedAt: now });
});

ipcMain.on('create-note', (event) => {
  const noteId = Date.now().toString();
  const now = Date.now();
  const noteNumber = db.prepare('SELECT COUNT(*) as count FROM notes').get().count + 1;
  const title = `Note ${noteNumber}`;

  db.prepare('INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(noteId, title, '', now, now);

  currentNoteId = noteId;
  const notes = db.prepare('SELECT id, title FROM notes ORDER BY createdAt ASC').all();
  event.reply('notes-list', notes);
  event.reply('note-content', { id: noteId, title, content: '', createdAt: now, updatedAt: now });
});

ipcMain.on('delete-note', (event, noteId) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);

  // Switch to first remaining note
  const firstNote = db.prepare('SELECT id FROM notes ORDER BY createdAt ASC LIMIT 1').get();
  if (firstNote) {
    currentNoteId = firstNote.id;
  } else {
    // Create a new default note if none exist
    const newNoteId = Date.now().toString();
    const now = Date.now();
    db.prepare('INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(newNoteId, 'Note 1', '', now, now);
    currentNoteId = newNoteId;
  }

  const notes = db.prepare('SELECT id, title FROM notes ORDER BY createdAt ASC').all();
  const currentNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(currentNoteId);
  event.reply('notes-list', notes);
  event.reply('note-content', currentNote);
});

ipcMain.on('delete-all-notes', (event) => {
  db.prepare('DELETE FROM notes').run();

  // Create a fresh default note
  const newNoteId = Date.now().toString();
  const now = Date.now();
  db.prepare('INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(newNoteId, 'Note 1', '', now, now);
  currentNoteId = newNoteId;

  const notes = db.prepare('SELECT id, title FROM notes ORDER BY createdAt ASC').all();
  const currentNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(currentNoteId);
  event.reply('notes-list', notes);
  event.reply('note-content', currentNote);
});

ipcMain.on('copy-to-clipboard', (event, content) => {
  clipboard.writeText(content);
  event.reply('clipboard-copied');
});

ipcMain.on('transfer-to-apple-notes', (event, content) => {
  // Write content to a temp file — avoids ALL AppleScript escaping issues
  const tmpPath = path.join(os.tmpdir(), `fn-content-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');

    const script = `tell application "Notes"
  set noteBody to read POSIX file "${tmpPath}" as «class utf8»
  make new note at default account with properties {body:noteBody}
end tell`;

    execSync(`osascript << 'APPLESCRIPT'\n${script}\nAPPLESCRIPT`, { encoding: 'utf8' });
    event.reply('note-transferred');
  } catch (error) {
    event.reply('transfer-error', error.message);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch (e) {}
  }
});

ipcMain.on('navigate-note', (event, direction) => {
  const notes = db.prepare('SELECT id FROM notes ORDER BY createdAt ASC').all();
  const currentIndex = notes.findIndex(n => n.id === currentNoteId);

  let nextIndex;
  if (direction === 'next') {
    nextIndex = currentIndex === notes.length - 1 ? 0 : currentIndex + 1;
  } else {
    nextIndex = currentIndex === 0 ? notes.length - 1 : currentIndex - 1;
  }

  const nextNoteId = notes[nextIndex].id;
  const nextNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(nextNoteId);
  currentNoteId = nextNoteId;
  event.reply('note-content', nextNote);
});

ipcMain.on('resize-window', (event, { width, height }) => {
  if (mainWindow) {
    mainWindow.setSize(width, height);
  }
});

ipcMain.on('get-settings', (event) => {
  event.reply('settings-data', appSettings);
});

ipcMain.on('save-settings', (event, partial) => {
  appSettings = { ...appSettings, ...partial };
  saveSettings(appSettings);

  if ('showInDock' in partial) {
    if (appSettings.showInDock) app.dock.show();
    else app.dock.hide();
  }
  if ('alwaysOnTop' in partial) {
    if (mainWindow) {
      if (appSettings.alwaysOnTop) mainWindow.setAlwaysOnTop(true, 'status');
      else mainWindow.setAlwaysOnTop(false);
    }
  }
  if ('launchAtLogin' in partial) {
    app.setLoginItemSettings({ openAtLogin: appSettings.launchAtLogin });
  }

  event.reply('settings-data', appSettings);
});

ipcMain.on('resize-window-height', (event, height) => {
  if (mainWindow) {
    const [currentWidth] = mainWindow.getSize();
    mainWindow.setSize(currentWidth, Math.round(height));
  }
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('save-note-title', (event, { noteId, title }) => {
  db.prepare('UPDATE notes SET title = ?, updatedAt = ? WHERE id = ?')
    .run(title, Date.now(), noteId);
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.hide();
    windowVisible = false;
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    const [, currentHeight] = mainWindow.getSize();
    if (currentHeight < EXPANDED_HEIGHT - 10) {
      mainWindow.setSize(WINDOW_WIDTH, EXPANDED_HEIGHT);
    } else {
      mainWindow.setSize(WINDOW_WIDTH, COMPACT_HEIGHT);
    }
  }
});
