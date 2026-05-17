# Format Conversion Performance Optimization

A deep-dive into every technique available to significantly speed up format conversion, tailored to Convertly's tech stack (Rust + `image` crate for images, FFmpeg sidecar for video/audio, Tauri v2 desktop shell).

---

## Table of Contents

1. [Image Conversion](#1-image-conversion)
   - [Parallelize with Rayon](#11-parallelize-with-rayon)
   - [Replace `image` Crate with libvips](#12-replace-image-crate-with-libvips)
   - [SIMD Acceleration](#13-simd-acceleration)
   - [Decode-Only-Once Optimization](#14-decode-only-once-optimization)
   - [Use the `image` Crate's `GenericImage` Directly](#15-avoid-dynamicimage-overhead)
   - [AVIF Encoder Tuning](#16-avif-encoder-tuning)
2. [Video/Audio Conversion (FFmpeg)](#2-videoaudio-conversion-ffmpeg)
   - [GPU Hardware Acceleration](#21-gpu-hardware-acceleration)
   - [Parallel Multi-File Encoding](#22-parallel-multi-file-encoding)
   - [Split-and-Encode-in-Parallel (Single Video)](#23-split-and-encode-in-parallel-single-video)
   - [FFmpeg Thread Tuning](#24-ffmpeg-thread-tuning)
   - [Use `-map` and Stream Copy Where Possible](#25-use--map-and-stream-copy-where-possible)
   - [Ultrafast Presets vs Quality Tradeoffs](#26-ultrafast-presets-vs-quality-tradeoffs)
3. [System-Level Optimization (Tauri + Rust)](#3-system-level-optimization-tauri--rust)
   - [Rayon + Tokio Integration](#31-rayon--tokio-integration)
   - [Memory-Mapped I/O for Large Files](#32-memory-mapped-io-for-large-files)
   - [I/O Pipelining (Read While Encode)](#33-io-pipelining-read-while-encode)
   - [Batch Processing Queue Optimization](#34-batch-processing-queue-optimization)
4. [Benchmarking Results Summary](#4-benchmarking-results-summary)
5. [Recommended Implementation Priority](#5-recommended-implementation-priority)
6. [System Stability & Crash Prevention](#6-system-stability--crash-prevention)
   - [CPU Throttling & Thermal Safety](#61-cpu-throttling--thermal-safety)
   - [Memory Pressure & OOM Prevention](#62-memory-pressure--oom-prevention)
   - [Disk Space Monitoring](#63-disk-space-monitoring)
   - [I/O Saturation Prevention](#64-io-saturation-prevention)
   - [UI Responsiveness Guarantees](#65-ui-responsiveness-guarantees)
   - [Battery-Aware Throttling](#66-battery-aware-throttling-laptops)
   - [Error Recovery & File Integrity](#67-error-recovery--file-integrity)
   - [Graceful Degradation Matrix](#68-graceful-degradation-matrix)
   - [Stability Monitoring Service](#69-implementation-stability-monitoring-service)

---

## 1. Image Conversion

Current stack: Pure Rust via the `image` crate (v0.25). Synchronous per-file, single-threaded decode → process → encode.

### 1.1 Parallelize with Rayon

**Gain: 2–8× (scales with core count, diminishing returns past 8 threads)**

The `image` crate is CPU-bound. Processing files sequentially leaves cores idle. Wrapping batch image conversion with [Rayon's parallel iterator](https://docs.rs/rayon) is the single highest-ROI change for batch scenarios.

```rust
use rayon::prelude::*;

fn convert_images_batch(items: Vec<ConversionJob>) -> Vec<Result<PathBuf, String>> {
    items
        .par_iter()
        .map(|job| convert_image(&job.app_handle, &job.input, &job.output, &job.settings, &job.id))
        .collect()
}
```

**Important:** Rayon's thread pool competes with Tokio's async runtime. See §3.1 for the correct integration pattern.

### 1.2 Replace `image` Crate with libvips

**Gain: 4–17× over ImageMagick, 2–5× over `image` crate (large images)**

[libvips](https://www.libvips.org/) is a C library that is **demand-driven** and **horizontally threaded**. It processes only the pixels that are actually needed and uses all CPU cores automatically. Benchmarks from the libvips project show it is **~17× faster than ImageMagick** and significantly faster than raw Rust pixel iterators for operations like resize + format conversion.

There is a Rust binding: [`libvips`](https://crates.io/crates/vix) (or use `libvips-sys` directly).

| Operation | `image` crate | libvips | Speedup |
|-----------|-------------|---------|---------|
| Resize 30K×26K JPEG to 128px | ~2.7s | ~0.2s | **13×** |
| Batch 1000× JPEG→WebP (small) | ~3.7s | ~0.2s | **18×** |
| Crop + Sharpen + Save (large) | varies | ~7× less memory | — |

libvips is also the engine behind Node.js's `sharp` library, which is the de-facto standard for perf-critical image processing in the Node ecosystem.

**Tradeoffs:** Adds a C system dependency (libvips .so/.dll). Not worth it if you only do simple format swaps on small images.

### 1.3 SIMD Acceleration

**Gain: 2–4× on pixel-processing hot loops**

Rust's [portable SIMD](https://doc.rust-lang.org/beta/unstable-book/library-features/core-simd.html) (stable in nightly, or via the `core_simd` / `packed_simd` crates) can manually accelerate pixel arithmetic:

- **RGB→RGBA conversion**: Process 16 pixels at once with `u8x64`
- **Color space transforms**: SIMD-accelerated YUV↔RGB
- **Resize kernels**: Lanczos filter taps apply independently per channel

The `image` crate already uses SIMD for some operations internally (via `generic-array`), but you can get more by writing your own pixel shuffling for encode preparation.

**Practical path:** Use the [`safe_arch`](https://docs.rs/safe_arch/) crate for explicit SIMD with CPU feature detection at runtime.

### 1.4 Decode-Only-Once Optimization

**Gain: ~1.5× when outputting multiple formats from one source**

If converting the same input to multiple output formats (e.g., JPEG + WebP + AVIF), decode once, clone the `DynamicImage` buffer, and encode each variant. Currently each format conversion re-decodes from disk.

```rust
let img = ImageReader::open(path)?.decode()?;
// Reuse `img` for all target formats
```

### 1.5 Avoid `DynamicImage` Overhead

**Gain: 10–30% per conversion**

`DynamicImage` is an enum over many buffer types. Every operation matches on the variant. If you know your input format and output format, stay in typed buffers:

```rust
// Slower (dynamic dispatch):
let img = reader.decode()?; // DynamicImage
let rgb = img.to_rgb8(); // allocates new buffer

// Faster (if source known):
let rgb = reader.decode()?.into_rgb8(); // one conversion
```

### 1.6 AVIF Encoder Tuning

**Gain: 2–3× (at cost of larger file size)**

AVIF encoding is extremely slow. The `image` crate uses `rav1e` under the hood for AVIF. The `speed` parameter in `AvifEncoder::new_with_speed_quality()` ranges 0 (slowest/best) to 10 (fastest/worst). Current Convertly defaults to 6. Setting speed = 10 can be **3× faster** with minor quality loss.

---

## 2. Video/Audio Conversion (FFmpeg)

Current stack: Spawns `ffmpeg` as a subprocess with CPU-based software encoders (`libx264`, `libx265`, `libvpx-vp9`).

### 2.1 GPU Hardware Acceleration

**Gain: 5–50× over software encoding**

This is the single biggest performance lever for video conversion. Modern GPUs have dedicated media encoding/decoding silicon that runs independently of compute cores.

| Technology | Vendor | Encoder Flag | Typical Speedup |
|-----------|--------|-------------|----------------|
| **NVENC** | NVIDIA | `h264_nvenc` / `hevc_nvenc` / `av1_nvenc` | 5–50× realtime |
| **Intel QSV** | Intel | `h264_qsv` / `hevc_qsv` / `av1_qsv` | 5–30× realtime |
| **Intel VPL** | Intel (modern) | `h264_vpl` / `hevc_vpl` | 10×+ (ARC GPUs) |
| **VAAPI** | Linux (Intel/AMD) | `h264_vaapi` / `hevc_vaapi` | 3–10× realtime |
| **AMF** | AMD | `h264_amf` / `hevc_amf` | 3–10× realtime |
| **VideoToolbox** | Apple | `h264_videotoolbox` / `heus_videotoolbox` | 5–20× realtime |

**Implementation sketch for Convertly (NVENC as example):**

```rust
fn build_video_args_hw(settings: &ConversionSettings) -> Vec<String> {
    let mut args = vec!["-hwaccel".into(), "cuda".into()];
    args.extend(["-i".into(), input.into()]);

    match settings.target_format.as_str() {
        "mp4" => {
            args.extend(["-c:v".into(), "h264_nvenc".into()]);
            args.extend(["-preset".into(), "p7".into()]); // highest quality NVENC preset
            args.extend(["-cq".into(), quality.to_string()]); // constant quality, 0-51
        }
        "mp4-hevc" => {
            args.extend(["-c:v".into(), "hevc_nvenc".into()]);
            // similar
        }
        // ...
    }
    args
}
```

**Full GPU pipeline (avoid PCIe round-trips):**

```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda -i input.mp4 \
  -vf "scale_cuda=1920:1080" \
  -c:v hevc_nvenc -preset p7 -cq 23 \
  -c:a copy \
  output.mp4
```

Without `-hwaccel_output_format cuda`, decoded frames are copied back to CPU memory then re-uploaded — this kills the performance advantage.

**Detection at runtime in Convertly:**

```rust
// Probe for available HW encoders
let output = std::process::Command::new("ffmpeg")
    .args(["-encoders"])
    .output()?;
let has_nvenc = String::from_utf8_lossy(&output.stdout).contains("nvenc");
```

### 2.2 Parallel Multi-File Encoding

**Gain: N× where N = number of parallel files (up to core/GPU limit)**

Currently Convertly limits concurrent conversions to 2 (via Tokio semaphore). For CPU-based encoding, you can run as many FFmpeg processes as CPU cores. For GPU encoding, the limit depends on the GPU:

| GPU | Max Simultaneous NVENC Sessions |
|-----|-------------------------------|
| GeForce (consumer) | 2–3 (artificially limited by NVIDIA driver) |
| Tesla / Quadro / A-series | 5–∞ (unlimited) |
| Intel QSV | Depends on iGPU generation, typically 3–8 |
| AMD AMF | Typically 2–3 |

Using `xargs -P` or `GNU parallel` for batch CLI conversion:

```bash
find . -name "*.mp4" -print0 | xargs -0 -P 2 -I {} ffmpeg -i {} -c:v h264_nvenc {}.converted.mp4
```

For Convertly's Rust backend, this means spawning multiple FFmpeg children and increasing the semaphore limit when hardware encoders are available.

### 2.3 Split-and-Encode-in-Parallel (Single Video)

**Gain: ~1.5–2.5× per single large video**

For extremely long videos, split the input into segments, encode each segment in parallel, then concatenate:

```bash
# 1. Get duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4)

# 2. Split into N segments
ffmpeg -i input.mp4 -ss 0 -t $((DURATION/4)) -c copy part1.mp4
ffmpeg -i input.mp4 -ss $((DURATION/4)) -t $((DURATION/4)) -c copy part2.mp4
# ... (encode each part in parallel with hardware encoder)

# 3. Concatenate
ffmpeg -f concat -i filelist.txt -c copy output.mp4
```

**Caveat:** This only works for encode-bound scenarios. If the bottleneck is I/O, parallelism hurts. The segment boundary may also produce artifacts at concatenation points without careful keyframe alignment.

### 2.4 FFmpeg Thread Tuning

**Gain: 1.5–2× (varies by codec)**

Software encoders like `libx264`/`libx265` support internal threading via `-threads N`:

- `-threads 0` = auto-detect (default)
- `-threads N` = use exactly N threads

For `libx264`, setting `-threads` to the number of physical cores is optimal. Going beyond causes cache contention.

For `libx265`, the `x265-params` option gives fine-grained control:

```
-x265-params "pools=8:frame-threads=2:wpp=1:pmode=1"
```

This enables wavefront parallel processing (`wpp=1`) and parallel mode (`pmode=1`) for 2–3× speedup over the default.

**For hardware encoders:** NVENC and QSV run on fixed-function silicon. The `-threads` flag is largely irrelevant. Only set it for software codecs.

### 2.5 Use `-map` and Stream Copy Where Possible

If the user only changes container format (e.g., MKV→MP4) or only changes audio codec while keeping video untouched, use stream copy to avoid re-encoding:

```bash
ffmpeg -i input.mkv -c:v copy -c:a aac output.mp4
```

The `-c:v copy` flag is **zero-cost** — literally just rewrites the container headers.

### 2.6 Ultrafast Presets vs Quality Tradeoffs

Software encoder presets have a massive impact on speed:

| Preset | libx264 Speed | libx265 Speed | Quality Impact |
|--------|-------------|-------------|---------------|
| `ultrafast` | 10× | 8× | Significant |
| `superfast` | 7× | 6× | Large |
| `veryfast` | 5× | 4× | Moderate |
| `faster` | 3× | 2.5× | Small |
| `fast` | 2× | 1.5× | Minimal |
| `medium` (default) | 1× | 1× | Baseline |
| `slow` | 0.5× | 0.4× | Better |
| `veryslow` | 0.25× | 0.2× | Best |

NVENC uses a different preset system: `p1` (fastest) through `p7` (slowest/highest quality). Unlike x264, the speed difference between p1 and p7 is only ~2× (not 10×), because the heavy lifting is done by fixed-function silicon.

---

## 3. System-Level Optimization (Tauri + Rust)

### 3.1 Rayon + Tokio Integration

**Critical for preventing thread starvation.**

Convertly uses Tokio for async IPC with the frontend. Rayon's thread pool is separate from Tokio's. **Never run CPU-bound work (image conversion) directly on Tokio's async tasks** — it starves the I/O event loop.

Correct pattern:

```rust
use rayon::prelude::*;
use tokio::task::spawn_blocking;

#[tauri::command]
async fn convert_images(images: Vec<ConversionJob>) -> Result<Vec<String>, String> {
    // Offload CPU-bound image processing to Rayon via spawn_blocking
    let results = spawn_blocking(move || {
        images
            .par_iter()
            .map(|job| convert_image(job))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| format!("Thread pool error: {}", e))?;

    Ok(results.into_iter().filter_map(|r| r.ok()).collect())
}
```

This gives you three separate thread pools:
- **Tokio workers** (default: # of cores) → handle async I/O
- **Tokio blocking pool** (up to 512 threads) → bridge
- **Rayon** (default: # of cores) → CPU-parallel image processing

### 3.2 Memory-Mapped I/O for Large Files

**Gain: ~1.5–2× for large file I/O, lower memory pressure**

Image decoding reads the entire file into memory. Memory-mapped I/O (`mmap`) lets the OS page data in lazily. The `image` crate supports this via `ImageReader::open` internally, but you can also use the `memmap2` crate to map files and pass the byte slice to a decoder.

```rust
use memmap2::Mmap;
use image::load_from_memory;

let file = std::fs::File::open(path)?;
let mmap = unsafe { Mmap::map(&file)? };
let img = load_from_memory(&mmap)?;
// mmap is automatically unmapped when dropped
```

### 3.3 I/O Pipelining (Read While Encode)

While FFmpeg is encoding, have the next file ready in a pre-read cache. This hides disk I/O latency behind CPU/GPU work.

```rust
let (tx, mut rx) = tokio::sync::mpsc::channel::<PathBuf>(8);

// Prefetch thread
tokio::spawn(async move {
    for path in pending_files {
        // Pre-read into page cache
        tokio::fs::read(&path).await?;
        tx.send(path).await?;
    }
});

// Converter reads from channel (already cached in OS page cache)
while let Some(path) = rx.recv().await {
    // Conversion starts immediately, I/O was prefetched
    convert(&path).await;
}
```

### 3.4 Batch Processing Queue Optimization

**Gain: 30–50% reduction in total batch time**

1. **Priority sorting**: Sort by file size descending → process largest first (hides tail latency)
2. **I/O batching**: Flush output writes together
3. **Adaptive concurrency**: Start with `N = num_cores`, monitor throughput, adjust. If conversion uses GPU, limit to GPU session count. If CPU, scale to core count.
4. **Zero-copy output**: Use `tempfile` crate for writes then atomic rename to final path

---

## 4. Benchmarking Results Summary

| Technique | Category | Est. Speedup | Complexity | Effort |
|-----------|----------|-------------|------------|--------|
| Rayon parallel batch processing | Image | 4–8× | Low | Hours |
| GPU hardware acceleration (NVENC/QSV) | Video | 5–50× | Low-Medium | Days |
| libvips integration | Image | 2–17× | Medium | Days |
| FFmpeg split-and-encode-parallel | Video | 1.5–2.5× | Medium | Days |
| SIMD pixel ops | Image | 2–4× | High | Weeks |
| Decode-once reuse | Image | 1.5× | Low | Hours |
| Memory-mapped I/O | Both | 1.5× | Low | Hours |
| I/O prefetch / pipelining | Both | 1.2–1.5× | Medium | Days |

---

## 5. Recommended Implementation Priority

Given Convertly's current state (v0.1.0, early development):

### Phase 1 (Immediate, <1 week)
1. **Rayon parallel batch processing** for images — $cargo add rayon$, wrap `convert_image` in `par_iter()`
2. **Detect and offer GPU acceleration** for FFmpeg — probe for `nvenc`/`qsv`/`vaapi` at startup, add settings UI
3. **Decode-once reuse** for multi-format output from single source

### Phase 2 (Short term, 1–2 weeks)
4. **libvips integration** for high-volume/resize-heavy image workloads
5. **Split-and-encode-parallel** for long video files (configurable toggle)
6. **Adaptive concurrency** — detect GPU vs CPU and adjust semaphore limit

### Phase 3 (Medium term, 2–4 weeks)
7. **SIMD-optimized pixel operations** for custom pipelines
8. **I/O prefetch pipeline** to hide disk latency
9. **Memory-mapped I/O** for very large files (>100MB)

---

## 6. System Stability & Crash Prevention

> **Core principle:** No speed improvement matters if the user's system freezes, the app crashes, or files get corrupted. Stability is the real baseline for a desktop app.

This section covers **every angle** of keeping the system usable during conversion — from a low-end laptop with 4GB RAM to a high-end workstation.

---

### 6.1 CPU Throttling & Thermal Safety

**Problem:** Encoding pushes all cores to 100% for extended periods. On laptops, this causes thermal throttling (clock speed drops), fan noise, and in extreme cases, shutdown.

#### Angle 1: OS-Level Process Priority

Launch FFmpeg with lower scheduling priority so the OS preempts it when the user interacts with anything:

```rust
// Note: Unix-specific. std::os::unix::process::CommandExt and pre_exec are only available on Unix targets.
// To support both Windows and Unix, wrap with appropriate platform guards:
#[cfg(unix)]
{
    use std::os::unix::process::CommandExt;
    let mut cmd = std::process::Command::new("ffmpeg");
    // Set "niceness" — lower priority = less CPU contention
    unsafe {
        cmd.pre_exec(|| {
            libc::nice(10); // range -20 (highest) to 19 (lowest). macOS also supports nice() but might require different nice ranges or syscalls under heavy sandbox.
            Ok(())
        });
    }
}
#[cfg(windows)]
{
    // On Windows, use SetPriorityClass via winapi/windows crate after spawning:
    // use windows::Win32::System::Threading::{SetPriorityClass, BELOW_NORMAL_PRIORITY_CLASS, GetCurrentProcess};
    // unsafe { SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS); }
}
```

On Linux, this is equivalent to `nice -n 10 ffmpeg ...`. The user's browser, IDE, or game gets CPU first; FFmpeg gets leftovers. **Zero throughput loss** when the system is idle — only surrenders CPU when contended.

#### Angle 2: Limit Physical Core Usage (Avoid Hyperthreading)

Software encoders that use all logical cores (including SMT/hyperthreads) cause cache thrashing and starve foreground apps:

```rust
fn get_physical_cores() -> usize {
    // Calling num_cpus::get_physical() provides a highly reliable, cross-platform physical core count
    // (working correctly across SMT configurations, Intel P/E cores, and ARM big.LITTLE architectures).
    // If a zero-dependency policy is strictly required, fallback to parsing /proc/cpuinfo on Linux.
    
    #[cfg(not(target_os = "linux"))]
    {
        num_cpus::get_physical()
    }
    
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/proc/cpuinfo")
            .ok()
            .map(|content| {
                let core_ids: std::collections::HashSet<_> = content
                    .lines()
                    .filter(|line| line.starts_with("core id") || line.starts_with("processor"))
                    .collect();
                if !core_ids.is_empty() { core_ids.len() } else { num_cpus::get_physical() }
            })
            .unwrap_or_else(|| num_cpus::get_physical())
    }
}
```

For libx264: `-threads N` where N = physical cores.  
For libx265: `-x265-params pools=N` where N = physical cores (limits thread pools).

#### Angle 3: Adaptive Throttle — Detect Thermal Throttling at Runtime

On Linux, read CPU temperature from `sysfs` and dynamically reduce concurrency:

```rust
fn read_cpu_temp() -> Option<f64> {
    let raw = std::fs::read_to_string(
        "/sys/class/thermal/thermal_zone0/temp"
    ).ok()?;
    let millidegrees: f64 = raw.trim().parse().ok()?;
    Some(millidegrees / 1000.0) // °C
}

const THROTTLE_THRESHOLD: f64 = 85.0; // °C
const BACKOFF_THRESHOLD: f64 = 75.0;

// In the semaphore acquisition loop:
if let Some(temp) = read_cpu_temp() {
    if temp > THROTTLE_THRESHOLD {
        // Reduce concurrency: acquire extra permit (effectively -1 slot)
        // Or simply wait longer before starting next job
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}
```

#### Angle 4: GPU Throttling (NVENC)

NVENC generates heat too. On laptop GPUs, sustained NVENC usage can cause thermal throttling that affects game FPS or CUDA compute. Monitor GPU temperature via `nvidia-smi` or `nvml-wrapper` crate.

---

### 6.2 Memory Pressure & OOM Prevention

**Problem:** Large images (e.g., 100MP RAW files) or many parallel conversions can exhaust system RAM. On Linux, the OOM killer terminates processes. On Windows/macOS, the system becomes unresponsive.

#### Current State in Convertly

The `image` crate decodes the entire image into memory as a `DynamicImage` / `ImageBuffer`. A 100MP RGBA image = ~400MB per decode. With Rayon parallelizing 4 at once = **1.6GB peak** just for image buffers — before encode output buffers.

#### Angle 1: Memory Budget Tracking

Use `sys-info` or `systemstat` crate to check available memory before starting a batch job:

```rust
use systemstat::{System, Platform};

fn available_memory_mb() -> Option<u64> {
    let sys = System::new();
    let mem = sys.memory().ok()?;
    Some(mem.free.as_megabytes() as u64)
}
```

Implement a **memory semaphore** alongside the concurrency semaphore:

```rust
/// Reservations ensure we never exceed 70% of system RAM
struct MemoryPool {
    max_bytes: u64,
    used: AtomicU64,
}

impl MemoryPool {
    fn reserve(&self, estimate_bytes: u64) -> Result<(), String> {
        loop {
            let current = self.used.load(Ordering::Acquire);
            if current + estimate_bytes > self.max_bytes {
                return Err("Memory budget exhausted, try fewer files".into());
            }
            if self.used.compare_exchange(current, current + estimate_bytes, Ordering::AcqRel, Ordering::Relaxed).is_ok() {
                return Ok(());
            }
        }
    }
}
```

#### Angle 2: Process-Level Memory Limit (Linux)

Set `memory.max` in cgroup v2 to prevent the app from being OOM-killed:

```rust
// IMPORTANT: This technique is strictly Linux-only, requires cgroup v2 enabled on the host system,
// and necessitates either root privileges or cgroup delegation configured for the current user.
// This function will fail on Windows and macOS, and on Linux systems without cgroup v2 write access.
// Do not silently ignore errors; check and handle std::io::Result to report failures to the user.
#[cfg(target_os = "linux")]
fn set_memory_limit(mb: u64) -> std::io::Result<()> {
    let pid = std::process::id();
    let cg_path = format!("/sys/fs/cgroup/convertly-{pid}");
    std::fs::create_dir(&cg_path)?;
    std::fs::write(format!("{cg_path}/memory.max"), format!("{mb}M"))?;
    std::fs::write(format!("{cg_path}/cgroup.procs"), pid.to_string())?;
    Ok(())
}
```

This tells the kernel: if Convertly exceeds this limit, kill Convertly's process — not the user's browser or IDE.

#### Angle 3: Streaming / Tile-Based Processing for Huge Images

Extremely large images (gigapixel, long TIFF strips) should not be fully decoded. Use the `image` crate's `ImageDecoderRect` trait to decode only needed regions. For libvips, this is automatic (demand-driven — only processes pixels that contribute to output).

---

### 6.3 Disk Space Monitoring

**Problem:** User starts a batch of 50 video conversions. Halfway through, the disk fills up. Mid-file corruption occurs, and previous outputs may already be incomplete.

**Solution:** **Always check available space before starting.**

```rust
use fs2::available_space;

fn check_disk_space(output_dir: &Path, required_bytes: u64) -> Result<(), String> {
    let available = available_space(output_dir)
        .map_err(|e| format!("Failed to check disk space: {e}"))?;

    if available < required_bytes {
        return Err(format!(
            "Insufficient disk space: {:.1} GB needed, {:.1} GB available",
            required_bytes as f64 / 1e9,
            available as f64 / 1e9,
        ));
    }

    // Also keep a 500MB emergency buffer
    if available - required_bytes < 500_000_000 {
        return Err("Not enough headroom — need 500MB buffer".into());
    }

    Ok(())
}
```

Estimate required space before conversion:
- **Images**: source file size × 2 (rough. AVIF/WebP compresses more, BMP uncompresses)
- **Video**: `bitrate × duration / 8` = file size. Add 20% headroom.

**Real-time monitoring during conversion:** In the progress loop, periodically re-check available space. If it drops below a threshold, pause the queue and warn the user.

---

### 6.4 I/O Saturation Prevention

**Problem:** Reading/writing multiple large files simultaneously makes the disk thrash (especially on HDDs). The UI becomes unresponsive because file operations block the event loop.

#### Angle 1: Separate Read/Write Thread Pools

Don't read from the same disk that you're writing to with concurrent tasks. Use a staging buffer approach:

```rust
// Read-ahead buffer cache (limits disk contention)
const MAX_CACHED_INPUTS: usize = 2;
struct IoCache {
    cached: Vec<Vec<u8>>,
}

// Read sequentially, then process in parallel
for input in files {
    let data = tokio::fs::read(&input).await?; // sequential reads
    cache.push(data);
}
// Now process from memory — no I/O contention
cache.into_par_iter().map(|data| process(&data));
```

#### Angle 2: Detect HDD vs SSD

HDDs cannot handle parallel random I/O. Detect and downgrade concurrency:

```rust
// Note: This logic is Linux-specific. Block device mapping and /sysfs rotational checks are unique to Linux.
#[cfg(target_os = "linux")]
fn resolve_block_device(path: &Path) -> Result<String, std::io::Error> {
    // 1. Follow symlinks and canonicalize path
    let canonical = path.canonicalize()?;
    
    // 2. Handle mount points by querying /proc/self/mountinfo
    let mountinfo = std::fs::read_to_string("/proc/self/mountinfo")?;
    let mut best_match = None;
    let mut max_len = 0;
    
    for line in mountinfo.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 10 {
            let mount_point = parts[4];
            let device_path = parts[9]; // e.g. /dev/sda1 or /dev/mapper/vg-lv
            if canonical.starts_with(mount_point) && mount_point.len() > max_len {
                max_len = mount_point.len();
                best_match = Some(device_path);
            }
        }
    }
    
    let dev_path_str = best_match
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Mount point not found"))?;
    let dev_path = Path::new(dev_path_str);
    
    // Canonicalize /dev/ device (resolving symlinks like /dev/disk/by-uuid/...)
    let canonical_dev = dev_path.canonicalize()?;
    let dev_name = canonical_dev.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid device filename"))?;
        
    // 3. Unwrap device-mapper names (e.g., LVM dm-X) to the underlying physical /sys/block entry
    if dev_name.starts_with("dm-") {
        // Look in /sys/block/dm-X/slaves/ to find the underlying physical device name
        let slaves_path = format!("/sys/block/{dev_name}/slaves");
        if let Some(entry) = std::fs::read_dir(slaves_path)?.next() {
            let entry = entry?;
            let slave_name = entry.file_name()
                .into_string()
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid slave device name"))?;
            return Ok(slave_name); // Returns e.g. "sda"
        }
    }
    
    // Strip trailing partition numbers to get base device name (e.g. sda1 -> sda, nvme0n1p2 -> nvme0n1)
    let base_device = if dev_name.starts_with("nvme") {
        dev_name.split('p').next().unwrap_or(dev_name).to_string()
    } else {
        dev_name.trim_end_matches(|c: char| c.is_ascii_digit()).to_string()
    };
    
    Ok(base_device)
}

#[cfg(target_os = "linux")]
fn is_hdd(path: &Path) -> Result<bool, std::io::Error> {
    // Call the device resolver helper
    let device = resolve_block_device(path)?;
    
    // 4. Read the rotational property from sysfs and handle errors
    let rotational_path = format!("/sys/block/{device}/queue/rotational");
    let rotational = std::fs::read_to_string(rotational_path)?;
    Ok(rotational.trim() == "1")
}
```

For HDDs: **force serial processing** (max_concurrent = 1) + sequential reads.

---

### 6.5 UI Responsiveness Guarantees

#### Angle 1: Dedicated UI Update Channel

Currently, progress is emitted in the same task that does the work. If the task is blocked (e.g., waiting on I/O), UI updates stall. Solution: **spawn a dedicated progress emitter task**.

```rust
// Current pattern (progress mixed with work):
// convert_media() parses FFmpeg stderr AND emits progress on the same loop

// Better: separate progress channel
let (progress_tx, progress_rx) = tokio::sync::mpsc::unbounded_channel();

// Worker sends progress messages
tokio::spawn(async move {
    while let Some(msg) = progress_rx.recv().await {
        app_handle.emit("conversion:progress", msg);
    }
});
```

This guarantees UI updates even if the main task is in a heavy compute section.

#### Angle 2: Yield to UI Thread Periodically

In long-running sync functions (like `convert_image`), insert voluntary yields:

```rust
// Note: Mark the function as async so callers can await the cooperative yield_now() call.
async fn convert_image_batch(items: &[Job]) {
    for (i, item) in items.iter().enumerate() {
        do_conversion(item);
        // Every 5 images, yield cooperatively to the Tokio scheduler to process UI events
        if i % 5 == 0 {
            tokio::task::yield_now().await;
        }
    }
}
```

Using `spawn_blocking` for image conversions (as Convertly already does) is correct — Tokio's blocking pool automatically manages thread isolation.

#### Angle 3: Cancellation Must Be Instant

Current `cancel_conversion` calls `handle.abort()`. This works but:

1. **Guard check**: If inside a `spawn_blocking`, aborting the outer task does not abort the blocking thread — it just drops the JoinHandle. The thread continues running in the background.
2. **Fix**: Pass a `CancellationToken` (from `tokio_util`) into the blocking task and check it periodically:

```rust
use tokio_util::sync::CancellationToken;

fn convert_image_cancellable(
    cancel: CancellationToken,
    input: &Path,
    output: &Path,
) -> Result<(), String> {
    // During decode...
    if cancel.is_cancelled() { return Err("Cancelled".into()); }
    // During encode...
    if cancel.is_cancelled() { return Err("Cancelled".into()); }
    Ok(())
}
```

---

### 6.6 Battery-Aware Throttling (Laptops)

**Problem:** Users on battery don't want the fan screaming and the battery draining in 30 minutes.

**Angle 1: Detect Battery/Power State**

```rust
fn on_battery_power() -> Option<bool> {
    #[cfg(target_os = "linux")]
    {
        // Linux: check /sys/class/power_supply/BAT0/status
        let status = std::fs::read_to_string("/sys/class/power_supply/BAT0/status").ok()?;
        Some(status.trim() != "Charging" && status.trim() != "Full")
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: Query battery state using Win32 API GetSystemPowerStatus
        // use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        unsafe {
            let mut status = std::mem::zeroed();
            if GetSystemPowerStatus(&mut status).as_bool() {
                Some(status.ACLineStatus == 0)
            } else {
                None
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: Query battery state via pmset command
        let output = std::process::Command::new("pmset")
            .args(["-g", "batt"])
            .output()
            .ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        Some(stdout.contains("Battery Power"))
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        // Fallback or use cross-platform battery crate:
        // let manager = battery::Manager::new().ok()?;
        // for battery in manager.batteries().ok()? {
        //     let bat = battery.ok()?;
        //     if bat.state() == battery::State::Discharging {
        //         return Some(true);
        //     }
        // }
        None
    }
}
```

**Angle 2: Automatic Preset Switching**

When on battery:
- **Images**: Disable parallel processing (force serial, 1 at a time)
- **Video**: Drop to ultrafast preset, or force `-threads 1`
- **Global**: Reduce `max_concurrent` from 2 → 1

When battery below 20%, **pause the queue** and show a notification.

---

### 6.7 Error Recovery & File Integrity

**Problem:** A crash mid-conversion leaves a partial/corrupt output file. The user doesn't know and may use it.

#### Angle 1: Atomic Writes

Always write to a `.tmp` file, then rename atomically on success:

```rust
fn atomic_write(output: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = output.with_extension("tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, output)?; // atomic on same filesystem
    Ok(())
}
```

If the app crashes during write, only the `.tmp` file is corrupt. The output file doesn't exist yet, so no confusion.

Currently in `convert_image`, JPEG/AVIF use `File::create` directly — these should use atomic patterns.

#### Angle 2: Resume / Skip Completed Files

Track completed conversions in a persistent store (Tauri's plugin-store):

```json
{
  "completed_conversions": {
    "/path/to/input.mp4": {
      "output": "/path/to/output.mp4",
      "hash": "sha256:abc...",
      "timestamp": "2026-05-17T12:00:00Z"
    }
  }
}
```

If the app crashes mid-batch and restarts, it can skip already-converted files.

#### Angle 3: Verify Output Integrity

For critical conversions, optionally verify output:

```rust
fn verify_output(input: &Path, output: &Path) -> Result<(), String> {
    // For lossless: compare pixel data (hash)
    // For lossy: check that file opens and has reasonable dimensions
    let img = ImageReader::open(output)
        .map_err(|_| "Output file is corrupt".to_string())?;
    let _ = img.decode()
        .map_err(|_| "Output file decode failed".to_string())?;
    Ok(())
}
```

---

### 6.8 Graceful Degradation Matrix

A decision table for what Convertly should do under various system conditions:

| Condition | Images | Video (SW) | Video (HW) |
|-----------|--------|-----------|-----------|
| Normal | Parallel (4×) | 2 concurrent, medium preset | 2 concurrent, p5 preset |
| Battery | Serial (1×) | 1 at a time, ultrafast | 1 at a time, p1 preset |
| Low battery (<20%) | Pause + notify | Pause + notify | Pause + notify |
| CPU > 85°C | Reduce to 2× parallel | 1 at a time, threads=1 | No change (lower heat) |
| GPU > 80°C (NVENC) | N/A | N/A | Pause 30s between files |
| RAM < 500MB free | Serial, strip before load | 1 at a time | 1 at a time |
| HDD detected | Serial, sequential | Serial, sequential | Serial, sequential |
| OOM / crash restart | Resume from checkpoint | Resume from checkpoint | Resume from checkpoint |

---

### 6.9 Implementation: Stability Monitoring Service

A background task that runs during conversion to monitor system health:

```rust
async fn system_health_monitor(
    throttle_tx: tokio::sync::watch::Sender<ThrottleLevel>,
) {
    let sys = systemstat::System::new();
    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;

        let cpu_temp = read_cpu_temp();
        let memory = sys.memory().ok();
        let battery = on_battery_power();

        let level = match (cpu_temp, memory, battery) {
            (Some(t), _, _) if t > 90.0 => ThrottleLevel::Critical,
            (Some(t), _, _) if t > 80.0 => ThrottleLevel::Reduced,
            (_, Some(mem), _) if mem.free.as_megabytes() < 500.0 => ThrottleLevel::Reduced,
            (_, _, true) => ThrottleLevel::Battery,
            _ => ThrottleLevel::Normal,
        };

        let _ = throttle_tx.send(level);
    }
}

enum ThrottleLevel { Normal, Reduced, Battery, Critical }
```

The conversion controller reads the `ThrottleLevel` and adjusts semaphore size + encoder settings accordingly — **at runtime, without user intervention**.

---

*Sources: Linux kernel docs (cgroups v2, OOM killer, nice/renice, cpufreq), NVIDIA NVML API, systemstat crate, fs2 crate, tokio_util CancellationToken, libc crate, Tauri plugin-store docs, Rust FFmpeg subprocess patterns.*
