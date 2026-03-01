const editor       = document.getElementById('editor');
const noteTitle    = document.getElementById('noteTitle');
const copyBtn      = document.getElementById('copyBtn');
const transferBtn  = document.getElementById('transferBtn');
const boldBtn      = document.getElementById('boldBtn');
const italicBtn    = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const bulletBtn    = document.getElementById('bulletBtn');
const todoBtn      = document.getElementById('todoBtn');
const linkBtn      = document.getElementById('linkBtn');
const newNoteBtn   = document.getElementById('newNoteBtn');
const deleteNoteBtn= document.getElementById('deleteNoteBtn');
const notification = document.getElementById('notification');
const timestamps   = document.getElementById('timestamps');

// Traffic lights
const closeBtn    = document.getElementById('closeBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');

// Link dialog
const linkDialog    = document.getElementById('linkDialog');
const linkTextInput = document.getElementById('linkTextInput');
const linkUrlInput  = document.getElementById('linkUrlInput');
const linkCancelBtn = document.getElementById('linkCancelBtn');
const linkInsertBtn = document.getElementById('linkInsertBtn');

// Shortcuts panel
const shortcutsBtn      = document.getElementById('shortcutsBtn');
const shortcutsPanel    = document.getElementById('shortcutsPanel');
const shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');

// All Notes panel
const allNotesBtn       = document.getElementById('allNotesBtn');
const allNotesPanel     = document.getElementById('allNotesPanel');
const allNotesCloseBtn  = document.getElementById('allNotesCloseBtn');
const allNotesList      = document.getElementById('allNotesList');
const deleteAllNotesBtn = document.getElementById('deleteAllNotesBtn');

let currentNote = null;
let notes = [];
let autoSaveTimeout;
let titleSaveTimeout;
let focusTitleOnNextLoad = false;
let savedSelection = null; // for restoring caret after link dialog

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────
function initialize() {
  window.electronAPI.onNotesLoaded(({ notes: allNotes, currentNote: note }) => {
    notes = allNotes;
    loadNote(note);
  });

  window.electronAPI.onNotesList((allNotes) => {
    notes = allNotes;
    if (allNotesPanel.style.display !== 'none') renderAllNotesList();
  });

  window.electronAPI.onNoteContent((note) => {
    loadNote(note);
  });

  window.electronAPI.onNoteSaved(() => {
    updateTimestamps();
  });

  window.electronAPI.onClipboardCopied(() => {
    showNotification('Copied to clipboard');
  });

  window.electronAPI.onNoteTransferred(() => {
    showNotification('Transferred to Apple Notes');
  });

  window.electronAPI.onTransferError((error) => {
    showNotification('Error: ' + error, true);
  });
}

// ─────────────────────────────────────────────────────────
// Load / Save
// ─────────────────────────────────────────────────────────
// Migrate legacy ☐ / ☑ plain text to interactive todo-check spans
function migrateTodoText(html) {
  if (!html) return html;
  return html
    .replace(/☑ /g, '<span class="todo-check checked" contenteditable="false"></span> ')
    .replace(/☐ /g, '<span class="todo-check" contenteditable="false"></span> ');
}

function loadNote(note) {
  currentNote = note;
  // Migrate legacy ☐/☑ text to interactive spans, then set content
  editor.innerHTML = migrateTodoText(note.content || '');
  noteTitle.value  = note.title;
  updateTimestamps();
  // Allow shrinking when switching notes; setTimeout lets layout fully settle
  setTimeout(() => adjustWindowHeight(true), 80);
  // Auto-focus title when a new note is created
  if (focusTitleOnNextLoad) {
    focusTitleOnNextLoad = false;
    requestAnimationFrame(() => { noteTitle.focus(); noteTitle.select(); });
  }
}

function getPlainText() {
  // innerText converts <br> → newlines and strips HTML tags
  return editor.innerText;
}

function saveNote() {
  if (!currentNote) return;
  const html = editor.innerHTML;
  window.electronAPI.saveNote(currentNote.id, html);
  currentNote.content = html;
}

function autoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(saveNote, 1000);
}

// ─────────────────────────────────────────────────────────
// Timestamps
// ─────────────────────────────────────────────────────────
function updateTimestamps() {
  if (!currentNote) return;
  const createdDate = new Date(currentNote.createdAt);
  const updatedDate = new Date(currentNote.updatedAt);

  const formatTime = (date) => {
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (date.toDateString() === today.toDateString())     return timeStr;
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday ' + timeStr;
    return dateStr + ' ' + timeStr;
  };

  timestamps.innerHTML = `Created: ${formatTime(createdDate)}<br>Last edited: ${formatTime(updatedDate)}`;
}

// ─────────────────────────────────────────────────────────
// Window sizing
// ─────────────────────────────────────────────────────────
function adjustWindowHeight(allowShrink = false) {
  // Compute ideal window height = non-editor chrome + editor content
  // container.offsetHeight fills 100vh; subtracting the flex editor-wrapper
  // gives us the fixed chrome (header + toolbar + footer + gaps + padding).
  const container    = document.querySelector('.container');
  const editorWrapper = document.querySelector('.editor-wrapper');
  const chromeH  = container.offsetHeight - editorWrapper.offsetHeight;
  const idealH   = Math.max(200, Math.min(700, chromeH + editor.scrollHeight));
  const currentH = window.outerHeight || 300;

  if (idealH > currentH || (allowShrink && idealH < currentH)) {
    window.electronAPI.resizeWindowHeight(Math.round(idealH));
  }
}

// ─────────────────────────────────────────────────────────
// Notification
// ─────────────────────────────────────────────────────────
function showNotification(message, isError = false) {
  notification.textContent = message;
  notification.style.background = isError ? '#FF3B30' : '';
  notification.classList.add('show');
  setTimeout(() => {
    notification.classList.remove('show');
    notification.style.background = '';
  }, 2000);
}

// ─────────────────────────────────────────────────────────
// All Notes panel
// ─────────────────────────────────────────────────────────
function renderAllNotesList() {
  allNotesList.innerHTML = '';
  notes.forEach((note) => {
    const item = document.createElement('div');
    item.className = 'note-list-item' + (currentNote && note.id === currentNote.id ? ' active' : '');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'note-list-item-title';
    titleSpan.textContent = note.title || 'Untitled';

    const delBtn = document.createElement('button');
    delBtn.className = 'note-list-delete';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete note';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (notes.length === 1) { showNotification('Cannot delete the last note', true); return; }
      window.electronAPI.deleteNote(note.id);
    });

    item.appendChild(titleSpan);
    item.appendChild(delBtn);
    item.addEventListener('click', () => {
      window.electronAPI.getNote(note.id);
      allNotesPanel.style.display = 'none';
    });

    allNotesList.appendChild(item);
  });
}

allNotesBtn.addEventListener('click', () => {
  const isOpen = allNotesPanel.style.display !== 'none';
  shortcutsPanel.style.display = 'none';
  if (isOpen) {
    allNotesPanel.style.display = 'none';
  } else {
    renderAllNotesList();
    allNotesPanel.style.display = 'flex';
  }
});
allNotesCloseBtn.addEventListener('click', () => {
  allNotesPanel.style.display = 'none';
});
deleteAllNotesBtn.addEventListener('click', () => {
  if (confirm('Delete ALL notes? This cannot be undone.')) {
    window.electronAPI.deleteAllNotes();
    allNotesPanel.style.display = 'none';
  }
});

// ─────────────────────────────────────────────────────────
// Formatting — execCommand (works with contenteditable)
// ─────────────────────────────────────────────────────────
function formatText(command) {
  editor.focus();
  document.execCommand(command, false, null);
  autoSave();
}

// ─────────────────────────────────────────────────────────
// Selection helpers (for link dialog)
// ─────────────────────────────────────────────────────────
function saveSelectionRange() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    savedSelection = sel.getRangeAt(0).cloneRange();
  } else {
    savedSelection = null;
  }
}

function restoreSelectionRange() {
  if (!savedSelection) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedSelection);
}

// ─────────────────────────────────────────────────────────
// Link dialog
// ─────────────────────────────────────────────────────────
function openLinkDialog() {
  saveSelectionRange();
  // Pre-fill text from current selection
  const sel = window.getSelection();
  linkTextInput.value = (sel && sel.toString().trim()) ? sel.toString().trim() : '';
  linkUrlInput.value  = '';
  linkDialog.style.display = 'flex';
  linkTextInput.focus();
}

function closeLinkDialog() {
  linkDialog.style.display = 'none';
  linkTextInput.value = '';
  linkUrlInput.value  = '';
  editor.focus();
}

function insertLink() {
  const text = linkTextInput.value.trim();
  const url  = linkUrlInput.value.trim();
  if (!text || !url) { closeLinkDialog(); return; }
  const href = url.startsWith('http') ? url : 'https://' + url;
  restoreSelectionRange();
  document.execCommand('insertHTML', false,
    `<a href="${href}" target="_blank" style="color:var(--accent);text-decoration:underline">${text}</a>`);
  closeLinkDialog();
  autoSave();
}

linkBtn.addEventListener('click', openLinkDialog);
linkCancelBtn.addEventListener('click', closeLinkDialog);
linkInsertBtn.addEventListener('click', insertLink);

linkUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter')  { e.preventDefault(); insertLink(); }
  if (e.key === 'Escape') { e.preventDefault(); closeLinkDialog(); }
});
linkTextInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeLinkDialog(); }
  if (e.key === 'Enter')  { e.preventDefault(); linkUrlInput.focus(); }
});

// ─────────────────────────────────────────────────────────
// Shortcuts panel
// ─────────────────────────────────────────────────────────
shortcutsBtn.addEventListener('click', () => {
  const isOpen = shortcutsPanel.style.display !== 'none';
  allNotesPanel.style.display = 'none';
  shortcutsPanel.style.display = isOpen ? 'none' : 'flex';
});
shortcutsCloseBtn.addEventListener('click', () => {
  shortcutsPanel.style.display = 'none';
});

// ─────────────────────────────────────────────────────────
// Traffic lights
// ─────────────────────────────────────────────────────────
closeBtn.addEventListener('click',    () => window.electronAPI.closeWindow());
minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());

// ─────────────────────────────────────────────────────────
// Toolbar buttons
// ─────────────────────────────────────────────────────────
boldBtn.addEventListener('click',      () => formatText('bold'));
italicBtn.addEventListener('click',    () => formatText('italic'));
underlineBtn.addEventListener('click', () => formatText('underline'));

// ─────────────────────────────────────────────────────────
// Bullet / To-do helpers
// ─────────────────────────────────────────────────────────
function getCurrentBlock() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== editor && node.parentElement !== editor) {
    node = node.parentElement;
  }
  return (node && node !== editor) ? node : null;
}

function getFirstTextNode(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  return walker.nextNode();
}

function blockHasTodoCb(block) {
  const fc = block.firstChild;
  return fc && fc.nodeType === Node.ELEMENT_NODE && fc.classList.contains('todo-check');
}

function createTodoSpan() {
  const span = document.createElement('span');
  span.className = 'todo-check';
  span.contentEditable = 'false';
  return span;
}

function insertTodoAtCursor() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const span = createTodoSpan();
  const space = document.createTextNode(' ');
  range.insertNode(space);
  range.insertNode(span);
  range.setStartAfter(space);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Toggle todo-check span on click
editor.addEventListener('click', (e) => {
  const cb = e.target.closest('.todo-check');
  if (!cb) return;
  cb.classList.toggle('checked');
  autoSave();
});

bulletBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep focus/caret in editor
});
bulletBtn.addEventListener('click', () => {
  const block = getCurrentBlock();
  if (block) {
    if (blockHasTodoCb(block)) {
      // Switch todo-span → bullet: remove span, prepend '• '
      const todoCb = block.firstChild;
      const afterSpan = todoCb.nextSibling;
      todoCb.remove();
      if (afterSpan && afterSpan.nodeType === Node.TEXT_NODE) {
        afterSpan.textContent = '• ' + afterSpan.textContent.trimStart();
      } else {
        block.insertBefore(document.createTextNode('• '), block.firstChild);
      }
      autoSave(); return;
    }
    const text = block.innerText || block.textContent || '';
    if (text.startsWith('• ')) { autoSave(); return; } // already bullet
  }
  editor.focus();
  document.execCommand('insertText', false, '• ');
  autoSave();
});

todoBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // keep focus/caret in editor
});
todoBtn.addEventListener('click', () => {
  const block = getCurrentBlock();
  if (block) {
    if (blockHasTodoCb(block)) { autoSave(); return; } // already todo
    const text = block.innerText || block.textContent || '';
    if (text.startsWith('• ')) {
      // Switch bullet → todo-span: remove '• ', prepend span
      const node = getFirstTextNode(block);
      if (node && node.textContent.startsWith('• ')) {
        node.textContent = node.textContent.slice(2);
        const span = createTodoSpan();
        const space = document.createTextNode(' ');
        block.insertBefore(space, node);
        block.insertBefore(span, space);
        autoSave(); return;
      }
    }
  }
  editor.focus();
  insertTodoAtCursor();
  autoSave();
});

// ─────────────────────────────────────────────────────────
// Copy / Transfer
// ─────────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  window.electronAPI.copyToClipboard(getPlainText());
});

transferBtn.addEventListener('click', () => {
  window.electronAPI.transferToAppleNotes(getPlainText());
});

// ─────────────────────────────────────────────────────────
// Note management buttons
// ─────────────────────────────────────────────────────────
newNoteBtn.addEventListener('click', () => {
  focusTitleOnNextLoad = true;
  window.electronAPI.createNote();
});

deleteNoteBtn.addEventListener('click', () => {
  if (notes.length === 1) {
    showNotification('Cannot delete the last note', true);
    return;
  }
  if (confirm('Delete this note?')) {
    window.electronAPI.deleteNote(currentNote.id);
  }
});

noteTitle.addEventListener('input', () => {
  if (!currentNote) return;
  const newTitle = noteTitle.value;
  currentNote.title = newTitle;
  // Keep notes array in sync so All Notes panel reflects changes live
  const idx = notes.findIndex(n => n.id === currentNote.id);
  if (idx !== -1) notes[idx] = { ...notes[idx], title: newTitle };
  if (allNotesPanel.style.display !== 'none') renderAllNotesList();
  // Debounce-save title to DB
  clearTimeout(titleSaveTimeout);
  titleSaveTimeout = setTimeout(() => {
    window.electronAPI.saveNoteTitle(currentNote.id, newTitle);
  }, 600);
});

noteTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false); // cursor at end
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

// ─────────────────────────────────────────────────────────
// Editor input
// ─────────────────────────────────────────────────────────
editor.addEventListener('input', () => {
  autoSave();
  adjustWindowHeight();
});

// ─────────────────────────────────────────────────────────
// Keydown — shortcuts + space auto-formatting
// ─────────────────────────────────────────────────────────
editor.addEventListener('keydown', (e) => {

  // ── Space-triggered auto-formatting ──────────────────
  if (e.key === ' ') {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node  = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const textBefore = node.textContent.substring(0, range.startOffset);

    // "- " → bullet • (direct text-node edit avoids Chromium new-line bug)
    if (textBefore.endsWith('-')) {
      e.preventDefault();
      const beforeDash = node.textContent.substring(0, range.startOffset - 1);
      const afterDash  = node.textContent.substring(range.startOffset);
      // Remove opposing ☐ prefix from line start (exclusivity)
      const stripped = beforeDash.startsWith('☐ ') ? beforeDash.slice(2) : beforeDash;
      node.textContent = stripped + '• ' + afterDash;
      const newRange = document.createRange();
      newRange.setStart(node, stripped.length + 2);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      autoSave();
      return;
    }

    // "[]" → interactive to-do checkbox span
    if (textBefore.endsWith('[]')) {
      e.preventDefault();
      const beforeBrackets = node.textContent.substring(0, range.startOffset - 2);
      const afterBrackets  = node.textContent.substring(range.startOffset);
      const stripped = beforeBrackets.startsWith('• ') ? beforeBrackets.slice(2) : beforeBrackets;
      // Rewrite this text node to just the "before" text
      node.textContent = stripped;
      // Insert todo span + space + remaining text after this text node
      const parent   = node.parentNode;
      const nextSib  = node.nextSibling;
      const span     = createTodoSpan();
      const afterNode = document.createTextNode(' ' + afterBrackets);
      parent.insertBefore(span, nextSib);
      parent.insertBefore(afterNode, span.nextSibling);
      // Place cursor after the space
      const newRange = document.createRange();
      newRange.setStart(afterNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      autoSave();
      return;
    }
  }

  // ── Enter → continue bullet / todo lists ─────────────
  if (e.key === 'Enter' && !e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node  = range.startContainer;

    // Find the direct child of editor that contains the cursor
    let block = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
    while (block && block.parentElement !== editor && block !== editor) {
      block = block.parentElement;
    }
    if (!block || block === editor) return;

    const lineText = block.innerText !== undefined ? block.innerText : block.textContent;
    const isTodo   = blockHasTodoCb(block);
    let prefix = null;
    if (lineText.startsWith('• ')) prefix = '• ';
    else if (isTodo)               prefix = 'todo';
    if (!prefix) return;

    e.preventDefault();
    const isEmpty = isTodo ? lineText.trim() === '' : lineText.trim() === prefix.trim();
    if (isEmpty) {
      // Empty list item — clear prefix and exit list mode
      block.innerHTML = '<br>';
      const r = document.createRange();
      r.setStart(block, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      document.execCommand('insertParagraph', false, null);
      if (isTodo) {
        // Insert a fresh unchecked todo span on the new line
        const newSel = window.getSelection();
        if (newSel && newSel.rangeCount > 0) {
          const nr = newSel.getRangeAt(0);
          const span  = createTodoSpan();
          const space = document.createTextNode(' ');
          nr.insertNode(space);
          nr.insertNode(span);
          nr.setStartAfter(space);
          nr.collapse(true);
          newSel.removeAllRanges();
          newSel.addRange(nr);
        }
      } else {
        document.execCommand('insertText', false, prefix);
      }
    }
    autoSave();
  }

  // ── Navigation ────────────────────────────────────────
  if (e.metaKey && !e.shiftKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    window.electronAPI.navigateNote('prev');
  }
  if (e.metaKey && !e.shiftKey && e.key === 'ArrowRight') {
    e.preventDefault();
    window.electronAPI.navigateNote('next');
  }

  // ── Formatting ────────────────────────────────────────
  if (e.metaKey && !e.shiftKey && e.key === 'b') { e.preventDefault(); formatText('bold'); }
  if (e.metaKey && !e.shiftKey && e.key === 'i') { e.preventDefault(); formatText('italic'); }
  if (e.metaKey && !e.shiftKey && e.key === 'u') { e.preventDefault(); formatText('underline'); }

  // ── Note management ───────────────────────────────────
  if (e.metaKey && !e.shiftKey && e.key === 'n') {
    e.preventDefault();
    focusTitleOnNextLoad = true;
    window.electronAPI.createNote();
  }

  // Cmd+Delete → delete current note
  if (e.metaKey && !e.shiftKey && e.key === 'Backspace') {
    e.preventDefault();
    if (notes.length === 1) { showNotification('Cannot delete the last note', true); return; }
    if (confirm('Delete this note?')) window.electronAPI.deleteNote(currentNote.id);
  }

  // Cmd+Shift+Delete → delete ALL notes (double confirm)
  if (e.metaKey && e.shiftKey && e.key === 'Backspace') {
    e.preventDefault();
    if (!confirm('Delete ALL notes? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? Every note will be permanently deleted.')) return;
    window.electronAPI.deleteAllNotes();
  }

  // Cmd+Enter → copy to clipboard
  if (e.metaKey && e.key === 'Enter') {
    e.preventDefault();
    window.electronAPI.copyToClipboard(getPlainText());
  }
});

// ─────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────
initialize();
