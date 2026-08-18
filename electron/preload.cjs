'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,

  vst: {
    scan:      ()   => ipcRenderer.invoke('vst:scan'),
    browseDir: ()   => ipcRenderer.invoke('vst:browse-dir'),
    onRescan:  (cb) => {
      const wrapped = () => cb()
      ipcRenderer.on('vst:rescan', wrapped)
      return () => ipcRenderer.removeListener('vst:rescan', wrapped)
    },
  },

  menu: {
    on: (channel, cb) => {
      const allowed = ['menu:new-project', 'menu:save-project']
      if (!allowed.includes(channel)) return () => {}
      const wrapped = () => cb()
      ipcRenderer.on(channel, wrapped)
      return () => ipcRenderer.removeListener(channel, wrapped)
    },
  },

  // Anthropic AI — keys never reach the renderer
  ai: {
    // Streaming: calls onChunk(text) for each token, returns a promise that resolves when done
    stream: (params, onChunk) => {
      return new Promise((resolve, reject) => {
        const requestId = Date.now().toString()

        const onChunkHandler = (_event, data) => {
          if (data.requestId === requestId) onChunk(data.text)
        }
        const onDoneHandler = (_event, data) => {
          if (data.requestId !== requestId) return
          cleanup()
          resolve()
        }
        const onErrorHandler = (_event, data) => {
          if (data.requestId !== requestId) return
          cleanup()
          reject(new Error(data.message))
        }

        function cleanup() {
          ipcRenderer.removeListener('ai:chunk', onChunkHandler)
          ipcRenderer.removeListener('ai:done', onDoneHandler)
          ipcRenderer.removeListener('ai:error', onErrorHandler)
        }

        ipcRenderer.on('ai:chunk', onChunkHandler)
        ipcRenderer.on('ai:done', onDoneHandler)
        ipcRenderer.on('ai:error', onErrorHandler)

        ipcRenderer.send('ai:stream', { ...params, requestId })
      })
    },

    // Single-shot generate (non-streaming)
    generate: (params) => ipcRenderer.invoke('ai:generate', params),
  },

  // GitHub API — token never reaches the renderer
  github: {
    request: (path, options = {}) => ipcRenderer.invoke('github:request', { path, ...options }),
  },
})
