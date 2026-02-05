const { app, BrowserWindow, BrowserView, ipcMain, session } = require("electron");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
let chromeHeight = 128;
let panelWidth = 0;
let isAnonymous = false;

let history = [];
let bookmarks = [];
let downloads = [];
let nextHistoryId = 1;
let nextBookmarkId = 1;
let nextDownloadId = 1;

let historyFile = "";
let bookmarksFile = "";
let downloadsFile = "";
const downloadSessions = new Set();

const defaultUrl = "about:blank";
const HISTORY_URL = "about:history";

const HISTORY_LIMIT = 500;

function loadJson(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveJson(filePath, payload) {
  if (!filePath || isAnonymous) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    // ignore persistence errors
  }
}

function initStorage() {
  const base = app.getPath("userData");
  historyFile = path.join(base, "history.json");
  bookmarksFile = path.join(base, "bookmarks.json");
  downloadsFile = path.join(base, "downloads.json");
  history = loadJson(historyFile, []);
  bookmarks = loadJson(bookmarksFile, []);
  downloads = loadJson(downloadsFile, []);
  nextHistoryId =
    history.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
  nextBookmarkId =
    bookmarks.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
  nextDownloadId =
    downloads.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}

function getHistorySorted() {
  return [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function sendHistory() {
  if (!mainWindow) return;
  const payload = getHistorySorted();
  mainWindow.webContents.send("history:updated", payload);
  refreshHistoryViews();
}

function sendBookmarks() {
  if (!mainWindow) return;
  mainWindow.webContents.send("bookmarks:updated", bookmarks);
}

function sendDownloads() {
  if (!mainWindow) return;
  mainWindow.webContents.send("downloads:updated", downloads);
}

function getPartition() {
  return isAnonymous ? "ghosty-incognito" : "persist:ghosty";
}

function ensureDownloadHandler(partition) {
  if (downloadSessions.has(partition)) return;
  downloadSessions.add(partition);
  const ses = session.fromPartition(partition);
  ses.on("will-download", (_event, item) => {
    const entry = {
      id: nextDownloadId++,
      url: item.getURL(),
      filename: item.getFilename(),
      status: "в процессе",
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
      endedAt: null,
      path: item.getSavePath?.() || "",
    };
    downloads.unshift(entry);
    if (downloads.length > 200) {
      downloads = downloads.slice(0, 200);
    }
    sendDownloads();
    saveJson(downloadsFile, downloads);

    item.on("updated", () => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      sendDownloads();
      saveJson(downloadsFile, downloads);
    });

    item.once("done", (_event, state) => {
      entry.status = state === "completed" ? "готово" : state;
      entry.endedAt = Date.now();
      entry.path = item.getSavePath?.() || entry.path;
      sendDownloads();
      saveJson(downloadsFile, downloads);
    });
  });
}

function isHistoryUrl(url) {
  return url === HISTORY_URL;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHistoryDate(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildHistoryHtml() {
  const items = getHistorySorted();
  const entries = items
    .map((item) => {
      const url = escapeHtml(item.url || "");
      const title = escapeHtml(item.title || item.url || "Без названия");
      const meta = `${formatHistoryDate(item.timestamp)} · ${url}`;
      return `
        <article class="entry">
          <a class="title" href="${url}">${title}</a>
          <div class="meta">${meta}</div>
        </article>`;
    })
    .join("");

  const empty = isAnonymous
    ? "История отключена в анонимном режиме."
    : "История пока пуста.";

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>История</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: "Space Grotesk", "Manrope", "Segoe UI", sans-serif;
        background: radial-gradient(circle at top right, rgba(255,255,255,0.06), transparent 40%), #0c0c0c;
        color: #f5f5f5;
        padding: 32px;
      }
      .shell {
        max-width: 900px;
        margin: 0 auto;
        background: rgba(18,18,18,0.78);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 30px 60px rgba(0,0,0,0.4);
      }
      h1 {
        font-size: 22px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        margin-bottom: 18px;
      }
      .hint {
        font-size: 12px;
        color: rgba(255,255,255,0.7);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-bottom: 20px;
      }
      .entry {
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(20,20,20,0.6);
        margin-bottom: 12px;
        transition: transform 200ms ease, border 200ms ease, background 200ms ease;
      }
      .entry:hover {
        transform: translateY(-2px);
        border-color: rgba(255,255,255,0.3);
      }
      .title {
        color: #f5f5f5;
        text-decoration: none;
        font-size: 15px;
        display: inline-block;
        margin-bottom: 6px;
      }
      .title:hover { text-decoration: underline; }
      .meta {
        font-size: 11px;
        color: rgba(255,255,255,0.65);
        word-break: break-all;
      }
      .empty {
        font-size: 14px;
        color: rgba(255,255,255,0.6);
        padding: 12px 0;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>История</h1>
      <div class="hint">about:history</div>
      ${entries || `<div class="empty">${empty}</div>`}
    </div>
  </body>
</html>`;
}

function loadHistoryPage(tab) {
  tab.isInternal = true;
  tab.virtualUrl = HISTORY_URL;
  tab.title = "История";
  tab.url = HISTORY_URL;
  const html = buildHistoryHtml();
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  tab.view.webContents.loadURL(dataUrl);
  sendTabs();
  sendActiveState();
}

function refreshHistoryViews() {
  for (const tab of tabs.values()) {
    if (tab.isInternal && tab.virtualUrl === HISTORY_URL) {
      loadHistoryPage(tab);
    }
  }
}

function recordHistory(tab, nextUrl) {
  if (isAnonymous) return;
  if (!nextUrl) return;
  if (
    nextUrl.startsWith("about:") ||
    nextUrl.startsWith("data:") ||
    nextUrl.startsWith("ghosty:")
  ) {
    return;
  }
  const entry = {
    id: nextHistoryId++,
    url: nextUrl,
    title: tab.title || nextUrl,
    timestamp: Date.now(),
  };
  history.unshift(entry);
  if (history.length > HISTORY_LIMIT) {
    history = history.slice(0, HISTORY_LIMIT);
  }
  tab.lastHistoryId = entry.id;
  saveJson(historyFile, history);
  sendHistory();
}

function updateHistoryTitle(tab) {
  if (isAnonymous || !tab.lastHistoryId) return;
  const entry = history.find((item) => item.id === tab.lastHistoryId);
  if (!entry) return;
  entry.title = tab.title || entry.title;
  saveJson(historyFile, history);
  sendHistory();
}

function clearStoredData() {
  try {
    if (historyFile) fs.rmSync(historyFile, { force: true });
    if (bookmarksFile) fs.rmSync(bookmarksFile, { force: true });
    if (downloadsFile) fs.rmSync(downloadsFile, { force: true });
  } catch (error) {
    // ignore
  }
  const persistent = session.fromPartition("persist:ghosty");
  return persistent.clearStorageData();
}

function resetTabs() {
  if (!mainWindow) return;
  for (const tab of tabs.values()) {
    try {
      if (tab.view) mainWindow.removeBrowserView(tab.view);
      tab.view?.webContents.destroy();
    } catch (error) {
      // ignore
    }
  }
  tabs.clear();
  activeTabId = null;
  createTab(defaultUrl, true);
}

async function setAnonymous(value) {
  if (isAnonymous === value) return;
  isAnonymous = value;

  if (isAnonymous) {
    await clearStoredData();
    history = [];
    bookmarks = [];
    downloads = [];
  } else {
    history = loadJson(historyFile, []);
    bookmarks = loadJson(bookmarksFile, []);
    downloads = loadJson(downloadsFile, []);
  }

  sendHistory();
  sendBookmarks();
  sendDownloads();
  resetTabs();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("resize", () => updateViewBounds());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (tabs.size === 0) {
      createTab(defaultUrl, true);
    }
    sendHistory();
    sendBookmarks();
    sendDownloads();
  });
}

function handleNavigation(tab, nextUrl) {
  if (tab.isInternal) {
    if (nextUrl.startsWith("data:text/html")) {
      tab.url = tab.virtualUrl || HISTORY_URL;
      sendTabs();
      sendActiveState();
      return;
    }
    tab.isInternal = false;
    tab.virtualUrl = null;
  }

  tab.url = nextUrl;
  recordHistory(tab, nextUrl);
  sendTabs();
  sendActiveState();
}

function createTab(url = defaultUrl, makeActive = true) {
  const partition = getPartition();
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition,
    },
  });
  ensureDownloadHandler(partition);

  const id = nextTabId++;
  const tab = {
    id,
    view,
    title: "Новая вкладка",
    url,
    isLoading: false,
    lastHistoryId: null,
    isInternal: false,
    virtualUrl: null,
  };

  tabs.set(id, tab);

  view.webContents.on("page-title-updated", (_event, title) => {
    tab.title = title || "Новая вкладка";
    if (!tab.isInternal) {
      updateHistoryTitle(tab);
    }
    sendTabs();
    if (tab.id === activeTabId) sendActiveState();
  });

  view.webContents.on("did-navigate", (_event, nextUrl) => {
    handleNavigation(tab, nextUrl);
  });

  view.webContents.on("did-navigate-in-page", (_event, nextUrl) => {
    handleNavigation(tab, nextUrl);
  });

  view.webContents.on("did-start-loading", () => {
    tab.isLoading = true;
    sendTabs();
    sendActiveState();
  });

  view.webContents.on("did-stop-loading", () => {
    tab.isLoading = false;
    sendTabs();
    sendActiveState();
  });

  view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    createTab(targetUrl, true);
    return { action: "deny" };
  });

  if (isHistoryUrl(url)) {
    loadHistoryPage(tab);
  } else {
    view.webContents.loadURL(url);
  }

  if (makeActive) {
    setActiveTab(id);
  } else {
    sendTabs();
  }

  return tab;
}

function setActiveTab(id) {
  const tab = tabs.get(id);
  if (!tab || !mainWindow) return;

  if (activeTabId && tabs.has(activeTabId)) {
    const current = tabs.get(activeTabId);
    if (current?.view) mainWindow.removeBrowserView(current.view);
  }

  activeTabId = id;
  mainWindow.setBrowserView(tab.view);
  updateViewBounds();
  sendTabs();
  sendActiveState();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab || !mainWindow) return;

  if (tab.view) {
    try {
      if (activeTabId === id) {
        mainWindow.removeBrowserView(tab.view);
      }
      tab.view.webContents.destroy();
    } catch (error) {
      // ignore
    }
  }

  tabs.delete(id);

  if (activeTabId === id) {
    const remaining = Array.from(tabs.keys());
    if (remaining.length) {
      setActiveTab(remaining[remaining.length - 1]);
    } else {
      createTab(defaultUrl, true);
    }
  } else {
    sendTabs();
  }
}

function updateViewBounds() {
  if (!mainWindow || !activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab) return;

  const [width, height] = mainWindow.getContentSize();
  const top = Math.max(chromeHeight, 88);
  const viewWidth = Math.max(0, width - panelWidth);
  tab.view.setBounds({ x: 0, y: top, width: viewWidth, height: height - top });
  tab.view.setAutoResize({ width: true, height: true });
}

function sendTabs() {
  if (!mainWindow) return;
  const payload = Array.from(tabs.values()).map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    isLoading: tab.isLoading,
    isActive: tab.id === activeTabId,
  }));
  mainWindow.webContents.send("tabs:updated", payload);
}

function sendActiveState() {
  if (!mainWindow || !activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab) return;
  const wc = tab.view.webContents;
  mainWindow.webContents.send("tab:active", {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    isLoading: tab.isLoading,
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
  });
}

ipcMain.handle("tabs:list", () => {
  return Array.from(tabs.values()).map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    isLoading: tab.isLoading,
    isActive: tab.id === activeTabId,
  }));
});

ipcMain.handle("tabs:create", (_event, url) => {
  const tab = createTab(url || defaultUrl, true);
  return tab.id;
});

ipcMain.handle("tabs:close", (_event, id) => {
  closeTab(id);
});

ipcMain.handle("tabs:activate", (_event, id) => {
  setActiveTab(id);
});

ipcMain.handle("nav:back", () => {
  const tab = tabs.get(activeTabId);
  if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack();
});

ipcMain.handle("nav:forward", () => {
  const tab = tabs.get(activeTabId);
  if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward();
});

ipcMain.handle("nav:reload", () => {
  const tab = tabs.get(activeTabId);
  tab?.view.webContents.reload();
});

ipcMain.handle("nav:stop", () => {
  const tab = tabs.get(activeTabId);
  tab?.view.webContents.stop();
});

ipcMain.handle("nav:go", (_event, url) => {
  const tab = tabs.get(activeTabId);
  if (!tab) return;
  if (isHistoryUrl(url)) {
    loadHistoryPage(tab);
    return;
  }
  try {
    tab.view.webContents.loadURL(url);
  } catch (error) {
    // ignore invalid urls
  }
});

ipcMain.handle("history:list", () => getHistorySorted());
ipcMain.handle("history:clear", () => {
  history = [];
  saveJson(historyFile, history);
  sendHistory();
});

ipcMain.handle("bookmarks:list", () => bookmarks);
ipcMain.handle("bookmarks:add", (_event, payload) => {
  if (isAnonymous || !payload?.url) return;
  const exists = bookmarks.some((item) => item.url === payload.url);
  if (exists) return;
  const entry = {
    id: nextBookmarkId++,
    url: payload.url,
    title: payload.title || payload.url,
    createdAt: Date.now(),
  };
  bookmarks.unshift(entry);
  saveJson(bookmarksFile, bookmarks);
  sendBookmarks();
});
ipcMain.handle("bookmarks:remove", (_event, id) => {
  bookmarks = bookmarks.filter((item) => item.id !== id);
  saveJson(bookmarksFile, bookmarks);
  sendBookmarks();
});
ipcMain.handle("bookmarks:clear", () => {
  bookmarks = [];
  saveJson(bookmarksFile, bookmarks);
  sendBookmarks();
});

ipcMain.handle("downloads:list", () => downloads);

ipcMain.handle("privacy:set", async (_event, value) => {
  await setAnonymous(Boolean(value));
  return isAnonymous;
});

ipcMain.on("ui:height", (_event, height) => {
  if (Number.isFinite(height)) {
    chromeHeight = height;
    updateViewBounds();
  }
});

ipcMain.on("ui:panel", (_event, width) => {
  if (Number.isFinite(width)) {
    panelWidth = Math.max(0, Math.round(width));
    updateViewBounds();
  }
});

app.whenReady().then(() => {
  initStorage();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
