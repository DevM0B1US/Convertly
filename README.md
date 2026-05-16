# Convertly

> High-performance, privacy-first file converter for images, video, and audio — built with Tauri v2 + React + Rust.

Convertly is a native desktop app that converts media files entirely on your machine. No uploads, no servers, no data leaving your computer.

## Features

- **Multi-format conversion** — Images (WebP, AVIF, PNG, JPEG, GIF, BMP, TIFF), Video (MP4, WebM, AVI, MKV, MOV), Audio (MP3, FLAC, WAV, AAC, OGG, M4A, WMA)
- **Privacy-first** — All processing is local. Nothing is sent to the cloud.
- **Concurrent processing** — Converts up to 2 files simultaneously (configurable)
- **Drag-and-drop queue** — Add, reorder, and manage files in the conversion queue
- **Per-file settings** — Override output format and quality per file, or set global defaults
- **Quality control** — Adjust quality (1–100) for all formats
- **Resize presets** — Scale output to 1080p, 720p, 500p, 420p, or 260p
- **Metadata stripping** — Optionally strip EXIF and other metadata
- **Real-time progress** — Track conversion progress via live status updates
- **Dark/Light theme** — Auto-detects system preference, toggleable at any time
- **Custom title bar** — Native-feeling window controls without OS chrome

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | [Tauri v2](https://v2.tauri.app/) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| State | Zustand |
| Backend | Rust (Tokio async) |
| Image conversion | [`image`](https://crates.io/crates/image) crate |
| Video/Audio conversion | FFmpeg (sidecar subprocess) |

## Prerequisites

- **Node.js** 18+
- **Rust** stable toolchain
- **FFmpeg** installed and available in your PATH (required for video/audio conversion)
- **Tauri system dependencies** — On Linux:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev
  ```

## Getting Started

```bash
# Clone the repo
git clone https://github.com/DevM0B1US/Convertly.git
cd Convertly

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

This starts the Vite dev server on `localhost:1420` and opens the Tauri desktop window.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server only |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview production build |
| `npm run tauri dev` | Run desktop app in development |
| `npm run tauri build` | Build production binaries + installers |

## Project Structure

```
src/                          # Frontend (React + TypeScript)
├── components/
│   ├── layout/               # TitleBar, Sidebar, StatusBar, SplitPane
│   ├── queue/                # QueueItem
│   └── settings/             # SettingsPanel, FormatSelect, QualitySlider
├── hooks/                    # useFileDrop, useConversion
├── stores/                   # Zustand stores (app, queue, settings)
├── lib/                      # Tauri IPC wrappers
└── types/                    # TypeScript type definitions

src-tauri/                    # Backend (Rust)
├── src/
│   ├── commands/             # Tauri command handlers (files, convert)
│   ├── converter/            # image.rs, media.rs (FFmpeg wrapper)
│   └── metadata/             # Image metadata extraction
├── tauri.conf.json           # Tauri configuration
└── Cargo.toml                # Rust dependencies
```

## Default Settings

| Setting | Default |
|---|---|
| Output format | WebP |
| Quality | 85 |
| Resize | None (original) |
| Strip metadata | Off |
| Output directory | `~/Downloads/Convertly` |
| Max concurrent conversions | 2 |

## Architecture

Convertly uses Tauri's IPC bridge to communicate between the React frontend and Rust backend:

1. **Frontend** manages the UI, conversion queue (Zustand), and user settings
2. **Backend commands** handle file validation, metadata extraction, and conversion execution
3. **Image conversion** uses the `image` crate (pure Rust, fast, supports many formats with Lanczos3 resizing)
4. **Video/Audio conversion** spawns FFmpeg as a subprocess with controlled arguments
5. **Progress** flows back via Tauri events (`conversion:progress`, `conversion:complete`, `conversion:error`)
6. **Concurrency** is managed by a Tokio semaphore (max 2 concurrent tasks)

## Status

Convertly is in early development (v0.1.0). Features like cancel/pause conversion, history view, and queue reordering are partially or fully implemented. Expect changes.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

This project is currently not licensed. All rights reserved.
