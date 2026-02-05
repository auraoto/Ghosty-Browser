# Ghosty

Ghosty is a minimalist black & white browser built with Electron. DuckDuckGo is the default search engine, but you can switch it in Settings.

## Features

- Tabs (with per-tab loading indicator)
- Address bar: type URLs or search queries
- Search engine switching (DuckDuckGo/Brave/Bing/Google)
- Resizable right sidebar Settings panel
- Glass/blur mode (optional)
- `about:history` built-in page (click an entry to open the saved URL)
- Bookmarks
- Downloads list
- Anonymous mode (DuckDuckGo-style): clears local data and stops saving history/bookmarks/cache
- UI language switch: Russian / English

## Shortcuts

- `Ctrl/Cmd + L` focus address bar
- `Ctrl/Cmd + T` new tab
- `Ctrl/Cmd + W` close tab
- `Ctrl/Cmd + Tab` next tab

## Getting Started

### Install dependencies

Option A (recommended): use the runner

```sh
python3 runner.py
```

Option B: manual

```sh
npm install
```

### Run

```sh
npm run start
```

### Build (Linux AppImage)

```sh
npm run dist
```

## Notes

- The Settings panel can be pinned via the **Sidebar** toggle, and resized by dragging its left edge.
- `about:history` is a built-in page rendered by Ghosty itself.

## License

MIT
