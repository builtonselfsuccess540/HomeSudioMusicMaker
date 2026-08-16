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
})
