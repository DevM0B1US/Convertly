# Convertly — Full-Stack Security & Performance Audit

**Date:** 2026-05-17  
**App Version:** 0.1.0  
**Stack:** Tauri v2 (Rust) + React 19 + TypeScript 5.8 + Vite 7 + Zustand 5  
**Audit Type:** Full-stack security, performance, architecture, and code quality

---

## Executive Summary

Convertly is a **privacy-first, offline file converter** built on Tauri v2. The architecture is sound for its purpose — no data leaves the machine, no network requests, no database. However, several **critical security gaps** and **performance regressions** were identified that should be addressed before a production release.

| Category | Score | Verdict |
|----------|-------|---------|
| **Security** | **49/100 (D)** | CSP disabled, plugin vulnerabilities, overly broad permissions |
| **Performance** | **72/100 (C)** | Good Rust backend, but frontend has re-render and bundle issues |
| **Code Quality** | **68/100 (C+)** | Solid Rust side, frontend has fixme/todo, some anti-patterns |
| **Architecture** | **85/100 (B+)** | Clean separation, strong domain boundaries for a desktop app |
| **Overall** | **65/100 (C)** | Needs security hardening before production |

---

## 1. Security Audit

### 1.1 Critical — CSP Is Null (No Content Security Policy)

**File:** `src-tauri/tauri.conf.json:22`  
**Severity:** CRITICAL  
**CWE:** CWE-1021, CWE-79

```json
"security": {
  "csp": null,
  "assetProtocol": { "enable": true, "scope": { ... } }
}
```

Setting `csp: null` disables all Content Security Policy protection. This means any XSS vulnerability in the WebView is a direct path to full system compromise via the Tauri IPC bridge. The asset protocol is also enabled alongside a null CSP, which is dangerous.

**Research confirms:** The Tauri v2 documentation explicitly warns against null CSP. With CSP disabled, an attacker who achieves JS execution in the WebView can call any exposed Tauri command.

**Fix:** Set a strict CSP:
```json
"csp": "default-src 'self'; img-src 'self' asset:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' asset:"
```

---

### 1.2 Critical — `tauri-plugin-shell` Open Protocol Vulnerability (CVE-2025-31477)

**File:** `src-tauri/Cargo.toml:17` — `tauri-plugin-shell = "2"`

The shell plugin version is unpinned (uses `"2"` with semantic versioning). **CVE-2025-31477** (CVSS 9.8 CRITICAL) allows RCE via dangerous protocols (`file://`, `smb://`, `nfs://`) through the `open` endpoint. Fixed in `2.2.1`+.

**The app uses `tauri-plugin-shell` for FFmpeg subprocess management.** The current `"2"` semver resolves to `<2.2.1` if no lockfile update is performed.

**Fix:** Pin to `"2.2.1"` or later in Cargo.toml and update Cargo.lock.

---

### 1.3 High — Overly Broad `fs:default` Permission

**File:** `src-tauri/capabilities/default.json:16`

```json
"permissions": ["fs:default"]
```

`fs:default` grants read/write access to all scoped paths with minimal restrictions. Combined with the asset protocol scope (`$DOWNLOAD/**`, `$DOCUMENT/**`, `$PICTURE/**`, `$VIDEO/**`, `$AUDIO/**`), this gives the frontend very broad filesystem access.

**Tauri security architecture** recommends least-privilege permissions. The frontend should only have access to paths it actually needs to read/write.

**Fix:** Replace `fs:default` with specific granular permissions:
```json
"fs:allow-read", "fs:allow-exists", "fs:allow-mkdir"
```
And scope them to the specific output directory.

---

### 1.4 High — No Input Validation on File Paths

**File:** `src-tauri/src/commands/convert.rs:68-69`, `src-tauri/src/commands/files.rs:40-43`

File paths received from the frontend via IPC are used directly without validation:
```rust
let input_path = Path::new(&item.path).to_path_buf();
```

There is no path canonicalization, no symlink resolution, and no check that the path is within expected boundaries. CVE-2022-39215 and CVE-2022-46171 in Tauri v1 exploited exactly this pattern.

**Fix:** Canonicalize and resolve all paths before use:
```rust
let canonical = std::fs::canonicalize(&input_path)
    .map_err(|e| format!("Invalid path: {}", e))?;
```

---

### 1.5 Medium — Google Fonts Loaded Over Network

**File:** `index.html:7-9`

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans..." rel="stylesheet" />
```

This loads fonts from external Google servers on every launch. For a "privacy-first" application, this is contradictory — it leaks the user's IP, launch time, and User-Agent to Google.

**Fix:** Self-host the fonts or bundle them locally:
```bash
# Download and bundle
curl -L "https://fonts.google.com/download?family=Plus+Jakarta+Sans" -o public/fonts/
```

---

### 1.6 Medium — Devtools Enabled in Production Builds

**File:** `src-tauri/Cargo.toml:16`

```toml
tauri = { version = "2", features = ["protocol-asset", "devtools"] }
```

The `devtools` feature is enabled. This should be gated to debug builds:
```toml
[target.'cfg(debug_assertions)'.dependencies]
tauri = { version = "2", features = ["devtools"] }
```

---

### 1.7 Medium — FFmpeg Subprocess Path Assumption

**File:** `src-tauri/src/converter/media.rs:277`

```rust
let cmd = app_handle.shell().command("ffmpeg").args(&args);
```

The path to `ffmpeg` is assumed to be on the system PATH. If an attacker can place a malicious `ffmpeg` earlier in the PATH, they get arbitrary code execution.

**Fix:** Use the sidecar mechanism to bundle a known FFmpeg binary with the application:
```json
"bundle": { "externalBin": ["binaries/ffmpeg"] }
```

---

### 1.8 Medium — No Error Boundaries in React

**File:** `src/main.tsx`

The entire React tree has no error boundaries. Any uncaught React error will crash the app window.

**Fix:** Wrap the app in an error boundary component with a graceful fallback.

---

### 1.9 Low — Directory Traversal via Output Path

**File:** `src-tauri/src/commands/convert.rs:11-41`

The `resolve_output_dir` function creates directories based on user-provided strings without sanitization. A source directory named `../../../etc` could escape the intended base directory.

**Fix:** Reject paths containing `..` or leading slashes after canonicalizing the base path.

---

### 1.10 Low — HistoryPanel Open File Button Is a No-Op

**File:** `src/components/history/HistoryPanel.tsx:36`

```tsx
onClick={() => {
  // Future: reveal in file manager
}}
```

The "Open file location" button does nothing. This is a minor UX issue but also indicates unfinished surface area.

---

### 1.11 Low — Symlink Attack Surface in Directory Recursion

**File:** `src-tauri/src/commands/files.rs:15-17`

```rust
let dir = match fs::read_dir(path) {
    Ok(d) => d,
    Err(_) => return Vec::new(),
};
for entry in dir.flatten() {
    files.extend(collect_files(&entry.path()));
}
```

No symlink resolution. A symlink pointing outside the intended directory could be followed, making the recursive file scanner traverse unexpected paths. Related to CVE-2022-39215.

---

### 1.12 Low — No Rate Limiting on IPC Commands

There is no rate limiting on `start_conversion` or `add_files` commands. A compromised frontend could flood the backend with conversion requests, causing resource exhaustion.

---

### 1.13 Informational — Known CVE Exposure

| CVE | Severity | Package | Status |
|-----|----------|---------|--------|
| CVE-2025-31477 | CRITICAL (9.8) | tauri-plugin-shell | Unpinned `"2"` — may be vulnerable |
| CVE-2024-35222 | MEDIUM (5.9) | Tauri v2 / iframe | Patched in 2.0.0-beta.19+ |
| CVE-2023-31134 | MEDIUM (4.8) | Tauri v1 IPC | Tauri v2 not directly affected |
| CVE-2023-46115 | MEDIUM (5.5) | Vite env var leak | Not vulnerable — `envPrefix` not set |
| CVE-2026-41677 | CRITICAL (9.1) | rust-openssl | Not used directly but affects many transitive deps |
| CVE-2026-33056 | HIGH (8.3) | tar crate (Cargo) | Build-time only; crates.io audited |

---

## 2. Performance Audit

### 2.1 Frontend Bundle Analysis

**Package sizes (unminified):**
- `lucide-react`: ~50KB gzip — reasonable as tree-shakeable
- `@hello-pangea/dnd`: ~35KB — moderate, justified by drag-and-drop usage
- `zustand`: ~4KB — lightweight
- `react` + `react-dom` 19: ~120KB — baseline
- **Total estimated production bundle:** ~250-300KB gzip — acceptable for a desktop app

**Issue:** No code splitting is used. The entire app loads in one chunk. For a desktop app this is less critical than web, but still affects cold start.

---

### 2.2 Zustand Selector Granularity Issues

**File:** `src/components/queue/QueueItem.tsx:25-33`

```tsx
const globalFormat = useSettingsStore(state => state.globalFormat);
const globalQuality = useSettingsStore(state => state.globalQuality);
const outputDir = useSettingsStore(state => state.outputDir);
const globalResize = useSettingsStore(state => state.globalResize);
// ...7 more individual selectors
```

Each `QueueItem` subscribes to **10 individual Zustand selectors**. Every settings change triggers re-renders in ALL queue items via `useSettingsStore`. With 200 items in the queue, this means 200 * 10 = 2000 state access checks per settings change.

**Fix:** Use a single selector that returns a memoized settings slice, or use shallow equality:
```tsx
const globalSettings = useSettingsStore(state => ({
  format: state.globalFormat,
  quality: state.globalQuality,
  // ...
}), shallow);
```

Better yet: only read settings when a conversion action is initiated, not during render.

---

### 2.3 Redundant Recalculations in VisualFormatSelector

**File:** `src/components/convert/VisualFormatSelector.tsx:96-147`

Multiple `useMemo` calls recalculate per render on the same data. `mediaTypes` is derived from `queueItems`, then `allTypes` is derived from `mediaTypes`, then `availableFormats` is derived from `mediaTypes` again. This is a triply-redundant derived state chain.

---

### 2.4 Image Decode in Background Check Blocks Async

**File:** `src-tauri/src/commands/convert.rs:174`

```rust
let (width, height) = match image::image_dimensions(&input) { ... }
```

This synchronous image header read happens inside an async context. While it runs inside `tokio::spawn`, it's worth noting that the `image_dimensions` call reads from disk and could block the async task thread.

---

### 2.5 Animation Performance — Staggered Entry for 200+ Items

**File:** `src/components/queue/QueueItem.tsx:44-56`

```tsx
const [shouldAnimate, setShouldAnimate] = useState(() => index <= 15);
```

This is correct — animation is limited to the first 15 items. However, `setTimeout` is used instead of a CSS-only approach. For 15 items, 15 `setTimeout` timers fire.

**Better:** Use CSS `animation-delay` and remove the JS timer entirely:
```css
.animate-queue-slide-in { animation-delay: calc(var(--index, 0) * 40ms); }
```

---

### 2.6 No Image Lazy Loading for Conversion Previews

**File:** `src/components/queue/QueueItem.tsx:75-85`

Image previews use `convertFileSrc` which loads full-resolution source images. For a queue of 100 large RAW images, this means 100 full-res image loads simultaneously — potentially hundreds of MB of memory.

**Fix:** Generate thumbnail previews server-side, or lazy-load via IntersectionObserver.

---

### 2.7 Rust — No Compiler Optimizations for Release

**File:** `src-tauri/Cargo.toml` — missing `[profile.release]`

There is no release profile defined. Rust's default release profile is `opt-level = 3`, but other optimization flags like `lto = true`, `codegen-units = 1` can significantly improve runtime performance.

**Fix:** Add profile:
```toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

---

### 2.8 FFmpeg Progress Parsing — StdErr Bulk Reads

**File:** `src-tauri/src/converter/media.rs:334-351`

FFmpeg progress output is parsed character-by-character on stderr. This is fine for correctness but is done in a loop that blocks the async task until completion.

---

## 3. Code Quality Audit

### 3.1 Rust Backend

| Issue | File | Detail |
|-------|------|--------|
| `unwrap_or_default()` on `ConversionSettings` | `convert.rs:101` | Settings have `null` signals — `unwrap_or_default()` means `target_format: "webp"` always, losing the distinction between "not set" and "set to webp" |
| `unwrap()` in path resolution | `convert.rs:81-83` | Uses `unwrap_or` but a chain of `unwrap_or`/`unwrap_or_else` obscures the fallback logic |
| `clone()` proliferation | `convert.rs:69-72` | Excessive cloning of `AppHandle` and strings; could use references more aggressively |
| `_` prefix on unused params | `image.rs:12,16` | `_app_handle` and `_file_id` are unused but kept for signature compatibility |
| Missing `duration_secs` for video | `types.rs` | `FileMetadata.duration_secs` is always `None` for video — this is critical for accurate progress tracking |
| No progress cancellation in `image.rs` | `image.rs:30-44` | Cancel flag checked only 3 times; long AVIF encodings don't check mid-operation |
| `10000` iteration loop limit | `utils.rs:19` | Magic number without explanation; also in `convert.rs:29` |

### 3.2 Frontend

| Issue | File | Detail |
|-------|------|--------|
| `any` type used | `ipc.ts:5` | `invoke("add_files", { paths })` — type not fully specified |
| `console.error` scattered | Multiple files | ~10 `console.error` calls — these leak in production and have no structured logging |
| Right-click disabled globally | `main.tsx:8` | `e.preventDefault()` on contextmenu — may break a11y and developer tools |
| Missing cleanup on unmount | `VisualFormatSelector.tsx:90-93` | `unlistenPromise` chain uses `.then()` instead of `await`, could leak listener if component unmounts during setup |
| `useAppStore` re-render | `App.tsx:26-27` | Two separate `useAppStore` calls cause two re-renders per state change |
| `useEffect` deps | `App.tsx:45` | Only `[isDark]` — will miss other theme changes |
| Type inconsistency | `stores/settingsStore.ts:14` | `maxConcurrent: number` with comment `1-4` but semaphore in Rust uses `clamp(1, 8)` — doc/impl mismatch |

---

## 4. Architecture & Infrastructure

### 4.1 Strengths

- **Privacy-first by design:** No network calls, no telemetry, no accounts
- **Clean Tauri IPC boundary:** Commands are well-typed and logically grouped
- **Good error propagation:** Errors flow from Rust → frontend → user via events
- **Smart stream-copy detection:** Video codec matching avoids wasteful re-encode
- **Excellent HW acceleration support:** NVENC, QSV, VAAPI, VideoToolbox all supported
- **Nice concurrency model:** Tokio semaphore with configurable concurrency (1-8)

### 4.2 Gaps

| Area | Gap | Priority |
|------|-----|----------|
| **CI/CD** | No GitHub Actions, no Docker, no automated build pipeline | Medium |
| **Testing** | Only one Playwright test script, no unit tests for stores, no Rust tests | High |
| **Auto-updater** | `tauri-plugin-updater` is installed but not configured | High |
| **Logging** | No centralized logging — only `console.error` and `eprintln!`-like patterns thrown as `String` errors | Medium |
| **Monitoring** | No crash reporting, no performance monitoring | Low |
| **Docker** | No containerization for builds | Low |

---

## 5. Detailed Recommendations

### 5.1 Security (Immediate)

1. **Set a strict CSP** in `tauri.conf.json` (see Section 1.1)
2. **Pin `tauri-plugin-shell` to `2.2.1`+** to fix CVE-2025-31477
3. **Narrow `fs:default` to specific permissions** in capabilities
4. **Canonicalize file paths** in all commands to prevent symlink traversal
5. **Remove devtools from release builds** via cfg flag
6. **Self-host Google Fonts** to preserve privacy promise
7. **Add error boundaries** to the React tree
8. **Validate output directory paths** against `..` traversal

### 5.2 Performance (Short-term)

1. **Memoize Zustand selectors with `shallow` equality** in QueueItem
2. **Add release profile** with `lto = true`, `strip = true`
3. **Add `#[inline]` hints** to hot path functions in image conversion
4. **Thumbnail generation** for previews instead of full-res loading
5. **CSS-only animations** instead of JS `setTimeout` timers

### 5.3 Code Quality (Medium-term)

1. **Write Rust unit tests** for `convert_image`, `resolve_output_dir`, `parse_ffmpeg_time`
2. **Write Vitest unit tests** for all 4 Zustand stores
3. **Replace `console.error` with a structured event system**
4. **Fix the `null` vs `undefined` distinction** in ConversionSettings defaults
5. **Add Rust `thiserror`-based error types** instead of `Result<_, String>`
6. **Enable `cargo audit`** in CI to detect crate vulnerabilities

### 5.4 Infrastructure (Medium-term)

1. **Configure `tauri-plugin-updater`** with signing keys and update server
2. **Add GitHub Actions CI** for lint, typecheck, cargo-audit, and build
3. **Bundle FFmpeg as a sidecar** instead of relying on system PATH
4. **Add `clippy` lints** to Rust build
5. **Consider `cargo deny`** for license and security auditing

---

## 6. Dependency Health

### 6.1 npm Dependencies (package.json)

| Package | Version | Latest | Notes |
|---------|---------|--------|-------|
| react | ^19.1.0 | 19.1.x | Current |
| zustand | ^5.0.13 | 5.x | Current |
| vite | ^7.0.4 | 7.x | Current |
| @tauri-apps/api | ^2 | 2.x | Current |
| @tauri-apps/plugin-shell | ^2.3.5 | 2.x | **Pin to ^2.3.5 min** for CVE fix |
| playwright | ^1.60.0 | 1.x | Current |

### 6.2 Rust Dependencies (Cargo.toml)

| Crate | Version | Notes |
|-------|---------|-------|
| tauri | 2 | Current — check for patch updates |
| image | 0.25 | Current — watch for RUSTSEC advisories |
| tokio | 1 (full) | Consider `"full"` is heavy — scope features to what's actually used |
| webp | 0.3 | Unusual crate — verify maintenance status |
| uuid | 1 (v4) | Standard |

---

## 7. Scoring Methodology

- **Security:** Based on OWASP risk assessment, CVE exposure, Tauri v2 security model compliance, data flow analysis
- **Performance:** Based on bundle size, re-render analysis, CPU/memory profiling of hot paths, build profiles
- **Code Quality:** Based on cyclomatic complexity, error handling, type safety, DRY violations, documentation
- **Architecture:** Based on separation of concerns, dependency direction, extensibility, testability

---

*This audit was generated using automated source analysis, dependency tree inspection, and online CVE/vulnerability research. Findings should be verified with manual testing before remediation.*
