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

// ─── Anthropic AI streaming IPC ──────────────────────────────────────
// Keys never touch the renderer bundle — they live here in the main process only.
let Anthropic
try { Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk') } catch {}

function getAnthropicClient() {
  if (!Anthropic) throw new Error('Anthropic SDK not available')
  const apiKey = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment')
  return new Anthropic({ apiKey })
}

// Stream AI response — sends chunks back via 'ai:chunk', then 'ai:done' or 'ai:error'
ipcMain.on('ai:stream', async (event, { messages, system, model, maxTokens, temperature, requestId }) => {
  if (!requestId) return
  try {
    const client = getAnthropicClient()
    const params = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens || 8192,
      messages,
    }
    if (system) params.system = system
    if (temperature !== undefined) params.temperature = Math.min(temperature, 1.0)

    const stream = client.messages.stream(params)
    for await (const chunk of stream) {
      if (event.sender.isDestroyed()) break
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        event.sender.send('ai:chunk', { requestId, text: chunk.delta.text })
      }
    }
    if (!event.sender.isDestroyed()) {
      event.sender.send('ai:done', { requestId })
    }
  } catch (err) {
    if (!event.sender.isDestroyed()) {
      event.sender.send('ai:error', { requestId, message: err.message })
    }
  }
})

// Single-shot AI call (non-streaming)
ipcMain.handle('ai:generate', async (_event, { messages, system, model, maxTokens, temperature }) => {
  const client = getAnthropicClient()
  const params = {
    model: model || 'claude-sonnet-4-6',
    max_tokens: maxTokens || 8192,
    messages,
  }
  if (system) params.system = system
  if (temperature !== undefined) params.temperature = Math.min(temperature, 1.0)

  const response = await client.messages.create(params)
  return response.content[0]?.text ?? ''
})

// ─── GitHub API proxy IPC ─────────────────────────────────────────────
// Keeps the GitHub token in the main process, out of the renderer bundle.
async function githubFetch(path, options = {}) {
  const token = process.env.VITE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || ''
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

ipcMain.handle('github:request', async (_event, { path, method = 'GET', body }) => {
  return githubFetch(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  })
})

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
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── Load .env in development ─────────────────────────────────────────
if (isDev) {
  try {
    const envPath = path.join(__dirname, '../.env')
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx < 0) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch {}
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
