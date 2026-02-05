const api = window.ghosty || null;

const engines = {
  duckduckgo: {
    label: "DuckDuckGo",
    search: "https://duckduckgo.com/?q=",
    home: "https://duckduckgo.com/",
  },
  brave: {
    label: "Brave",
    search: "https://search.brave.com/search?q=",
    home: "https://search.brave.com/",
  },
  bing: {
    label: "Bing",
    search: "https://www.bing.com/search?q=",
    home: "https://www.bing.com/",
  },
  google: {
    label: "Google",
    search: "https://www.google.com/search?q=",
    home: "https://www.google.com/",
  },
};

const defaultSettings = {
  theme: "dark",
  engine: "duckduckgo",
  newTabMode: "engine",
  blur: false,
  anonymous: false,
  panelWidth: 360,
  panelPinned: false,
};

const storageKey = "ghosty_settings";

const chrome = document.querySelector("#chrome");
const tabsEl = document.querySelector("#tabs");
const address = document.querySelector("#address");
const hint = document.querySelector("#omnibox-hint");
const status = document.querySelector("#status");

const backBtn = document.querySelector("#back");
const forwardBtn = document.querySelector("#forward");
const reloadBtn = document.querySelector("#reload");
const homeBtn = document.querySelector("#home");
const bookmarkBtn = document.querySelector("#bookmark");
const newTabBtn = document.querySelector("#new-tab");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsPanel = document.querySelector("#settings-panel");
const settingsClose = document.querySelector("#settings-close");
const panelResizer = document.querySelector("#panel-resizer");

const themeButtons = Array.from(document.querySelectorAll(".segment"));
const engineSelect = document.querySelector("#engine");
const newTabSelect = document.querySelector("#newtab-mode");
const blurToggle = document.querySelector("#blur-toggle");
const panelPinToggle = document.querySelector("#panel-pin-toggle");
const anonToggle = document.querySelector("#anon-toggle");
const anonHint = document.querySelector("#anon-hint");
const historyList = document.querySelector("#history-list");
const bookmarksList = document.querySelector("#bookmarks-list");
const downloadsList = document.querySelector("#downloads-list");
const historyClear = document.querySelector("#history-clear");
const historyOpen = document.querySelector("#history-open");
const bookmarksClear = document.querySelector("#bookmarks-clear");

let state = {
  tabs: [],
  activeTabId: null,
  active: null,
  isEditing: false,
  isResizing: false,
  panelOpen: document.body.getAttribute("data-panel") === "open",
  settings: { ...defaultSettings },
  history: [],
  bookmarks: [],
  downloads: [],
};

function loadSettings() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { ...defaultSettings };
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch (error) {
    return { ...defaultSettings };
  }
}

function saveSettings(next) {
  const nextSettings = { ...state.settings, ...next };
  const becameAnonymous = !state.settings.anonymous && nextSettings.anonymous;
  state.settings = nextSettings;

  if (becameAnonymous) {
    localStorage.removeItem(storageKey);
  } else if (!state.settings.anonymous) {
    localStorage.setItem(storageKey, JSON.stringify(state.settings));
  }

  applySettings();
}

function applySettings() {
  const { theme, engine, newTabMode, blur, anonymous, panelWidth, panelPinned } =
    state.settings;
  document.body.setAttribute("data-theme", theme);
  document.body.setAttribute("data-blur", blur ? "on" : "off");
  hint.textContent = engines[engine]?.label || engines.duckduckgo.label;
  themeButtons.forEach((btn) => {
    const isActive = btn.dataset.theme === theme;
    btn.classList.toggle("active", isActive);
  });
  engineSelect.value = engine;
  newTabSelect.value = newTabMode;
  blurToggle.checked = blur;
  panelPinToggle.checked = panelPinned;
  anonToggle.checked = anonymous;
  anonHint.textContent = anonymous
    ? "Анонимный режим активен: история, закладки и кеш отключены."
    : "В анонимном режиме история, закладки и кеш не сохраняются.";
  const clampedWidth = setPanelWidth(panelWidth, false);
  if (clampedWidth !== panelWidth) {
    state.settings.panelWidth = clampedWidth;
  }
  if (panelPinned) {
    setPanelOpen(true);
  }
}

function buildEngineOptions() {
  engineSelect.innerHTML = "";
  Object.entries(engines).forEach(([key, engine]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = engine.label;
    engineSelect.appendChild(option);
  });
}

const PANEL_MIN = 280;
const PANEL_MAX = 520;

function setPanelWidth(width, notify = true) {
  const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(width)));
  document.documentElement.style.setProperty("--panel-width", `${next}px`);
  if (notify && api) api.ui.setPanelWidth(next);
  return next;
}

function setPanelOpen(open) {
  state.panelOpen = open;
  document.body.setAttribute("data-panel", open ? "open" : "closed");
  settingsPanel.setAttribute("aria-hidden", String(!open));
  const panelWidth = open ? state.settings.panelWidth : 0;
  if (api) api.ui.setPanelWidth(panelWidth);
  updateChromeHeight();
}

function setStatus(text) {
  status.textContent = text;
}

function renderTabs(tabs) {
  tabsEl.innerHTML = "";
  tabs.forEach((tab) => {
    const tabEl = document.createElement("button");
    tabEl.className = "tab";
    tabEl.type = "button";
    tabEl.dataset.tabId = String(tab.id);
    tabEl.classList.toggle("active", tab.isActive);
    tabEl.classList.toggle("loading", tab.isLoading);

    const statusDot = document.createElement("span");
    statusDot.className = "tab-status";

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "Новая вкладка";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Закрыть";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      api?.tabs.close(tab.id);
    });

    tabEl.appendChild(statusDot);
    tabEl.appendChild(title);
    tabEl.appendChild(close);

    tabEl.addEventListener("click", () => {
      api?.tabs.activate(tab.id);
    });

    tabsEl.appendChild(tabEl);
  });
}

function formatTimestamp(ts) {
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

function setListEmpty(listEl, message) {
  listEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  listEl.appendChild(empty);
}

function renderHistory(items) {
  if (state.settings.anonymous) {
    setListEmpty(historyList, "История отключена в анонимном режиме.");
    return;
  }
  if (!items.length) {
    setListEmpty(historyList, "История пока пуста.");
    return;
  }
  const sorted = [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  historyList.innerHTML = "";
  sorted.slice(0, 50).forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "list-item";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = item.title || "Без названия";

    const meta = document.createElement("div");
    meta.className = "list-meta";
    meta.textContent = `${formatTimestamp(item.timestamp)} · ${item.url}`;

    const actions = document.createElement("div");
    actions.className = "list-actions";

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Открыть";
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      api?.nav.go(item.url);
    });

    const openTab = document.createElement("button");
    openTab.type = "button";
    openTab.textContent = "Вкладка";
    openTab.addEventListener("click", (event) => {
      event.stopPropagation();
      api?.tabs.create(item.url);
    });

    actions.appendChild(open);
    actions.appendChild(openTab);

    entry.appendChild(title);
    entry.appendChild(meta);
    entry.appendChild(actions);
    entry.addEventListener("click", () => api?.nav.go(item.url));

    historyList.appendChild(entry);
  });
}

function renderBookmarks(items) {
  if (state.settings.anonymous) {
    setListEmpty(bookmarksList, "Закладки отключены в анонимном режиме.");
    return;
  }
  if (!items.length) {
    setListEmpty(bookmarksList, "Закладок нет.");
    return;
  }
  bookmarksList.innerHTML = "";
  items.forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "list-item";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = item.title || "Без названия";

    const meta = document.createElement("div");
    meta.className = "list-meta";
    meta.textContent = item.url;

    const actions = document.createElement("div");
    actions.className = "list-actions";

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Открыть";
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      api?.nav.go(item.url);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Убрать";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      api?.bookmarks.remove(item.id);
    });

    actions.appendChild(open);
    actions.appendChild(remove);

    entry.appendChild(title);
    entry.appendChild(meta);
    entry.appendChild(actions);
    entry.addEventListener("click", () => api?.nav.go(item.url));

    bookmarksList.appendChild(entry);
  });
}

function renderDownloads(items) {
  if (state.settings.anonymous) {
    setListEmpty(downloadsList, "Загрузки не сохраняются в анонимном режиме.");
    return;
  }
  if (!items.length) {
    setListEmpty(downloadsList, "Загрузок пока нет.");
    return;
  }
  downloadsList.innerHTML = "";
  items.slice(0, 30).forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "list-item";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = item.filename || "Файл";

    const meta = document.createElement("div");
    meta.className = "list-meta";
    meta.textContent = `${item.status || "в процессе"} · ${item.url || ""}`;

    entry.appendChild(title);
    entry.appendChild(meta);
    downloadsList.appendChild(entry);
  });
}

function updateBookmarkButton() {
  const url = state.active?.url;
  const isSpecial = !url || url.startsWith("about:") || url.startsWith("data:");
  const isBookmarked = url && state.bookmarks.some((bm) => bm.url === url);
  bookmarkBtn.classList.toggle("bookmark-active", Boolean(isBookmarked));
  bookmarkBtn.querySelector("span").textContent = isBookmarked ? "★" : "☆";
  bookmarkBtn.disabled = state.settings.anonymous || isSpecial;
}

function updateActiveState(active) {
  state.active = active;
  if (!state.isEditing) {
    address.value = active?.url || "";
  }
  backBtn.disabled = !active?.canGoBack;
  forwardBtn.disabled = !active?.canGoForward;
  reloadBtn.textContent = active?.isLoading ? "✕" : "⟳";
  setStatus(active?.isLoading ? "Загрузка" : "Готово");
  updateBookmarkButton();
}

function looksLikeUrl(value) {
  if (!value) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) return true;
  if (value.includes(" ")) return false;
  if (value.includes(".")) return true;
  return /^localhost(\:\d+)?/.test(value);
}

function toUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (looksLikeUrl(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch (error) {
      return `https://${trimmed}`;
    }
  }

  const engine = engines[state.settings.engine] || engines.duckduckgo;
  return `${engine.search}${encodeURIComponent(trimmed)}`;
}

function getHomeUrl() {
  const engine = engines[state.settings.engine] || engines.duckduckgo;
  return engine.home;
}

function getNewTabUrl() {
  return state.settings.newTabMode === "blank" ? "about:blank" : getHomeUrl();
}

function openSettings(open) {
  const shouldOpen = open ?? !state.panelOpen;
  if (state.settings.panelPinned && !shouldOpen) return;
  setPanelOpen(shouldOpen);
}

function submitAddress() {
  const url = toUrl(address.value);
  if (!url) return;
  api?.nav.go(url);
}

function selectNextTab(direction) {
  if (!state.tabs.length) return;
  const currentIndex = state.tabs.findIndex((tab) => tab.isActive);
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (currentIndex + delta + state.tabs.length) % state.tabs.length;
  const nextTab = state.tabs[nextIndex];
  if (nextTab) api?.tabs.activate(nextTab.id);
}

function updateChromeHeight() {
  if (!api) return;
  const height = Math.round(chrome.getBoundingClientRect().height);
  api.ui.setChromeHeight(height);
  const isOpen = document.body.getAttribute("data-panel") === "open";
  api.ui.setPanelWidth(isOpen ? state.settings.panelWidth : 0);
}

function handleShortcut(event) {
  const isMeta = event.metaKey || event.ctrlKey;
  if (isMeta && event.key.toLowerCase() === "l") {
    event.preventDefault();
    address.focus();
    address.select();
  }

  if (isMeta && event.key.toLowerCase() === "t") {
    event.preventDefault();
    api?.tabs.create(getNewTabUrl());
  }

  if (isMeta && event.key.toLowerCase() === "w") {
    event.preventDefault();
    if (state.activeTabId) api?.tabs.close(state.activeTabId);
  }

  if (isMeta && event.key === "Tab") {
    event.preventDefault();
    selectNextTab(event.shiftKey ? "prev" : "next");
  }
}

function attachListeners() {
  newTabBtn.addEventListener("click", () => api?.tabs.create(getNewTabUrl()));
  backBtn.addEventListener("click", () => api?.nav.back());
  forwardBtn.addEventListener("click", () => api?.nav.forward());
  reloadBtn.addEventListener("click", () => {
    if (state.active?.isLoading) {
      api?.nav.stop();
    } else {
      api?.nav.reload();
    }
  });
  homeBtn.addEventListener("click", () => api?.nav.go(getHomeUrl()));
  bookmarkBtn.addEventListener("click", () => {
    const url = state.active?.url;
    if (!url || url.startsWith("about:") || state.settings.anonymous) return;
    const existing = state.bookmarks.find((bm) => bm.url === url);
    if (existing) {
      api?.bookmarks.remove(existing.id);
    } else {
      api?.bookmarks.add({
        url,
        title: state.active?.title || url,
      });
    }
  });

  settingsToggle.addEventListener("click", () => {
    if (state.settings.panelPinned) {
      setPanelOpen(true);
      return;
    }
    openSettings();
  });
  settingsClose.addEventListener("click", () => {
    if (state.settings.panelPinned) {
      saveSettings({ panelPinned: false });
      setPanelOpen(false);
      return;
    }
    openSettings(false);
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => saveSettings({ theme: btn.dataset.theme }));
  });

  engineSelect.addEventListener("change", (event) =>
    saveSettings({ engine: event.target.value })
  );

  newTabSelect.addEventListener("change", (event) =>
    saveSettings({ newTabMode: event.target.value })
  );

  blurToggle.addEventListener("change", () =>
    saveSettings({ blur: blurToggle.checked })
  );

  panelPinToggle.addEventListener("change", () => {
    const pinned = panelPinToggle.checked;
    saveSettings({ panelPinned: pinned });
    if (!pinned) {
      setPanelOpen(false);
    } else {
      setPanelOpen(true);
    }
  });

  anonToggle.addEventListener("change", () => {
    const next = anonToggle.checked;
    saveSettings({ anonymous: next });
    if (next) {
      state.history = [];
      state.bookmarks = [];
      state.downloads = [];
      renderHistory([]);
      renderBookmarks([]);
      renderDownloads([]);
    } else if (api) {
      Promise.all([api.history.list(), api.bookmarks.list(), api.downloads.list()]).then(
        ([history, bookmarks, downloads]) => {
          state.history = history;
          state.bookmarks = bookmarks;
          state.downloads = downloads;
          renderHistory(history);
          renderBookmarks(bookmarks);
          renderDownloads(downloads);
          updateBookmarkButton();
        }
      );
    }
    api?.privacy.setAnonymous(next);
    updateBookmarkButton();
  });

  historyClear.addEventListener("click", () => api?.history.clear());
  historyOpen.addEventListener("click", () => api?.tabs.create("about:history"));
  bookmarksClear.addEventListener("click", () => api?.bookmarks.clear());

  address.addEventListener("focus", () => {
    state.isEditing = true;
    address.select();
  });

  address.addEventListener("blur", () => {
    state.isEditing = false;
    if (state.active?.url) address.value = state.active.url;
  });

  address.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAddress();
    }
  });

  panelResizer.addEventListener("mousedown", (event) => {
    event.preventDefault();
    state.isResizing = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.isResizing) return;
    const nextWidth = window.innerWidth - event.clientX;
    const clamped = setPanelWidth(nextWidth);
    state.settings.panelWidth = clamped;
  });

  window.addEventListener("mouseup", () => {
    if (!state.isResizing) return;
    state.isResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    saveSettings({ panelWidth: state.settings.panelWidth });
    if (document.body.getAttribute("data-panel") === "open") {
      api?.ui.setPanelWidth(state.settings.panelWidth);
    }
  });

  window.addEventListener("keydown", handleShortcut);
  window.addEventListener("resize", () => updateChromeHeight());
}

function bootstrap() {
  state.settings = loadSettings();
  buildEngineOptions();
  applySettings();
  if (!document.body.getAttribute("data-panel")) {
    document.body.setAttribute("data-panel", "closed");
  }
  if (state.settings.panelPinned) {
    setPanelOpen(true);
  }
  attachListeners();
  updateChromeHeight();

  if (!api) {
    setStatus("Откройте в приложении Ghosty");
    return;
  }

  api.onTabsUpdated((tabs) => {
    state.tabs = tabs;
    state.activeTabId = tabs.find((tab) => tab.isActive)?.id || null;
    renderTabs(tabs);
  });

  api.onActiveState((active) => {
    updateActiveState(active);
  });

  api.onHistoryUpdated((items) => {
    state.history = items;
    renderHistory(items);
  });

  api.onBookmarksUpdated((items) => {
    state.bookmarks = items;
    renderBookmarks(items);
    updateBookmarkButton();
  });

  api.onDownloadsUpdated((items) => {
    state.downloads = items;
    renderDownloads(items);
  });

  api.tabs.list().then((tabs) => {
    state.tabs = tabs;
    renderTabs(tabs);
    if (!tabs.length) {
      api.tabs.create(getNewTabUrl());
    } else {
      const active = tabs.find((tab) => tab.isActive) || tabs[0];
      if (active?.url === "about:blank") {
        api.nav.go(getNewTabUrl());
      }
    }
  });

  Promise.all([api.history.list(), api.bookmarks.list(), api.downloads.list()]).then(
    ([history, bookmarks, downloads]) => {
      state.history = history;
      state.bookmarks = bookmarks;
      state.downloads = downloads;
      renderHistory(history);
      renderBookmarks(bookmarks);
      renderDownloads(downloads);
      updateBookmarkButton();
    }
  );
}

bootstrap();
