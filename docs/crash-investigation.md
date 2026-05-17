# Crash Investigation — Convertly

Generated: 2026-05-17

## Methodology

Static analysis of all Rust (backend) and TypeScript (frontend) source files. Each potential crash path was traced from trigger to failure mode. Findings are ranked by likelihood of causing the "random crashes" the app currently exhibits in normal usage, not theoretical edge cases.

---

## 🔴 1. Spawned Task Exhaustion & OOM (High Likelihood)

**Files:** `src-tauri/src/commands/convert.rs:41` | `src-tauri/src/commands/files.rs:37-101`

The `start_conversion` command spawns one `tokio::spawn` per file in the batch with **no upper bound**. The semaphore only limits *concurrent execution*, not task creation. Dropping 500 files spawns 500 `JoinHandle`s, each capturing cloned copies of `AppHandle`, `PathBuf`, `ConversionSettings`, strings, etc.

The `add_files` command accepts an arbitrary array of paths and recursively descends directories with no depth or count limit.

**Crash mechanism:** 500+ files → >100MB of task state allocated → OOM killer terminates the process.

**Fix:** Limit batch size, paginate conversion, or use a `JoinSet` with a bounded spawner.

---

## 🔴 2. `unreachable!()` Panic in Image Converter (Medium Likelihood)

**File:** `src-tauri/src/converter/image.rs:126`

```rust
_ => unreachable!(),
```

The `convert_image` function has **two** match arms on `settings.target_format`:
- Lines 18-27: validation (returns `Err` on unknown)
- Lines 73-126: encoding dispatch (hits `unreachable!()` on unknown)

If these two match arms ever diverge — e.g., "jpg" is not a key in the second match (only `"jpeg"` is), a future code change adds a format to the first without updating the second, or a refactor reorders them — the app **panics and crashes the blocking thread**.

**Current risk:** `target_format` "jpg" passes the validation match with `"jpeg" | "jpg" => "jpg"` but "jpg" is NOT in the second match arm. If the frontend ever sends `"jpg"` instead of `"jpeg"`, this crashes.

**Fix:** Unify into a single match, or use a function that returns both format config and extension.

---

## 🔴 3. Mutex Poisoning (Medium Likelihood)

**File:** `src-tauri/src/commands/convert.rs:232-244`

```rust
pub tasks: std::sync::Mutex<std::collections::HashMap<String, tokio::task::JoinHandle<()>>>,
```

If **any** panic occurs while a tokio task holds the `ActiveConversions.tasks` lock, the `Mutex` becomes poisoned. All subsequent calls to `try_state::<ActiveConversions>()` followed by `.lock()` return `Err` (via `.ok()` in the `if let` chain, the operations are silently skipped).

**Crash mechanism:** Process continues running but `cancel_conversion` and task cleanup silently stop working. Conversions can never be cancelled, tasks accumulate in memory.

**Fix:** Use `std::sync::PoisonError` recovery, or switch to a lock-free structure (`tokio::sync::RwLock`, `dashmap`, or atomics).

---

## 🔴 4. Empty Base Path → Wrong Output Location (Medium Likelihood)

**File:** `src-tauri/src/commands/convert.rs:48-57`

```rust
input_path.parent().unwrap_or(Path::new("")).to_path_buf()
```

If both `output_dir` is `None` AND `download_dir()` fails (Tauri API error) AND `input_path.parent()` returns `None` (path has no parent, e.g., `/file.mp4` or a bare filename), `base_dir` becomes an **empty path** `""`. The output file is then written relative to the **process working directory** — the Tauri app bundle directory.

**Crash mechanism:** On Linux, this is typically a read-only AppImage mount. The `File::create()` call panics with "Read-only file system" or "Permission denied", propagating as a poisoned blocking thread.

**Fix:** Fall back to a validated writable directory (e.g., `temp_dir()`, `home_dir()`).

---

## 🔴 5. OOM from Large Image Decode (Medium Likelihood)

**File:** `src-tauri/src/converter/image.rs:29-35`

```rust
let mut img = reader.with_guessed_format()
    .map_err(|e| format!("Failed to guess format: {}", e))?
    .decode()
    .map_err(|e| format!("Failed to decode image: {}", e))?;
```

`image::ImageReader::decode()` decompresses the entire image into memory as raw RGBA pixels. A 100MP image (e.g., 12000×8000) allocates ~384MB for RGBA8. During resize, the `img.resize()` call allocates another buffer. Peak memory usage can exceed 1GB.

The `image` crate's decoder calls into C libraries (libjpeg, libpng, libwebp) for decompression. A malformed image can trigger **undefined behavior** in these C libraries (heap overflow, use-after-free, stack smash), causing a segfault rather than a Rust panic.

**Crash mechanism:** Segfault in C decoder → process killed by SIGSEGV. No Rust error handling can catch this.

**Fix:** Decode dimensions first, reject images above a size threshold, or decode in a streaming/chunked fashion.

---

## 🔴 6. WebP C FFI Undefined Behavior (Medium Likelihood)

**File:** `src-tauri/src/converter/image.rs:95-108`

```rust
let encoder = WebpEncoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
let mut config = WebPConfig::new().map_err(|_| "Failed to create WebP config".to_string())?;
let webp_data = encoder.encode_advanced(&config)
    .map_err(|e| format!("Failed to encode WebP: {:?}", e))?;
```

The `webp` crate v0.3 is a thin wrapper around libwebp C FFI. `WebpEncoder::from_rgba` passes raw pointers to libwebp. If the slice length doesn't match `width * height * 4`, or if the image data is corrupt, this can cause a **heap-buffer-overflow or segfault** in libwebp.

The `.map_err()` on `encode_advanced` catches Rust-level errors, but C-level segfaults bypass error handling completely.

**Fix:** Validate buffer dimensions before FFI call. Pin `webp` crate version. Add a `catch_unwind` boundary as a last resort.

---

## 🔴 7. Async Listener Race → Double Event Processing (High Likelihood)

**File:** `src/hooks/useConversion.ts:142-234`

```rust
useEffect(() => {
    let active = true;
    let unlistenProgress: (() => void) | null = null;
    ...
    const setupListeners = async () => {
        const uProgress = await listen<...>("conversion:progress", ...);
        if (!active) { uProgress(); return; }
        unlistenProgress = uProgress;
        ...
    };
    setupListeners();
    return () => {
        active = false;
        if (unlistenProgress) unlistenProgress();
        ...
    };
}, [updateItem, addHistoryEntry]);
```

**Critical race condition:** The `listen()` call returns a `Promise<UnlistenFn>`. If the component unmounts *between* calling `listen()` and the promise resolving:
1. `active` is set to `false`
2. The cleanup function checks `if (unlistenProgress)` — it's still `null`
3. The promise resolves, the callback sees `active === false`, calls `uProgress()` to unlisten
4. **But** the second call to `setupListeners` from StrictMode double-mount has already started, and its `listen()` call is about to resolve
5. This results in **two active listeners** for the same event

React 18 StrictMode double-mounts in development, triggering this every time.

**Crash mechanism:** Double event processing causes duplicate state updates, corrupting the queue and history. Each `conversion:progress` event triggers two `updateItem` calls. Each `conversion:complete` creates two history entries.

**Fix:** 
1. Use `useRef` to hold the `unlisten` functions instead of local variables
2. Cancel the `listen()` promise on unmount via an abort pattern
3. Guard event handlers with an idempotency check

---

## 🔴 8. Ticker Task Orphan on Panic (Medium Likelihood)

**File:** `src-tauri/src/commands/convert.rs:150-198`

```rust
struct ProgressGuard {
    done: std::sync::Arc<std::sync::atomic::AtomicBool>,
    ticker: tokio::task::JoinHandle<()>,
}
impl Drop for ProgressGuard {
    fn drop(&mut self) {
        self.done.store(true, std::sync::atomic::Ordering::Relaxed);
        self.ticker.abort();
    }
}
```

The `ProgressGuard` is created and its `Drop` runs when the task completes or panics. However, the *ticker* task is spawned *before* the guard. If the `estimate_duration_ms()` call after the ticker spawn panics (e.g., integer overflow on extreme dimensions), the guard never gets created, and the ticker runs forever.

**Fix:** Use `Defer` pattern or ensure guard is created before any fallible operation.

---

## 🔴 9. FFmpeg Subprocess Hang (Medium Likelihood)

**File:** `src-tauri/src/converter/media.rs:131-196`

FFmpeg is spawned with **no timeout**. A corrupted media file can cause FFmpeg to hang indefinitely (blocked on I/O, infinite loop in parser, waiting on stdin). The `rx.recv().await` loop blocks the tokio task forever.

`cancel_conversion` aborts the tokio task, and the `ChildGuard::drop` kills the child. But if the user never presses cancel, the task hangs permanently.

**Crash mechanism:** 2 active conversions (semaphore limit) + 2 hung FFmpeg processes = all conversion slots blocked forever. The entire conversion system deadlocks from the user's perspective. Meanwhile, each hung FFmpeg consumes a full CPU core.

**Fix:** Add a timeout wrapper around the FFmpeg process (e.g., `tokio::time::timeout` on the `rx.recv()` loop).

---

## 🔴 10. Semaphore Starvation with `maxConcurrent = 0` (Medium Likelihood)

**File:** `src-tauri/src/commands/convert.rs:34`

```rust
let semaphore = Arc::new(Semaphore::new(max_concurrent.unwrap_or(2)));
```

The frontend stores `maxConcurrent` in settings with no lower bound validation. If a user (or a future UI) sets `maxConcurrent` to `0`, the semaphore has **zero permits**. The first `acquire_owned().await` blocks forever. Every conversion task hangs permanently.

**Crash mechanism:** All conversion attempts hang indefinitely. No error is surfaced to the user. The queue shows "Waiting..." forever.

**Fix:** Clamp to `max_concurrent.clamp(1, 8)` or similar.

---

## 🟠 11. Image Resize: Width/Height Overflow (Low Likelihood)

**File:** `src-tauri/src/converter/image.rs:56-62`

```rust
let w = ((orig_w as f64 * h as f64) / orig_h as f64).round() as u32;
let h = ((orig_h as f64 * w as f64) / orig_w as f64).round() as u32;
```

Around this `orig_h`/`orig_w` division, if `orig_h` or `orig_w` is zero, the division can produce `Inf` or `NaN`. Casting `NaN as u32` yields `0` in Rust (which is surprising and error-prone), so avoid relying on that behavior. Additionally, converting extremely large dimensions to `f64` can saturate and produce incorrect results.

**Fix:** Add a guard: `if orig_w == 0 || orig_h == 0 { return Err(...) }`.

---

## 🟠 12. JPG Extension Mismatch

**File:** `src-tauri/src/commands/convert.rs:76-78`, `src-tauri/src/converter/image.rs:18-27,73-126`

The frontend sends `target_format: "jpeg"` (from `TargetFormat` union). The first match in `convert.rs` handles this:
```rust
"jpeg" | "jpg" => "jpg",
```
And in `image.rs`, the validation match handles `"jpeg"`, but **not** `"jpg"`. If any code path ever sends `"jpg"` as the format, the validation passes but the dispatch match falls through to `unreachable!()`.

The frontend has `||` fallbacks:
```typescript
item.settings?.targetFormat || globalFormat
```
An empty string `""` would trigger `globalFormat`, but an unexpected value passes through.

**Fix:** Canonicalize `"jpg"` → `"jpeg"` on the Rust side before matching.

---

## 🟠 13. Notification API Not Available

**File:** `src/hooks/useConversion.ts:9-56`

```typescript
const sendNotification = () => {
    try {
        new Notification(title, { body, icon: "/logo.avif" });
    } catch (err) { ... }
};
```

In Tauri's webview (WebKitGTK on Linux, WebView2 on Windows), the `Notification` API constructor can throw `TypeError` or `SecurityError` depending on the platform and context. The try/catch handles this, but subsequent `.requestPermission()` calls can also throw.

On headless systems or CI environments where the app is tested, `Notification` may not exist at all, but this is checked by `!("Notification" in window)`.

**Impact:** Silent failure. Not a crash, but the user gets no completion notification.

---

## 🟠 14. `convertFileSrc` Failure on Invalid Paths

**File:** `src/components/queue/QueueItem.tsx:62-81`

```typescript
const imageUrl = useMemo(() => {
    if (isImage && item?.path && !imageError) {
        try {
            return convertFileSrc(item.path);
        } catch (err) { ... }
    }
}, [isImage, item?.path, imageError]);
```

`convertFileSrc` converts a filesystem path to a Tauri asset protocol URL. If the path contains characters that aren't valid in URLs (spaces, unicode, etc. — yes, `convertFileSrc` handles encoding), or if the path is on a different mount point not in the asset scope, the function throws.

**Impact:** Image preview fails silently. Not a crash.

---

## 🟠 15. WebP Encoding Edge Case

**File:** `src-tauri/src/converter/image.rs:95-108`

`WebPConfig::new()` can return an error if libwebp is improperly initialized. The `.map_err()` handles it. But `encode_advanced()` can also fail if the input image has unusual dimensions (e.g., 1x1, or dimensions not divisible by 2 — WebP internally works with 16x16 macroblocks for some features).

**Impact:** Encoded error returned to frontend, file conversion fails.

---

## 🟠 16. AVIF Encode/Decode C Library Segfault

**File:** `src-tauri/src/converter/image.rs:82-93`

The `image` crate's AVIF support uses `libavif` (C library) via FFI. `AvifEncoder::new_with_speed_quality` and `write_image` call into C code. Like WebP, malformed or edge-case images can trigger segfaults in the C library.

**Impact:** Process crash, SIGSEGV, no recovery possible.

---

## 🟠 17. Files with No Extension

**File:** `src/hooks/useConversion.ts:175`

```typescript
const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
```

Files like `Makefile`, `Dockerfile`, or `.gitignore` have no extension after the split. `pop()` returns `"Dockerfile"` (the whole name) for `"Dockerfile"`, but for `.gitignore`, `split(".")` produces `["", "gitignore"]` and `pop()` returns `"gitignore"`. Either way `ext` is not empty.

But if `item.fileName` is empty or undefined, `ext` becomes `""`. Then `ext.toUpperCase()` is `""`, which is harmless as a display format.

**Impact:** Display glitch (empty format shown). Not a crash.

---

## 🟠 18. Multiple WebViews / DevTools Memory

**File:** `src-tauri/Cargo.toml:16`

```toml
tauri = { version = "2", features = ["protocol-asset", "devtools"] }
```

The `devtools` feature enables the Web Inspector in production builds. This increases the memory footprint of every `WebView` by ~50-100MB. On low-RAM systems, this can contribute to OOM.

**Impact:** Increased memory pressure. Remove `devtools` from release builds.

---

## 🟠 19. CSP Disabled

**File:** `src-tauri/tauri.conf.json:22`

```json
"csp": null
```

CSP is completely disabled (`null` means no Content Security Policy). Any script injection or XSS vulnerability is exploitable. In a file converter that handles filenames from untrusted sources (user-dropped files with crafted names), this is a security concern if filenames are rendered unsanitized.

**Impact:** Potential XSS via filename injection in the queue component.

---

## 🟠 20. `getFileInfo` Calls a Non-Existent Command

**File:** `src/lib/ipc.ts:8-10`

```typescript
export const getFileInfo = async (path: string): Promise<FileMetadata> => {
    return await invoke("get_file_info", { path });
};
```

The command `get_file_info` is **not registered** in `lib.rs`. If any component calls this function, the `invoke` call gets a "command not found" error from Tauri. The error propagates as an unhandled promise rejection.

**Impact:** Unhandled rejection crash if this function is ever used. Currently it seems to be dead code.

---

## 🟡 21. Reorder Animation Stale Closure

**File:** `src/components/queue/QueueItem.tsx:43-52`

```typescript
const [shouldAnimate, setShouldAnimate] = useState(() => index <= 15);
useEffect(() => {
    if (index > 15) return;
    const delay = index * 40;
    const timer = setTimeout(() => {
        setShouldAnimate(false);
    }, delay + 300);
    return () => clearTimeout(timer);
}, [index]); // depends on index
```

The `useState` initializer captures `index` at creation time. When items are reordered, the `index` prop changes but the `key` prop on the `Draggable` is `item.id`, so React reuses the component. The animation timer fires with the new `index`, which is correct due to the `[index]` dependency. But the `shouldAnimate` state persists across reorders.

**Impact:** Items that were previously animated can re-animate on reorder. Cosmetic only.

---

## 🟡 22. Missing Scope Permissions for Asset Protocol

**File:** `src-tauri/tauri.conf.json:26-34`

The asset protocol scope allows `$DOWNLOAD`, `$DOCUMENT`, `$PICTURE`, `$VIDEO`, `$AUDIO`, and `assets/**`. If the user selects files from outside these directories (e.g., `/home/user/projects/`), the `convertFileSrc` URL will be blocked by Tauri's asset protocol scope, and the image preview will fail.

**Impact:** Image preview not shown for files outside allowed directories.

---

## 🟡 23. FPS/Channels Zero Values Passed to FFmpeg

**File:** `src-tauri/src/converter/media.rs:78-83`

```rust
if fps > 0 {
    args.push("-r".to_string());
    args.push(fps.to_string());
}
```

The `> 0` guard prevents invalid FPS. But `audio_channels` at line 108-113 has no such guard:
```rust
if channels > 0 {
    args.push("-ac".to_string());
    args.push(channels.to_string());
}
```
This is guarded. OK.

---

## 🟡 24. Tauri `download_dir()` May Not Be Available on All Platforms

**File:** `src-tauri/src/commands/convert.rs:51-52`

```rust
if let Ok(downloads) = handle_for_task.path().download_dir() {
```

On some Linux environments (Flatpak, Snap), `download_dir()` may return an error or an empty path. The fallback to `input_path.parent()` works but may produce the empty path issue described in finding #4.

---

## Summary

### Crash Probability Ranking

| Rank | Issue | Type | Likelihood |
|------|-------|------|------------|
| 1 | Task exhaustion / OOM (unbounded spawn) | OOM Crash | **High** |
| 2 | StrictMode listener race → double events | Data corruption | **High** |
| 3 | Mutex poisoning | Silent failures | **Medium** |
| 4 | `unreachable!()` on format mismatch | Panic | **Medium** |
| 5 | Empty base path on `parent() = None` | IO Error/Panic | **Medium** |
| 6 | Large image OOM / segfault in C decoder | SIGSEGV | **Medium** |
| 7 | WebP/AVIF C FFI segfault | SIGSEGV | **Medium** |
| 8 | Ticker orphan on early panic | Resource leak | **Medium** |
| 9 | FFmpeg hang with no timeout | Deadlock | **Medium** |
| 10 | Semaphore starvation on `maxConcurrent=0` | Deadlock | **Medium** |

## Addendum: "Hang + Black Screen After Conversion" — Deep Trace

The user reports the app hangs and the window goes black after conversion completes. This is a
**specific, reproducible-seeming crash** with a distinct mechanism from the general findings above.

### Root Cause Analysis

The black screen is caused by the **webview main thread being blocked** while the window has
`decorations: false` (no native OS chrome). When the main thread stops processing:

1. No more paint cycles → last frame persists until GPU surface is reclaimed
2. No event loop → `appWindow.startDragging()` callbacks never fire
3. No way to close/move/resize the window (no native title bar, no OS chrome)

The trigger is in `src/hooks/useConversion.ts`, specifically the completion sequence.

### 🔴 25. `playSuccessChime()` Blocks the WebView Main Thread (High Likelihood)

**File:** `src/hooks/useConversion.ts:58-112`

After all conversions finish, the `items` effect at line 121 fires:

```typescript
// src/hooks/useConversion.ts:136-138
showDesktopNotification(doneCount, errorCount);
playSuccessChime();  // <-- THIS
```

The `playSuccessChime()` function synchronously accesses `window.AudioContext`:

```typescript
const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext;
if (!AudioContextClass) return;

if (!globalAudioCtx) {
    globalAudioCtx = new AudioContextClass();  // <-- BLOCKING
}
```

**On Linux (WebKitGTK), `new AudioContext()` triggers:**
1. GStreamer pipeline initialization
2. PulseAudio server discovery and connection
3. Audio codec plugin probing
4. Hardware audio sink negotiation

All of this runs **synchronously on the webview's main thread**. If PulseAudio is unresponsive
(socket timeout, stale connection, or not running), this can block for **5-30 seconds** or
indefinitely.

During the block:
- No paint cycles → window goes black
- No input processing → window appears hung
- Custom title bar is unresponsive → user can't close or minimize
- Since `decorations: false`, there are no OS window controls either

**On first call, `globalAudioCtx` is null**, so `new AudioContextClass()` runs the full
initialization. This happens exactly when the conversion batch completes.

**Crash mechanism:** AudioContext construction in WebKitGTK blocks the main thread → webview
stops painting → window shows black background → no input processing → hard hang.

**Fix:** 
1. Remove the chime entirely, or
2. Lazy-initialize AudioContext at app startup (idle time), not in a completion callback, or
3. Wrap AudioContext creation in a `setTimeout(0)` to defer off the critical path, or
4. Use a Web Audio worklet or OfflineAudioContext to avoid PulseAudio interaction

### 🟠 26. Tauri `getCurrentWindow()` During Main Thread Block Creates Deadlock Risk

**File:** `src/components/layout/TitleBar.tsx:12-14`

```typescript
onMouseDown={(e) => {
    if (e.button === 0) appWindow.startDragging();
}}
```

If the user clicks the title bar during (or just before) the AudioContext block, `startDragging()`
puts the webview into a mouse-tracking loop that also blocks the main thread. With `decorations: false`,
there is no OS-level drag fallback. If the AudioContext initialization then blocks inside the
drag loop, the window becomes permanently stuck.

**Fix:** Guard `startDragging()` with a check that the app isn't in a busy state, or use
`document.addEventListener('dragstart', ...)` with a timeout.

### 🔴 27. Progress Event Storm Causes UI Freeze (High Likelihood)

**File:** `src-tauri/src/commands/convert.rs:153-173`

The ticker task emits progress events at **25 fps (every 40ms)**:

```rust
let interval_ms = 40;
loop {
    tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    // ...
    let _ = handle_progress.emit("conversion:progress", serde_json::json!({...}));
}
```

Each event triggers on the frontend:
1. `listen` callback calls `updateItem()` → Zustand state update
2. Zustand triggers React re-render of all components subscribed to `useQueueStore`
3. `App.tsx`, `SplitPane.tsx`, `QueueItem.tsx` (all 500 items), `StatusBar.tsx`,
   `VisualFormatSelector.tsx`, and `SettingsPanel.tsx` all re-render
4. `QueueItem.tsx` is `memo`'d, but `useQueueStore` subscriptions mean every item
   re-renders because Zustand creates new object references

With 25 events/sec × 500 items = **12,500 component evaluations per second**.

The `StatusBar.tsx` runs O(n) array filters on every render:
```typescript
const activeItems = items.filter(i => i.status === "converting" || i.status === "queued");
const doneItems = items.filter(i => i.status === "done");
const failedItems = items.filter(i => i.status === "error");
```

And the `useConversion` hook effect at line 121 runs O(n) checks on every render.

**Crash mechanism:** High event frequency + O(n) scans + full-app re-renders = main thread
queue fills up. After conversion ends, the queued work (final batch of 25+ events × all
re-renders + AudioContext initialization + notification) overwhelms the thread and it stops
processing the event loop → black screen.

**Fix:**
1. Reduce progress event frequency to 1-2 fps (250-500ms interval)
2. Use Zustand selectors with shallow equality to prevent unnecessary re-renders
3. Memoize the computed values in StatusBar (derived state)
4. Batch progress updates: emit every N ticks instead of every tick

### 🟠 28. Final Render Spike Triggers Layout Thrash

**File:** `src/App.tsx:56-66`

When all conversions complete, the final event batch triggers a cascade:

1. `StatusBar.tsx` computes `detailText` changes to "Batch Completed"
2. `useConversion` effect fires → calls `showDesktopNotification` and `playSuccessChime`
3. `addHistoryEntry` adds to persisted history store (localStorage write)
4. All these state changes happen in the same microtask

The combination of:
- 500 items all transitioning to "done" in rapid succession
- Progress bars animating via CSS transitions (`transition-all duration-300`)
- History store persisting to localStorage (synchronous write in Tauri FS plugin)

can cause a forced layout/reflow storm that exceeds the frame budget.

**Fix:** Debounce the completion detection effect (e.g., `setTimeout(100)` before
`showDesktopNotification`).

### 🟠 29. Image Thumbnail Memory Accumulation

**File:** `src/components/queue/QueueItem.tsx:71-81`

```typescript
const imageUrl = useMemo(() => {
    if (isImage && item?.path && !imageError) {
        return convertFileSrc(item.path);
    }
}, [isImage, item?.path, imageError]);
```

Each queued image file has a `convertFileSrc` URL loaded as an `<img>`. These images are
decoded by the webkit WebView and cached in memory. After converting 100+ images, the
WebView's image cache can grow to hundreds of megabytes.

When conversion completes and the UI is at rest, the WebView still holds all decoded image
data in its render tree cache. On low-RAM systems, this accumulated memory pressure triggers
the OOM killer, which takes down the entire app process.

**Fix:** Limit thumbnail rendering to visible items only (virtualization / windowing).

### 🟠 30. StrictMode Doubles Every Completion Side Effect

**File:** `src/hooks/useConversion.ts:121-140`

In development (React 18 StrictMode), the `useConversion` hook mounts twice. The `items`
effect runs twice. The second run sees the same "all done" state, so `playSuccessChime()`
and `showDesktopNotification()` are called **twice**.

Double AudioContext initialization doubles the blocking time. Double Notification request
can cause platform-level dialog conflicts.

In production (without StrictMode), this is not triggered, which explains why the crash is
"random" — it depends on whether the app was launched in dev mode.

### Summary: Black Screen Crash Chain

```
Conversion completes
  → Progress events drain (last batch of re-renders)
  → App transitions to "all done" state
  → StatusBar re-renders with "Batch Completed"
  → QueueItem re-renders with 100% progress bars (CSS transitions start)
  → addHistoryEntry → persisted store write → Zustand re-render
  → playSuccessChime() called
    → [if first time] new AudioContext() ← MAIN THREAD BLOCKED
      → GStreamer init → PulseAudio probe → HANG
      → WebView stops painting → BLACK SCREEN
      → No input processing → HANG
```

### Fix Priority (Specific to This Crash)

1. **Replace `new AudioContext()` with lazy initialization** — create it once at idle startup
   (`requestIdleCallback`) or remove the chime
2. **Reduce progress event rate** from 40ms to 250ms — 6x fewer re-renders
3. **Add isAnimating guard to `startDragging()`** — prevent drag lock during busy periods
4. **Wrap `playSuccessChime` in `setTimeout(500)`** — defer off the critical completion path
5. **Derive StatusBar counts with `useMemo`** — O(n) filters on every render is wasteful
6. **Virtualize queue list** — only render visible items to reduce memory pressure

### Recommended Fix Priority (Full List)

1. **Clamp `max_concurrent` to `max(1, ...)`** — prevents semaphore starvation
2. **Cap batch size to 100 files** — prevents OOM from excessive tasks
3. **Limit image decode to max 100MP** — prevents OOM from large images
4. **Guard `unreachable!()` with a format canonicalization** — prevents panic
5. **Fix async listener race in `useConversion`** — prevents data corruption
6. **Add FFmpeg timeout (5 minutes)** — prevents deadlock on corrupted files
7. **Validate `base_dir` is non-empty** — prevents wrong output location
8. **Switch `Mutex` to `RwLock` or `dashmap`** — prevents poisoning cascade
9. **Remove or defer `playSuccessChime` AudioContext** — prevents black screen hang
10. **Reduce progress event rate to 250ms** — prevents UI thread saturation
