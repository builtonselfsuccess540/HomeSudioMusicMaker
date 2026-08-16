'use strict'
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = !app.isPackaged

function createWindow() {
  const iconPath = path.join(__dirname, '../assets/icon.png')
  const win = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  1024,
    minHeight: 700,
    backgroundColor: '#080810',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    title: 'Home Studio Music Maker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5174')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

// ─── VST directory lists (Windows standard locations) ────────────────
const VST2_DIRS = [
  'C:\\Program Files\\VSTPlugins',
  'C:\\Program Files\\Steinberg\\VSTPlugins',
  'C:\\Program Files\\Common Files\\VST2',
  'C:\\Program Files (x86)\\VSTPlugins',
  'C:\\Program Files (x86)\\Steinberg\\VSTPlugins',
]
const VST3_DIRS = [
  'C:\\Program Files\\Common Files\\VST3',
  'C:\\Program Files (x86)\\Common Files\\VST3',
]

function readDirSafe(dir) {
  try {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch { return [] }
}

function scanPluginsInDir(dir, type) {
  const ext = type === 'VST2' ? '.dll' : '.vst3'
  return readDirSafe(dir)
    .filter(e => (e.isFile() || e.isDirectory()) && e.name.toLowerCase().endsWith(ext))
    .map(e => ({
      name: e.name.replace(new RegExp(`\\${ext}$`, 'i'), ''),
      file: path.join(dir, e.name),
      dir,
      type,
    }))
}

function scanAllVSTs() {
  const vst2 = VST2_DIRS.flatMap(d => scanPluginsInDir(d, 'VST2'))
  const vst3 = VST3_DIRS.flatMap(d => scanPluginsInDir(d, 'VST3'))
  return { vst2, vst3, dirs: { vst2: VST2_DIRS, vst3: VST3_DIRS } }
}

// ─── IPC ─────────────────────────────────────────────────────────────
ipcMain.handle('vst:scan', () => scanAllVSTs())

ipcMain.handle('vst:browse-dir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Add VST Plugin Folder',
  })
  if (result.canceled || !result.filePaths[0]) return null
  const dir = result.filePaths[0]
  const vst2 = scanPluginsInDir(dir, 'VST2')
  const vst3 = scanPluginsInDir(dir, 'VST3')
  return { dir, plugins: [...vst2, ...vst3] }
})

// ─── Native app menu ─────────────────────────────────────────────────
function buildMenu(mainWin) {
  const send = (ch) => mainWin?.webContents.send(ch)
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project',  accelerator: 'CmdOrCtrl+N', click: () => send('menu:new-project') },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save-project') },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ],
    },
    {
      label: 'Audio',
      submenu: [
        { label: 'Rescan VST Plugins', click: () => send('vst:rescan') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── Lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const mainWin = createWindow()
  buildMenu(mainWin)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
