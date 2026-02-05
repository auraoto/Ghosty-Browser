const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ghosty", {
  tabs: {
    list: () => ipcRenderer.invoke("tabs:list"),
    create: (url) => ipcRenderer.invoke("tabs:create", url),
    close: (id) => ipcRenderer.invoke("tabs:close", id),
    activate: (id) => ipcRenderer.invoke("tabs:activate", id),
  },
  nav: {
    back: () => ipcRenderer.invoke("nav:back"),
    forward: () => ipcRenderer.invoke("nav:forward"),
    reload: () => ipcRenderer.invoke("nav:reload"),
    stop: () => ipcRenderer.invoke("nav:stop"),
    go: (url) => ipcRenderer.invoke("nav:go", url),
  },
  ui: {
    setChromeHeight: (height) => ipcRenderer.send("ui:height", height),
    setPanelWidth: (width) => ipcRenderer.send("ui:panel", width),
  },
  history: {
    list: () => ipcRenderer.invoke("history:list"),
    clear: () => ipcRenderer.invoke("history:clear"),
  },
  bookmarks: {
    list: () => ipcRenderer.invoke("bookmarks:list"),
    add: (payload) => ipcRenderer.invoke("bookmarks:add", payload),
    remove: (id) => ipcRenderer.invoke("bookmarks:remove", id),
    clear: () => ipcRenderer.invoke("bookmarks:clear"),
  },
  downloads: {
    list: () => ipcRenderer.invoke("downloads:list"),
  },
  privacy: {
    setAnonymous: (value) => ipcRenderer.invoke("privacy:set", value),
  },
  onTabsUpdated: (callback) => {
    ipcRenderer.on("tabs:updated", (_event, payload) => callback(payload));
  },
  onActiveState: (callback) => {
    ipcRenderer.on("tab:active", (_event, payload) => callback(payload));
  },
  onHistoryUpdated: (callback) => {
    ipcRenderer.on("history:updated", (_event, payload) => callback(payload));
  },
  onBookmarksUpdated: (callback) => {
    ipcRenderer.on("bookmarks:updated", (_event, payload) => callback(payload));
  },
  onDownloadsUpdated: (callback) => {
    ipcRenderer.on("downloads:updated", (_event, payload) => callback(payload));
  },
});
