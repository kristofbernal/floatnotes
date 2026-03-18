const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Tray, nativeImage, Menu, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Database = require('better-sqlite3');
const { execSync, spawn } = require('child_process');
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
  showInDock:     false,
  alwaysOnTop:    true,
  launchAtLogin:  false,
  fontSize:       'medium',       // 'small' | 'medium' | 'large'
  theme:          'system',       // 'system' | 'light' | 'dark'
  globalShortcut: 'Option+Cmd+N', // customizable global toggle shortcut
  onboarded:      false           // first-run gate
};

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    // Existing installs skip onboarding; fresh installs (catch branch) show it
    return { ...DEFAULT_SETTINGS, onboarded: true, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS }; // fresh install → onboarded:false triggers onboarding
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
let pendingUpdateZip = null;
let currentNoteId = null;
let windowVisible = true;
let registeredShortcut = null;
const COMPACT_HEIGHT = 300;
const EXPANDED_HEIGHT = 680;
const WINDOW_WIDTH = 380;

// ── DIY Updater (bypasses Squirrel.Mac, works without code signing) ───────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'FloatNotes-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https.get(u, { headers: { 'User-Agent': 'FloatNotes-Updater' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    }
    get(url);
  });
}

async function checkAndUpdate(manual = false) {
  if (!app.isPackaged) {
    if (manual && mainWindow) mainWindow.webContents.send('update-not-available');
    return;
  }
  try {
    const release = await fetchJSON('https://api.github.com/repos/kristofbernal/floatnotes/releases/latest');
    const latest = release.tag_name.replace('v', '');
    if (latest === app.getVersion()) {
      if (manual && mainWindow) mainWindow.webContents.send('update-not-available');
      return;
    }
    const zipAsset = release.assets.find(a => a.name.includes('mac') && a.name.endsWith('.zip'));
    if (!zipAsset) return;
    const tmpDir  = path.join(os.tmpdir(), 'floatnotes-update');
    fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'FloatNotes-update.zip');
    await downloadFile(zipAsset.browser_download_url, zipPath);
    pendingUpdateZip = zipPath;
    if (mainWindow) mainWindow.webContents.send('update-downloaded');
  } catch (e) {
    console.error('Update check failed:', e.message);
  }
}

function installUpdate() {
  if (!pendingUpdateZip) return;
  // /Applications/FloatNotes.app/Contents/MacOS/FloatNotes → /Applications/FloatNotes.app
  const appPath  = path.dirname(path.dirname(path.dirname(process.execPath)));
  const appsDir  = path.dirname(appPath);
  const zip      = pendingUpdateZip;
  const tmpDir   = path.dirname(zip);

  const script = [
    '#!/bin/bash',
    'sleep 2',
    `rm -rf "${appPath}"`,
    `/usr/bin/ditto -xk "${zip}" "${appsDir}"`,
    `touch "${appPath}/Contents/MacOS/FloatNotes"`,
    `open "${appPath}"`,
    `rm -rf "${tmpDir}"`,
  ].join('\n');

  const scriptPath = path.join(tmpDir, 'install.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  const child = spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  app.quit();
}

// ──────────────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: COMPACT_HEIGHT,
    minWidth: 340,
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

function registerGlobalShortcut(accelerator) {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }
  const success = globalShortcut.register(accelerator, toggleWindow);
  if (success) registeredShortcut = accelerator;
  return success;
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

// Dock icon click — show window if hidden
app.on('activate', () => {
  if (mainWindow && !windowVisible) {
    mainWindow.show();
    mainWindow.focus();
    windowVisible = true;
  }
});

app.on('ready', () => {
  // Apply dock setting from persisted preferences
  if (appSettings.showInDock) {
    app.dock.show();
  } else {
    app.dock.hide();
  }
  app.setLoginItemSettings({ openAtLogin: appSettings.launchAtLogin });

  // Apply saved theme to Chromium's rendering engine so color-scheme is respected
  nativeTheme.themeSource = appSettings.theme === 'system' ? 'system' : appSettings.theme;

  createWindow();

  // Native macOS application menu (FloatNotes > Check for Updates + standard menus)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'FloatNotes',
      submenu: [
        { label: 'About FloatNotes', role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => checkAndUpdate(true)
        },
        { type: 'separator' },
        { label: 'Hide FloatNotes', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit FloatNotes', accelerator: 'Cmd+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { type: 'separator' },
        { label: 'Bring All to Front', role: 'front' }
      ]
    }
  ]));

  // Menu Bar tray icon — use extraResources path when packaged, dev path otherwise
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, 'resources', 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('FloatNotes');
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
      {
        label: 'Check for Updates',
        click: () => checkAndUpdate(true)
      },
      { type: 'separator' },
      { label: 'Quit FloatNotes', click: () => app.quit() }
    ]);
    tray.popUpContextMenu(contextMenu);
  });

  // Check for updates on launch
  checkAndUpdate();

  ipcMain.on('restart-and-install', () => installUpdate());
  ipcMain.on('check-for-updates', () => checkAndUpdate(true));

  // Register global hotkey (customizable)
  const ret = registerGlobalShortcut(appSettings.globalShortcut || 'Option+Cmd+N');
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
    const _iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, 'resources', 'icon.png');
    mainWindow.webContents.send('load-settings', { ...appSettings, _iconPath, _version: app.getVersion() });
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
  if ('theme' in partial) {
    nativeTheme.themeSource = appSettings.theme === 'system' ? 'system' : appSettings.theme;
  }
  if ('globalShortcut' in partial) {
    const success = registerGlobalShortcut(appSettings.globalShortcut);
    if (!success) {
      // Roll back to the previously registered shortcut
      appSettings.globalShortcut = registeredShortcut || 'Option+Cmd+N';
      saveSettings(appSettings);
    }
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
