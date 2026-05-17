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

*Sources: libvips benchmarks, NVIDIA NVENC documentation, Intel VPL docs, FFmpeg wiki, Rust `image` crate benchmarks, Rayon crate docs, Jellyfin hardware acceleration guide, Tauri/Rust async patterns.*
