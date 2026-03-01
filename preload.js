const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getNotes: () => ipcRenderer.send('get-notes'),
  getNote: (noteId) => ipcRenderer.send('get-note', noteId),
  saveNote: (noteId, content) => ipcRenderer.send('save-note', { noteId, content }),
  createNote: () => ipcRenderer.send('create-note'),
  deleteNote: (noteId) => ipcRenderer.send('delete-note', noteId),
  deleteAllNotes: () => ipcRenderer.send('delete-all-notes'),
  copyToClipboard: (content) => ipcRenderer.send('copy-to-clipboard', content),
  transferToAppleNotes: (content) => ipcRenderer.send('transfer-to-apple-notes', content),
  navigateNote: (direction) => ipcRenderer.send('navigate-note', direction),
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),
  resizeWindowHeight: (height) => ipcRenderer.send('resize-window-height', height),
  saveNoteTitle: (noteId, title) => ipcRenderer.send('save-note-title', { noteId, title }),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),

  onNotesLoaded: (callback) => ipcRenderer.on('load-notes', (event, data) => callback(data)),
  onNotesList: (callback) => ipcRenderer.on('notes-list', (event, notes) => callback(notes)),
  onNoteContent: (callback) => ipcRenderer.on('note-content', (event, note) => callback(note)),
  onNoteSaved: (callback) => ipcRenderer.on('note-saved', (event, data) => callback(data)),
  onClipboardCopied: (callback) => ipcRenderer.on('clipboard-copied', () => callback()),
  onNoteTransferred: (callback) => ipcRenderer.on('note-transferred', () => callback()),
  onTransferError: (callback) => ipcRenderer.on('transfer-error', (event, error) => callback(error)),
  onAllNotesDeleted: (callback) => ipcRenderer.on('all-notes-deleted', () => callback())
});
