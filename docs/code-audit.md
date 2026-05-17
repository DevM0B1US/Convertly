# Code Quality Audit — Octovert / Convertly

Generated: 2026-05-17

---

## 🔴 Critical (bugs / data loss)

| # | File:Line | Issue |
|---|-----------|-------|
| 1 | `src/hooks/useConversion.ts:58-62` + `src/components/layout/SplitPane.tsx:17` | **`useConversion()` called twice** — registers duplicate Tauri event listeners. Every progress/complete/error event fires twice, causing double state updates and duplicate history entries. |
| 2 | `src/hooks/useConversion.ts:58-62` | **Async listener leak** — `listen()` returns `Promise<UnlistenFn>`. If component unmounts before the promise resolves, old listeners never unregister. Over time, multiple listeners accumulate. |
| 3 | `src-tauri/src/commands/convert.rs:81-83` | **`panic!` on semaphore close** — `unwrap_or_else(|_| panic!(...))` crashes the whole async task instead of returning an error. |
| 4 | `src/components/queue/QueueItem.tsx:78` | **Fire-and-forget promise** — `cancelConversion(id)` returns a `Promise<void>` that is neither `await`ed nor `.catch()`ed. Unhandled rejections silently swallowed. |
| 5 | `src-tauri/src/commands/files.rs:94-102` | **Dead backend commands** — `remove_file` and `clear_queue` are registered Tauri commands that do nothing (`let _ = id; Ok(())`). Frontend calls them expecting real behavior. |
| 6 | `src/stores/historyStore.ts:21-31` | **Bypasses Zustand persist** — manually reads/writes `localStorage` instead of using `zustand/middleware/persist`. Can cause stale data with React concurrent rendering. |
| 7 | `src/components/queue/QueueItem.tsx:47` | **Stale closure in animation** — `useEffect` captures `index` but has empty dep `[]`. Drag-reordering the queue leaves animations using the original index forever. |
| 8 | `src-tauri/src/commands/convert.rs:107-110` | **Hardcoded fallback dimensions** — `image_dimensions` failing silently defaults to `(1920, 1080)`. Wrong progress estimates for small/non-standard images. |
| 9 | `src-tauri/src/commands/convert.rs:116-148` | **Ticker task leaks** — if `spawn_blocking` panics before setting `progress_done = true`, the progress ticker runs until parent task aborts. |
| 10 | `src-tauri/src/converter/image.rs:36-43` | **Overwrite on dedup overflow** — if all 9999 numbered variants exist, the last path overwrites the file at index 9999 instead of erroring. |
| 11 | `src/components/queue/QueueItem.tsx:56-58` + `src/components/convert/VisualFormatSelector.tsx:10-35` + `src/components/layout/SplitPane.tsx:24-27` + `src-tauri/src/commands/files.rs:55-58` | **Extension lists duplicated in 4 places** — must be manually kept in sync; a maintenance time bomb. |

---

## 🟠 Moderate

| # | File:Line | Issue |
|---|-----------|-------|
| 12 | `src/components/layout/SplitPane.tsx:41` | **`any` type** on `onDragEnd` result — should be `DropResult` from `@hello-pangea/dnd`. |
| 13 | `src/hooks/useFileDrop.ts` | **Entire file is dead code** — `useFileDrop` hook exists but is never imported anywhere in the codebase. |
| 14 | `src/hooks/useConversion.ts:14` | **Floating-point equality** — `percent === 100` on a float from JSON serialized `f32` could fail on edge cases like `99.999999`. |
| 15 | `src-tauri/src/commands/convert.rs:47-77` | **~30 lines duplicated** — two nearly identical branches for resolving `out_dir_path` with/without `out_dir_base`. |
| 16 | `src-tauri/src/converter/image.rs:36-43` + `src-tauri/src/converter/media.rs:50-58` | **Dedup loop duplicated** — identical `for i in 1..10000` pattern in both files, should be a shared utility function. |
| 17 | `src/components/queue/FormatSelectorPopover.tsx:76` | **Invalid formats selectable** — `'pdf'`, `'docx'`, `'txt'` can be selected but are not in the `TargetFormat` type definition. |
| 18 | `src/components/convert/VisualFormatSelector.tsx:243` | **Unsafe `as` cast** — `.toLowerCase() as 'image' | 'video' | 'audio'` — `"Unknown"` would produce `"unknown"` not in the union. |
| 19 | `src/components/settings/SettingsPanel.tsx:327` | **`as any`** bypassing type checking on `setGlobalSpeed`. |
| 20 | `src/stores/settingsStore.ts:24-25` | **Dead code** — `setFileOverride` / `removeFileOverride` are defined, exported, and persisted, but never called from any component. |
| 21 | `src/components/layout/StatusBar.tsx:13` | **Hardcoded UX text** — `"Output: Same as source"` doesn't reflect the actual `outputDir` setting. |
| 22 | `src-tauri/src/converter/media.rs:148` | **Hardcoded `ffmpeg` PATH** — assumes `ffmpeg` is on `$PATH` with no user-facing error if missing. |
| 23 | `src-tauri/src/commands/files.rs:51-52` | **Two `unwrap_or_default()` calls** — silently produce empty strings on failure rather than propagating errors. |
| 24 | `vite.config.ts:6` | **Unnecessary `async`** — config is fully synchronous. |

---

## 🟡 Minor

| # | File:Line | Issue |
|---|-----------|-------|
| 25 | `src/components/queue/QueueItem.tsx:33` | `\|\|` instead of `??` for format fallback — empty string `""` falls through incorrectly. |
| 26 | `src/App.tsx:42-51` | `renderContent` recreated every render; should be extracted as a memoized component. |
| 27 | `src/App.tsx:67` | Mixed named/default export — inconsistent with codebase convention (other components use named exports only). |
| 28 | `src/components/layout/TitleBar.tsx:17-20` | Inline `pointerEvents` styles instead of Tailwind classes. |
| 29 | `src/stores/settingsStore.ts:13` | `perFileOverrides` grows unbounded in localStorage with no cleanup strategy. |
| 30 | `package.json` | No `test`, `lint`, or `typecheck` scripts despite having `vitest`, `playwright`, and `@testing-library/react` installed. |
| 31 | — | No lint configuration (no ESLint, Prettier, or Biome config found). |
| 32 | — | No CI pipeline (no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, etc.). |

---

## Summary

The project has a clean modular structure with no monorepo bloat, but suffers from:

- **Event listener mismanagement** — duplicate registration and async cleanup bugs that corrupt history and leak memory
- **Dead code paths** — unused hooks, no-op backend commands, and unhandled promise rejections
- **Duplication** — extension lists and dedup logic repeated across frontend and backend
- **Weak typing** — `any` and `as any` casts that defeat TypeScript
- **Missing infrastructure** — no tests, no linting, no CI
