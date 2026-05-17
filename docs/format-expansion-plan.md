# Format Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Convertly from ~21 supported formats to ~87 formats across image, audio, video, and document categories, matching the full spec from the design mockup.

**Architecture:** Leverage existing backends (FFmpeg for media, `image` crate for raster images) and add new backends for HEIC/HEIF (`libheif-rs`), JPEG XL (`jxl-oxide`), SVG (`resvg`), camera RAW (`rawloader`), and documents (shell-out to `pandoc` + Rust-native fallbacks). Extend extension lists, converter routing, type definitions, and UI components across all layers — backend Rust, frontend TypeScript, and UI selectors.

**Tech Stack:** Rust (`image-rs`, `libheif-rs`, `jxl-oxide`, `resvg`, `rawloader`, `pandoc` crate), FFmpeg 7.1 (with libjxl, librsvg, libopus, libx264/5, libvpx), TypeScript (React, zustand), Tauri 2.

**System FFmpeg (7.1.4) already includes:** `--enable-libjxl`, `--enable-librsvg`, `--enable-libvpx`, `--enable-libx264`, `--enable-libx265`, `--enable-libopus`, `--enable-libdav1d`, `--enable-libaom`, `--enable-libsvtav1`, `--enable-libmp3lame`

---

## File Structure Overview

### New files:
- `src-tauri/src/converter/svg.rs` — SVG-to-raster conversion via `resvg`
- `src-tauri/src/converter/heic.rs` — HEIC/HEIF decode/encode via `libheif-rs`
- `src-tauri/src/converter/jxl.rs` — JPEG XL decode via `jxl-oxide`
- `src-tauri/src/converter/raw.rs` — Camera RAW decode via `rawloader`
- `src-tauri/src/converter/document.rs` — Document-to-markdown conversion via `pandoc` shell-out
- `src-tauri/src/converter/audio.rs` — Audio-only conversion (extracted from media.rs for specialty formats)
- `src-tauri/src/types/format.rs` — Centralized format registry (replaces scattered extension lists)

### Modified files:
- `src-tauri/src/converter/mod.rs` — Register new converter modules
- `src-tauri/src/converter/image.rs` — Add encoding for new target formats enabled by image crate
- `src-tauri/src/converter/media.rs` — Extend container/codec mappings for all new video/audio formats
- `src-tauri/src/types.rs` — Expand extension lists, add `MediaType::Document`
- `src-tauri/src/commands/convert.rs` — Extend extension mapping, dispatch to new converters, duration estimates
- `src-tauri/src/commands/files.rs` — Add document file handling, metadata extraction
- `src-tauri/src/metadata/image.rs` — Extend metadata extraction for new formats
- `src-tauri/Cargo.toml` — Add dependencies (`libheif-rs`, `jxl-oxide`, `resvg`, `rawloader`, `pandoc` crate)
- `src/types/file.ts` — Add `Document` to `MediaType`, expand all extension lists and `TargetFormat`
- `src/components/convert/VisualFormatSelector.tsx` — Add document formats group, add new formats to each category
- `src/components/queue/FormatSelectorPopover.tsx` — Add new formats to popover lists
- `src/stores/*.ts` — Potentially extend settings for document-specific options

---

## Format Support Tiers

### Tier 1 — Trivial (enable existing crate features, add to lists)
**Effort:** ~1 day. **Value:** High.
- 8 image formats: DDS, EXR, Farbfeld, HDR, ICO, PNM (pbm/pgm/ppm/pam), QOI, TGA
- 6 audio formats: OPUS, OGA, AIFF, AIFC, AU, AC3
- 6 video formats: FLV, F4V, TS, VOB, M4V, OGV

### Tier 2 — Medium (new Rust libraries needed)
**Effort:** ~3 days. **Value:** High.
- HEIC/HEIF (`libheif-rs`)
- JPEG XL (`jxl-oxide`)
- SVG (`resvg`)
- Camera RAW: NEF, CR2 (`rawloader`)
- Audio: ALAC, AMR, MP1, MP2, MPC
- Video: MTS/M2TS, MPG/MPEG, WMV, 3GP/3G2, MXF

### Tier 3 — Document Support (new category)
**Effort:** ~4 days. **Value:** Very High (opens new use case).
- DOCX, DOC, MD, HTML, RTF, CSV, TSV, JSON, RST, EPUB, ODT, DOCBOOK

### Tier 4 — Niche / Low Priority
**Effort:** ~2 days. **Value:** Low.
- CUR, ANI, ICNS, MAT, DSD, DSF, DFF, MQA, RM/RMVB, SWF, H.264/H.265 raw, DIVX

---

## Dependency Analysis

### Existing Rust dependencies (to upgrade/expand):
| Crate | Current | Needed For | New Features |
|-------|---------|------------|--------------|
| `image` | 0.25 (jpeg,png,webp,avif,gif,bmp,tiff) | Tier 1 image formats | +dds,exr,ff,hdr,ico,pnm,qoi,tga |

### New Rust dependencies:
| Crate | Version | For | Notes |
|-------|---------|-----|-------|
| `libheif-rs` | 2.7+ | HEIC/HEIF decode/encode | `embedded-libheif` feature avoids system dep; integrates with `image` crate via `image` feature |
| `jxl-oxide` | 0.12+ | JPEG XL decode (input) | Pure Rust, `image` feature for `image` crate integration |
| `resvg` | 0.47+ | SVG rasterization | Pure Rust, renders SVG to tiny-skia pixmap, export to PNG |
| `rawloader` | 0.37+ | Camera RAW decode | LGPL, supports CR2, NEF, and 20+ RAW formats |
| `pandoc` (binary) | N/A | Document conversion tool | Shells out directly to the system `pandoc` binary |

### System dependencies (for build):
| Library | Required By | Install |
|---------|-------------|---------|
| `libheif-dev` >= 1.17 | `libheif-rs` (without embedded-libheif) | `apt install libheif-dev` |
| `pandoc` | Document conversion | `apt install pandoc` |

---

## Implementation Tasks

### Task 1: Centralize format registry

**Files:**
- Create: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/types.rs`

- [ ] **Step 1: Create `src-tauri/src/types/format.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FormatCategory {
    Image,
    Video,
    Audio,
    Document,
}

#[derive(Debug, Clone)]
pub struct FormatInfo {
    pub extensions: &'static [&'static str],
    pub label: &'static str,
    pub category: FormatCategory,
    pub can_decode: bool,
    pub can_encode: bool,
}

macro_rules! fmt_info {
    ($exts:expr, $label:expr, $cat:expr) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: true,
            can_encode: true,
        }
    };
    (decode $exts:expr, $label:expr, $cat:expr) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: true,
            can_encode: false,
        }
    };
    (encode $exts:expr, $label:expr, $cat:expr) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: false,
            can_encode: true,
        }
    };
}

pub fn lookup_format(extension: &str) -> Option<(FormatCategory, &'static str)> {
    let ext = extension.to_lowercase();
    for entry in ALL_FORMATS {
        if entry.extensions.contains(&ext.as_str()) {
            return Some((entry.category, entry.label));
        }
    }
    None
}
```

- [ ] **Step 2: Replace static extension lists in `types.rs` with re-exports from format registry**

```rust
// In types.rs
pub use crate::types::format::{
    FormatCategory, FormatInfo, lookup_format,
    IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, DOCUMENT_EXTENSIONS,
    ALL_EXTENSIONS,
};
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/types/format.rs src-tauri/src/types.rs
git commit -m "feat: add centralized format registry"
```

---

### Task 2: Enable Tier 1 image formats via `image` crate features

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/converter/image.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`
- Modify: `src/types/file.ts`

- [ ] **Step 1: Expand `image` crate features in Cargo.toml**

```toml
image = { version = "0.25", default-features = false, features = [
    "jpeg", "png", "webp", "avif", "gif", "bmp", "tiff",
    "dds", "exr", "ff", "hdr", "ico", "pnm", "qoi", "tga",
] }
```

- [ ] **Step 2: Add format entries to `ALL_FORMATS` in `format.rs`**

```rust
pub static IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "tiff", "tif",
    "dds", "exr", "ff", "farbfeld", "hdr", "ico", "cur",
    "pbm", "pgm", "ppm", "pnm", "pam",
    "qoi", "tga", "tpic",
];

pub static ALL_FORMATS: &[FormatInfo] = &[
    // Existing
    fmt_info!(["jpg", "jpeg"], "JPEG", Image),
    fmt_info!(["png"], "PNG", Image),
    fmt_info!(["webp"], "WEBP", Image),
    fmt_info!(["avif"], "AVIF", Image),
    fmt_info!(["gif"], "GIF", Image),
    fmt_info!(["bmp"], "BMP", Image),
    fmt_info!(["tiff", "tif"], "TIFF", Image),
    // Tier 1 additions
    decode!(["dds"], "DDS", Image),
    decode!(["exr"], "EXR", Image),
    fmt_info!(["ff", "farbfeld"], "Farbfeld", Image),
    fmt_info!(["hdr"], "HDR", Image),
    fmt_info!(["ico", "cur"], "ICO", Image),
    decode!(["pbm", "pgm", "ppm", "pnm", "pam"], "PNM", Image),
    fmt_info!(["qoi"], "QOI", Image),
    decode!(["tga", "tpic"], "TGA", Image),
    // ...
];
```

- [ ] **Step 3: Add `image` crate encoding blocks in `image.rs`**

```rust
// In the format match of convert_image():
"hdr" => {
    img.save_with_format(&output_path, ImageFormat::Hdr)
        .map_err(|e| format!("Failed to encode HDR: {}", e))?;
}
"ico" => {
    // ICO encoder saves as first frame
    img.save_with_format(&output_path, ImageFormat::Ico)
        .map_err(|e| format!("Failed to encode ICO: {}", e))?;
}
"qoi" => {
    img.save_with_format(&output_path, ImageFormat::Qoi)
        .map_err(|e| format!("Failed to encode QOI: {}", e))?;
}
// PNM (encode as PPM/PGM/PBM)
"pnm" | "ppm" | "pgm" | "pbm" => {
    img.save_with_format(&output_path, ImageFormat::Pnm)
        .map_err(|e| format!("Failed to encode PNM: {}", e))?;
}
"ff" | "farbfeld" => {
    img.save_with_format(&output_path, ImageFormat::Farbfeld)
        .map_err(|e| format!("Failed to encode Farbfeld: {}", e))?;
}
```

Note: DDS, EXR, TGA are decode-only in the image crate — they can be decoded as input but encoded to other output formats (not target formats).

- [ ] **Step 4: Add format validation + extension mapping in `convert.rs`**

```rust
// In the extension mapping match:
"dds" => "dds",
"exr" => "exr",
"hdr" => "hdr",
"ico" => "ico",
"qoi" => "qoi",
"pnm" | "ppm" | "pgm" | "pbm" => "pnm",
"ff" | "farbfeld" => "ff",
"tga" => "tga",

// Allow these as input-only (decode):
// dds, exr, tga - decode only, re-encode to other formats
```

- [ ] **Step 5: Update frontend type definitions**

In `src/types/file.ts`:
```typescript
export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif',
  'dds', 'exr', 'ff', 'farbfeld', 'hdr', 'ico', 'cur',
  'pbm', 'pgm', 'ppm', 'pnm', 'pam',
  'qoi', 'tga', 'tpic',
];

export type TargetFormat =
  | "webp" | "avif" | "png" | "jpeg" | "gif" | "bmp" | "tiff"
  | "hdr" | "ico" | "qoi" | "pnm" | "ff" | "farbfeld"
  | "mp4" | "mp4-hevc" | "webm" | "avi" | "mkv" | "mov"
  | "flv" | "f4v" | "ts" | "mts" | "m2ts" | "mpg" | "mpeg"
  | "vob" | "m4v" | "3gp" | "3g2" | "ogv" | "wmv" | "mxf"
  | "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "wma"
  | "opus" | "oga" | "aiff" | "ac3" | "alac" | "amr"
  | "mp2" | "au"
  | "md" | "html" | "rtf" | "csv" | "tsv" | "json" | "rst" | "epub" | "docx" | "odt";
```

- [ ] **Step 6: Add Tier 1 formats to `VisualFormatSelector.tsx`**

```typescript
const ALL_FORMATS = {
  image: [
    { value: 'webp' as TargetFormat, label: 'WEBP' },
    { value: 'avif' as TargetFormat, label: 'AVIF' },
    { value: 'png' as TargetFormat, label: 'PNG' },
    { value: 'jpeg' as TargetFormat, label: 'JPEG' },
    { value: 'gif' as TargetFormat, label: 'GIF' },
    { value: 'bmp' as TargetFormat, label: 'BMP' },
    { value: 'tiff' as TargetFormat, label: 'TIFF' },
    { value: 'hdr' as TargetFormat, label: 'HDR' },
    { value: 'ico' as TargetFormat, label: 'ICO' },
    { value: 'qoi' as TargetFormat, label: 'QOI' },
  ],
  // ...
};
```

- [ ] **Step 7: Update `FormatSelectorPopover.tsx`**

```typescript
const IMAGE_FORMATS = ['AVIF', 'BMP', 'GIF', 'HDR', 'ICO', 'JPEG', 'JPG', 'PNG', 'QOI', 'TIFF', 'WEBP'];
```

- [ ] **Step 8: Build and verify**

```bash
cd src-tauri && cargo build
Expected: Compiles successfully with new image crate features.
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/types/format.rs src-tauri/src/types.rs \
       src-tauri/src/converter/image.rs src-tauri/src/commands/convert.rs \
       src/types/file.ts src/components/convert/VisualFormatSelector.tsx \
       src/components/queue/FormatSelectorPopover.tsx
git commit -m "feat: add Tier 1 image format support (DDS, EXR, HDR, ICO, PNM, QOI, TGA, Farbfeld)"
```

---

### Task 3: Add HEIC/HEIF support via `libheif-rs`

**Files:**
- Create: `src-tauri/src/converter/heic.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/converter/mod.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`

- [ ] **Step 1: Add `libheif-rs` to Cargo.toml**

```toml
libheif-rs = { version = "2.7", default-features = false, features = ["embedded-libheif", "image"] }
```

Note: `embedded-libheif` compiles libheif from source; this avoids system dependency requirement. Use `features = ["image"]` for integration with the `image` crate (registers decoder hooks).

- [ ] **Step 2: Create `src-tauri/src/converter/heic.rs`**

```rust
use crate::types::ConversionSettings;
use image::{DynamicImage, ImageReader};
use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::fs::File;

/// Decode a HEIC/HEIF file into a DynamicImage for processing
pub fn decode_heic(input_path: &Path) -> Result<DynamicImage, String> {
    let lib_heif = LibHeif::new();
    let ctx = HeifContext::read_from_file(
        input_path.to_str().ok_or("Invalid path")?
    ).map_err(|e| format!("Failed to read HEIC: {}", e))?;

    let handle = ctx.primary_image_handle()
        .map_err(|e| format!("Failed to get primary image: {}", e))?;

    let image = lib_heif.decode(
        &handle,
        ColorSpace::Rgb(RgbChroma::Rgb),
        None,
    ).map_err(|e| format!("Failed to decode HEIC: {}", e))?;

    let width = image.width();
    let height = image.height();
    let planes = image.planes();
    let interleaved = planes.interleaved.ok_or("No interleaved data")?;

    DynamicImage::ImageRgb8(
        image::RgbImage::from_raw(width, height, interleaved.data.to_vec())
            .ok_or("Failed to create RGB image")?
    )
}

pub fn convert_heic(
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    _cancel_flag: &AtomicBool,
) -> Result<PathBuf, String> {
    let img = decode_heic(input_path)?;
    // Delegate to image.rs encode logic
    let format = match settings.target_format.as_str() {
        "webp" => "webp",
        "avif" => "avif",
        "jpeg" | "jpg" => "jpeg",
        "png" => "png",
        "gif" => "gif",
        "bmp" => "bmp",
        "tiff" => "tiff",
        "heic" | "heif" => "heic",
        _ => return Err(format!("Unsupported target format: {}", settings.target_format)),
    };

    if format == "heic" || format == "heif" {
        // Encode back to HEIC using libheif-rs
        let lib_heif = LibHeif::new();
        let mut context = HeifContext::new()
            .map_err(|e| format!("Failed to create HEIF context: {}", e))?;
        let mut encoder = lib_heif.encoder_for_format(
            libheif_rs::CompressionFormat::Hevc,
        ).map_err(|e| format!("Failed to create encoder: {}", e))?;
        encoder.set_quality(
            libheif_rs::EncoderQuality::Lossy(settings.quality as u8)
        ).map_err(|e| format!("Failed to set quality: {}", e))?;

        let rgba = img.into_rgba8();
        let mut heif_image = libheif_rs::Image::new(
            rgba.width(),
            rgba.height(),
            ColorSpace::Rgb(RgbChroma::Rgb),
        ).map_err(|e| format!("Failed to create HEIF image: {}", e))?;

        // Copy pixel data
        let mut planes = heif_image.planes_mut();
        if let Some(plane) = planes.interleaved {
            let data = rgba.as_raw();
            let stride = plane.stride as usize;
            for y in 0..rgba.height() as usize {
                let src_start = y * rgba.width() as usize * 4;
                let dst_start = y * stride;
                let src = &data[src_start..src_start + rgba.width() as usize * 4];
                plane.data[dst_start..dst_start + src.len()].copy_from_slice(src);
            }
        }

        context.encode_image(&heif_image, &mut encoder, None)
            .map_err(|e| format!("Failed to encode HEIF: {}", e))?;
        context.write_to_file(output_path.to_str().ok_or("Invalid output path")?)
            .map_err(|e| format!("Failed to write HEIF file: {}", e))?;
    } else {
        // Use existing image encoding logic
        // ... delegate to image.rs helpers
        img.save(output_path).map_err(|e| format!("Failed to save: {}", e))?;
    }

    Ok(output_path.to_path_buf())
}
```

- [ ] **Step 3: Register in `converter/mod.rs`**

```rust
pub mod heic;
```

- [ ] **Step 4: Add HEIC to format registry**

```rust
// In format.rs ALL_FORMATS
fmt_info!(["heic", "heif"], "HEIC", Image),
```

- [ ] **Step 5: Add dispatch in `commands/convert.rs`**

```rust
// In conversion dispatch:
if extension == "heic" || extension == "heif" {
    crate::converter::heic::convert_heic(&input_path, &output_path, settings, &cancel_flag)?
} else {
    crate::converter::image::convert_image(...)?
}
```

- [ ] **Step 6: Build and verify**

```bash
cd src-tauri && cargo build
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/converter/heic.rs \
       src-tauri/src/converter/mod.rs src-tauri/src/types/format.rs \
       src-tauri/src/commands/convert.rs
git commit -m "feat: add HEIC/HEIF support via libheif-rs"
```

---

### Task 4: Add JPEG XL support via `jxl-oxide`

**Files:**
- Create: `src-tauri/src/converter/jxl.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/converter/mod.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`

- [ ] **Step 1: Add `jxl-oxide` to Cargo.toml**

```toml
jxl-oxide = { version = "0.12", features = ["image"] }
```

- [ ] **Step 2: Create `src-tauri/src/converter/jxl.rs`**

```rust
use crate::types::ConversionSettings;
use image::{DynamicImage, ImageBuffer, Rgba};
use jxl_oxide::JxlImage;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

pub fn decode_jxl(input_path: &Path) -> Result<DynamicImage, String> {
    let data = std::fs::read(input_path)
        .map_err(|e| format!("Failed to read JXL file: {}", e))?;

    let image = JxlImage::from_reader(&data[..])
        .map_err(|e| format!("Failed to parse JXL: {}", e))?;

    let width = image.width() as u32;
    let height = image.height() as u32;

    // Render to RGBA
    let render = image.render_frame(0)
        .map_err(|e| format!("Failed to render JXL frame: {}", e))?;

    let mut rgba_data = Vec::with_capacity((width * height * 4) as usize);
    for y in 0..height {
        for x in 0..width {
            let p = render.pixel(x, y);
            rgba_data.push(p.r());
            rgba_data.push(p.g());
            rgba_data.push(p.b());
            rgba_data.push(p.a());
        }
    }

    ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, rgba_data)
        .map(DynamicImage::ImageRgba8)
        .ok_or("Failed to create image buffer from JXL data".to_string())
}

pub fn convert_jxl(
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    _cancel_flag: &AtomicBool,
) -> Result<PathBuf, String> {
    let img = decode_jxl(input_path)?;
    // Encode to target format using image crate
    img.save(output_path)
        .map_err(|e| format!("Failed to save output: {}", e))?;
    Ok(output_path.to_path_buf())
}
```

- [ ] **Step 3: Register in `converter/mod.rs` and format registry, add dispatch in `convert.rs`**

```rust
// format.rs
fmt_info!(["jxl"], "JPEG XL", Image),
```

- [ ] **Step 4: Build and verify**

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/converter/jxl.rs src-tauri/src/converter/mod.rs
git commit -m "feat: add JPEG XL support via jxl-oxide"
```

---

### Task 5: Add SVG support via `resvg`

**Files:**
- Create: `src-tauri/src/converter/svg.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/converter/mod.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`

- [ ] **Step 1: Add `resvg` to Cargo.toml**

```toml
resvg = "0.47"
usvg = "0.47"
```

- [ ] **Step 2: Create `src-tauri/src/converter/svg.rs`**

```rust
use crate::types::ConversionSettings;
use image::DynamicImage;
use resvg::render;
use usvg::Tree;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

pub fn decode_svg(input_path: &Path) -> Result<DynamicImage, String> {
    let svg_data = std::fs::read(input_path)
        .map_err(|e| format!("Failed to read SVG file: {}", e))?;

    let tree = Tree::from_data(&svg_data, &usvg::Options::default())
        .map_err(|e| format!("Failed to parse SVG: {}", e))?;

    let pixmap_size = tree.size.to_int_size();
    let mut pixmap = tiny_skia::Pixmap::new(pixmap_size.width(), pixmap_size.height())
        .ok_or("Failed to create pixmap")?;

    render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());

    let rgba_data = pixmap.data().to_vec();
    DynamicImage::ImageRgba8(
        image::ImageBuffer::from_raw(
            pixmap_size.width(),
            pixmap_size.height(),
            rgba_data,
        ).ok_or("Failed to create image buffer")?
    )
}

pub fn convert_svg(
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    _cancel_flag: &AtomicBool,
) -> Result<PathBuf, String> {
    let img = decode_svg(input_path)?;
    img.save(output_path)
        .map_err(|e| format!("Failed to save output: {}", e))?;
    Ok(output_path.to_path_buf())
}
```

- [ ] **Step 3: Register**

```rust
// format.rs
fmt_info!(["svg", "svgz"], "SVG", Image),
```

- [ ] **Step 4: Build and verify**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add SVG rasterization support via resvg"
```

---

### Task 6: Add Camera RAW support via `rawloader`

**Files:**
- Create: `src-tauri/src/converter/raw.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/converter/mod.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`

- [ ] **Step 1: Add `rawloader` to Cargo.toml**

```toml
rawloader = "0.37"
```

- [ ] **Step 2: Create `src-tauri/src/converter/raw.rs`**

```rust
use crate::types::ConversionSettings;
use image::{DynamicImage, ImageBuffer, Rgb};
use rawloader::{decode_file, RawImageData};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

pub fn decode_raw(input_path: &Path) -> Result<DynamicImage, String> {
    let raw = decode_file(input_path)
        .map_err(|e| format!("Failed to decode RAW: {}", e))?;

    // rawloader outputs raw Bayer data — we do a simple bilinear demosaic
    // For production, consider using zenraw which has proper demosaic
    match raw.data {
        RawImageData::Integer(data) => {
            let width = raw.width as usize;
            let height = raw.height as usize;
            let max_val = (1u64 << raw.bit_depth) - 1;
            let scale = |v: u16| -> u8 { (v as f64 / max_val as f64 * 255.0) as u8 };

            let mut rgb_data = Vec::with_capacity(width * height * 3);
            
            let get_val = |px: usize, py: usize| -> u16 {
                let px = px.min(width - 1);
                let py = py.min(height - 1);
                data[py * width + px]
            };

            for y in 0..height {
                for x in 0..width {
                    let (r_val, g_val, b_val) = match (y % 2, x % 2) {
                        (0, 0) => {
                            let r = get_val(x, y);
                            let g = (get_val(x + 1, y) + get_val(x, y + 1)) / 2;
                            let b = get_val(x + 1, y + 1);
                            (r, g, b)
                        }
                        (0, 1) => {
                            let r = (get_val(x - 1, y) + get_val(x + 1, y)) / 2;
                            let g = get_val(x, y);
                            let b = get_val(x, y + 1);
                            (r, g, b)
                        }
                        (1, 0) => {
                            let r = (get_val(x, y - 1) + get_val(x, y + 1)) / 2;
                            let g = get_val(x, y);
                            let b = get_val(x + 1, y);
                            (r, g, b)
                        }
                        (1, 1) | _ => {
                            let r = get_val(x - 1, y - 1);
                            let g = (get_val(x - 1, y) + get_val(x, y - 1)) / 2;
                            let b = get_val(x, y);
                            (r, g, b)
                        }
                    };

                    rgb_data.push(scale(r_val));
                    rgb_data.push(scale(g_val));
                    rgb_data.push(scale(b_val));
                }
            }

            ImageBuffer::<Rgb<u8>, _>::from_raw(width as u32, height as u32, rgb_data)
                .map(DynamicImage::ImageRgb8)
                .ok_or("Failed to create RGB image".to_string())
        }
        RawImageData::Float(_) => Err("Float RAW data not yet supported".to_string()),
    }
}

pub fn convert_raw(
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    _cancel_flag: &AtomicBool,
) -> Result<PathBuf, String> {
    let img = decode_raw(input_path)?;
    img.save(output_path)
        .map_err(|e| format!("Failed to save output: {}", e))?;
    Ok(output_path.to_path_buf())
}
```

- [ ] **Step 3: Register in format registry**

```rust
pub static IMAGE_EXTENSIONS: &[&str] = &[
    // ... existing ...
    "nef", "nrw", "cr2", "crw", "cr3", "arw", "srf", "sr2",
    "orf", "raf", "rw2", "dng", "pef", "mrw", "mef",
    "srw", "erf", "kdc", "dcs", "dcr", "3fr", "iiq", "mos", "ari",
];
```

Note: RAW formats are decode-only — they serve as input sources for conversion to standard formats.

- [ ] **Step 4: Build and verify**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add camera RAW format support (NEF, CR2, ARW, RAF, DNG, etc.)"
```

---

### Task 7: Expand media formats via FFmpeg — Audio

**Files:**
- Modify: `src-tauri/src/converter/media.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`
- Modify: `src/types/file.ts`
- Modify: `src/components/convert/VisualFormatSelector.tsx`
- Modify: `src/components/queue/FormatSelectorPopover.tsx`

- [ ] **Step 1: Add extensions to format registry**

```rust
pub static AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma",
    "opus", "oga", "aiff", "aifc", "aif", "ac3", "alac",
    "amr", "mp1", "mp2", "mpc", "au",
];
```

- [ ] **Step 2: Update audio codec/container mapping in `media.rs`**

```rust
// In the convert_media function, map target format to FFmpeg codec:
fn get_audio_codec(target_format: &str) -> &str {
    match target_format {
        "mp3" => "libmp3lame",
        "aac" => "aac",
        "ogg" | "oga" => "libvorbis",
        "opus" => "libopus",
        "wav" => "pcm_s16le",
        "flac" => "flac",
        "wma" => "wmav2",
        "m4a" | "alac" => "alac",
        "ac3" => "ac3",
        "aiff" | "aifc" | "aif" => "pcm_s16be",
        "amr" => "amr_nb",
        "mp1" => "mp1",
        "mp2" => "mp2",
        "au" => "pcm_mulaw",
        _ => "copy",
    }
}

fn get_audio_container(target_format: &str) -> &str {
    match target_format {
        "mp3" => "mp3",
        "aac" => "adts",
        "ogg" | "oga" => "ogg",
        "opus" => "opus",  // native Ogg Opus muxer
        "wav" => "wav",
        "flac" => "flac",
        "wma" => "asf",
        "m4a" | "alac" => "ipod",  // MP4 container with ALAC
        "ac3" => "ac3",
        "aiff" | "aifc" | "aif" => "aiff",
        "amr" => "amr",
        "mp1" | "mp2" => "mp2",  // MPEG-1 Audio muxer
        "au" => "au",
        _ => "matroska",
    }
}
```

- [ ] **Step 3: Update `convert.rs` extension mapping**

```rust
"opus" => "opus",
"oga" => "oga",
"aiff" | "aifc" | "aif" => "aiff",
"ac3" => "ac3",
"alac" => "m4a",
"amr" => "amr",
"mp1" => "mp1",
"mp2" => "mp2",
"au" => "au",
```

- [ ] **Step 4: Update FFmpeg command construction for new audio containers**

In `media.rs`, the FFmpeg command is built around `-f {container}` flag. Ensure that the new formats set the correct container name. For example:
- `opus` → `-f opus` (writes raw Opus in Ogg)
- `oga` → `-f ogg`
- `aiff` → `-f aiff`
- `ac3` → `-f ac3`
- `amr` → `-f amr`
- `mp2` → `-f mp2`
- `au` → `-f au`

- [ ] **Step 5: Update frontend**

```typescript
// file.ts
export const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma',
  'opus', 'oga', 'aiff', 'aifc', 'aif', 'ac3', 'alac',
  'amr', 'mp1', 'mp2', 'au',
];
```

```typescript
// VisualFormatSelector.tsx
audio: [
  { value: 'mp3' as TargetFormat, label: 'MP3' },
  { value: 'flac' as TargetFormat, label: 'FLAC' },
  { value: 'wav' as TargetFormat, label: 'WAV' },
  { value: 'aac' as TargetFormat, label: 'AAC' },
  { value: 'ogg' as TargetFormat, label: 'OGG' },
  { value: 'm4a' as TargetFormat, label: 'M4A' },
  { value: 'wma' as TargetFormat, label: 'WMA' },
  { value: 'opus' as TargetFormat, label: 'OPUS' },
  { value: 'aiff' as TargetFormat, label: 'AIFF' },
  { value: 'ac3' as TargetFormat, label: 'AC3' },
  { value: 'alac' as TargetFormat, label: 'ALAC' },
  { value: 'amr' as TargetFormat, label: 'AMR' },
  { value: 'mp2' as TargetFormat, label: 'MP2' },
  { value: 'au' as TargetFormat, label: 'AU' },
],
```

- [ ] **Step 6: Build and verify test conversion**

```bash
cd src-tauri && cargo build
# Test: ffmpeg -f lavfi -i "sine=frequency=440:duration=5" -acodec libopus output.opus
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add audio format support (OPUS, AIFF, AC3, ALAC, AMR, MP2, AU)"
```

---

### Task 8: Expand media formats via FFmpeg — Video

**Files:**
- Modify: `src-tauri/src/converter/media.rs`
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/convert.rs`
- Modify: `src/types/file.ts`
- Modify: `src/components/convert/VisualFormatSelector.tsx`
- Modify: `src/components/queue/FormatSelectorPopover.tsx`

- [ ] **Step 1: Add extensions to format registry**

```rust
pub static VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "webm", "mkv", "mov", "avi",
    "flv", "f4v", "ts", "mts", "m2ts", "mpg", "mpeg",
    "vob", "m4v", "3gp", "3g2", "ogv", "wmv", "mxf",
];
```

- [ ] **Step 2: Update video codec/container mapping in `media.rs`**

```rust
// Container format to FFmpeg format name:
fn get_video_container(target_format: &str) -> &str {
    match target_format {
        "mp4" | "mp4-hevc" | "m4v" => "mp4",
        "webm" => "webm",
        "mkv" => "matroska",
        "mov" => "mov",
        "avi" => "avi",
        "flv" | "f4v" => "flv",
        "ts" | "mts" | "m2ts" => "mpegts",
        "mpg" | "mpeg" | "vob" => "mpeg2vob",
        "3gp" => "3gp",
        "3g2" => "3g2",
        "ogv" => "ogg",
        "wmv" => "asf",
        "mxf" => "mxf",
        _ => "matroska",
    }
}
```

- [ ] **Step 3: Add video encoder mappings in `media.rs`**

For formats that use H.264 (most modern formats):
```rust
fn get_video_encoder_for_container(container: &str, hw_accel: &str) -> &str {
    // Most containers use H.264 by default
    match container {
        "flv" | "f4v" => "libx264",  // FLV uses H.264 or Sorenson Spark
        "mpegts" => "libx264",        // H.264 in MPEG-TS
        "mpeg2vob" => "mpeg2video",   // MPEG-2 for VOB compatibility
        "asf" => "wmv2",              // WMV2 for WMV/ASF
        "3gp" | "3g2" => "libx264",   // H.264 for 3GP
        "mxf" => "libx264",           // H.264 for MXF
        _ => match settings.hw_accel.as_deref() { ... }, // existing logic
    }
}
```

- [ ] **Step 4: Update `convert.rs` extension mapping**

```rust
"flv" => "flv",
"f4v" => "flv",
"ts" => "ts",
"mts" | "m2ts" => "mts",
"mpg" | "mpeg" => "mpg",
"vob" => "vob",
"m4v" => "m4v",
"3gp" => "3gp",
"3g2" => "3g2",
"ogv" => "ogv",
"wmv" => "wmv",
"mxf" => "mxf",
```

- [ ] **Step 5: Update frontend**

```typescript
// file.ts
export const VIDEO_EXTENSIONS = [
  'mp4', 'mov', 'webm', 'avi', 'mkv',
  'flv', 'f4v', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg',
  'vob', 'm4v', '3gp', '3g2', 'ogv', 'wmv', 'mxf',
];

// VisualFormatSelector.tsx
video: [
  { value: 'mp4' as TargetFormat, label: 'MP4' },
  { value: 'webm' as TargetFormat, label: 'WEBM' },
  { value: 'avi' as TargetFormat, label: 'AVI' },
  { value: 'mkv' as TargetFormat, label: 'MKV' },
  { value: 'mov' as TargetFormat, label: 'MOV' },
  { value: 'flv' as TargetFormat, label: 'FLV' },
  { value: 'ts' as TargetFormat, label: 'TS' },
  { value: 'mpg' as TargetFormat, label: 'MPG' },
  { value: 'vob' as TargetFormat, label: 'VOB' },
  { value: 'm4v' as TargetFormat, label: 'M4V' },
  { value: '3gp' as TargetFormat, label: '3GP' },
  { value: 'ogv' as TargetFormat, label: 'OGV' },
  { value: 'wmv' as TargetFormat, label: 'WMV' },
  { value: 'mxf' as TargetFormat, label: 'MXF' },
],
```

- [ ] **Step 6: Build and verify**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add video format support (FLV, TS, MTS, MPG, VOB, M4V, 3GP, OGV, WMV, MXF)"
```

---

### Task 9: Implement document conversion

**Files:**
- Create: `src-tauri/src/converter/document.rs`
- Modify: `docs/format-expansion-plan.md` (document system dependency)
- Modify: `src-tauri/src/converter/mod.rs`
- Modify: `src-tauri/src/types.rs` (add `MediaType::Document`)
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/commands/convert.rs`
- Modify: `src/types/file.ts`
- Modify: `src/components/convert/VisualFormatSelector.tsx`
- Modify: `src/components/queue/FormatSelectorPopover.tsx`

- [ ] **Step 1: Document `pandoc` system binary dependency**

Ensure that the `pandoc` command-line binary is installed on the host system (e.g. `apt install pandoc` or `brew install pandoc`). No new Cargo crates are required.

- [ ] **Step 2: Extend `MediaType` enum in `types.rs`**

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum MediaType {
    Image,
    Video,
    Audio,
    Document,
    Unknown,
}
```

- [ ] **Step 3: Add document extensions to format registry**

```rust
pub static DOCUMENT_EXTENSIONS: &[&str] = &[
    "docx", "doc", "md", "html", "htm", "rtf",
    "csv", "tsv", "json", "rst", "epub", "odt",
    "docbook",
];
```

- [ ] **Step 3.1: Add format entries**

```rust
fmt_info!(["docx", "doc"], "Word", Document),
fmt_info!(["md", "markdown"], "Markdown", Document),
fmt_info!(["html", "htm"], "HTML", Document),
fmt_info!(["rtf"], "RTF", Document),
fmt_info!(["csv"], "CSV", Document),
fmt_info!(["tsv"], "TSV", Document),
fmt_info!(["json"], "JSON", Document),
fmt_info!(["rst"], "RST", Document),
fmt_info!(["epub"], "EPUB", Document),
fmt_info!(["odt"], "ODT", Document),
fmt_info!(["docbook"], "Docbook", Document),
```

- [ ] **Step 4: Create `src-tauri/src/converter/document.rs`**

```rust
use crate::types::ConversionSettings;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::process::Command;

pub fn convert_document(
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
) -> Result<PathBuf, String> {
    let input_str = input_path.to_str().ok_or("Invalid input path")?;
    let output_str = output_path.to_str().ok_or("Invalid output path")?;

    // Use pandoc for document conversion
    let mut cmd = Command::new("pandoc");
    cmd.arg(input_str)
       .arg("-o")
       .arg(output_str)
       .arg("--from")
       .arg(detect_input_format(input_path))
       .arg("--to")
       .arg(detect_output_format(&settings.target_format));

    // Add quality/meta options
    if settings.strip_metadata {
        cmd.arg("--standalone");
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute pandoc: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pandoc conversion failed: {}", stderr));
    }

    Ok(output_path.to_path_buf())
}

fn detect_input_format(path: &Path) -> String {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "docx" => "docx",
        "doc" => "doc",
        "md" | "markdown" => "markdown",
        "html" | "htm" => "html",
        "rtf" => "rtf",
        "csv" => "csv",
        "tsv" => "tsv",
        "json" => "json",
        "rst" => "rst",
        "epub" => "epub",
        "odt" => "odt",
        "docbook" => "docbook",
        _ => "markdown",
    }.to_string()
}

fn detect_output_format(target: &str) -> String {
    match target {
        "md" | "markdown" => "markdown",
        "html" => "html",
        "rtf" => "rtf",
        "csv" => "csv",
        "tsv" => "tsv",
        "json" => "json",
        "rst" => "rst",
        "epub" => "epub",
        "docx" => "docx",
        "odt" => "odt",
        "docbook" => "docbook",
        _ => "markdown",
    }.to_string()
}
```

- [ ] **Step 5: Update `files.rs` to handle documents**

```rust
// In the media_type discrimination:
} else if crate::types::DOCUMENT_EXTENSIONS.contains(&extension.as_str()) {
    MediaType::Document
}
```

- [ ] **Step 6: Update `convert.rs` to dispatch documents**

```rust
// In the conversion dispatch:
MediaType::Document => {
    crate::converter::document::convert_document(
        &input_path, &output_path, settings
    )?
}
```

- [ ] **Step 7: Update frontend**

```typescript
// file.ts
export type MediaType = "Image" | "Video" | "Audio" | "Document" | "Unknown";

export const DOCUMENT_EXTENSIONS = [
  'docx', 'doc', 'md', 'html', 'htm', 'rtf',
  'csv', 'tsv', 'json', 'rst', 'epub', 'odt',
  'docbook',
];
```

- [ ] **Step 8: Add document UI in `VisualFormatSelector.tsx`**

```typescript
const ALL_FORMATS = {
  // ... image, video, audio ...
  document: [
    { value: 'md' as TargetFormat, label: 'MD' },
    { value: 'html' as TargetFormat, label: 'HTML' },
    { value: 'rtf' as TargetFormat, label: 'RTF' },
    { value: 'csv' as TargetFormat, label: 'CSV' },
    { value: 'tsv' as TargetFormat, label: 'TSV' },
    { value: 'json' as TargetFormat, label: 'JSON' },
    { value: 'rst' as TargetFormat, label: 'RST' },
    { value: 'epub' as TargetFormat, label: 'EPUB' },
    { value: 'docx' as TargetFormat, label: 'DOCX' },
    { value: 'odt' as TargetFormat, label: 'ODT' },
  ],
};
```

- [ ] **Step 9: Add document support to popover**

```typescript
// FormatSelectorPopover.tsx
const DOCUMENT_FORMATS = ['MD', 'HTML', 'RTF', 'CSV', 'TSV', 'JSON', 'RST', 'EPUB', 'DOCX', 'ODT'];
```

- [ ] **Step 10: Add document filter to file dialog**

```typescript
// SplitPane.tsx handleBrowse:
const DOCUMENT_FILTER = DOCUMENT_EXTENSIONS.map(e => `.${e}`).join(',');
const ALL_FILTER = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...DOCUMENT_EXTENSIONS]
  .map(e => `.${e}`).join(',');
```

- [ ] **Step 11: Build and verify**

```bash
cd src-tauri && cargo build
# Verify pandoc is available: pandoc --version
```

- [ ] **Step 12: Commit**

```bash
git commit -m "feat: add document conversion support via pandoc"
```

---

### Task 10: Niche/low-priority formats (Tier 4)

**Files:**
- Modify: `src-tauri/src/types/format.rs`
- Modify: `src-tauri/src/converter/media.rs` (for RM/RMVB, H.264/H.265, DIVX)
- Modify: `src/types/file.ts`

- [ ] **Step 1: Add niche formats to registry**

```rust
// Image
fmt_info!(["icns"], "ICNS", Image),    // decode-only (no rust crate, would need bespoke)
// Audio
decode!(["dsd", "dsf", "dff"], "DSD", Audio),  // via FFmpeg
// Video
fmt_info!(["rm", "rmvb"], "RealMedia", Video),  // via FFmpeg
decode!(["h264", "264"], "H.264", Video),       // raw H.264 stream
decode!(["h265", "hevc", "265"], "H.265", Video), // raw H.265 stream
fmt_info!(["divx"], "DIVX", Video),             // via FFmpeg (same as AVI/MP4)
fmt_info!(["swf"], "SWF", Video),               // via FFmpeg
```

- [ ] **Step 2: Add encoder mappings**

```rust
// In media.rs:
"rm" | "rmvb" => "rv40",     // RealVideo 4
"h264" | "264" => "libx264", // Raw H.264
"h265" | "hevc" | "265" => "libx265", // Raw H.265
"divx" => "mpeg4",           // DivX = MPEG-4 Part 2
"swf" => "flashsv",          // Flash Screen Video
```

- [ ] **Step 3: Build and commit**

```bash
git commit -m "feat: add niche format support (ICNS, DSD, RM, H.264, H.265, DIVX, SWF)"
```

---

### Task 11: Update metadata extraction for new formats

**Files:**
- Modify: `src-tauri/src/metadata/image.rs`

- [ ] **Step 1: Extend image metadata extraction to handle new decoders**

```rust
pub fn extract_image_metadata(path: &Path, extension: &str) -> FileMetadata {
    let mut metadata = FileMetadata {
        format: extension.to_string(),
        codec: Some(extension.to_string()),
        ..Default::default()
    };

    // Try image crate first
    if let Ok(reader) = ImageReader::open(path) {
        if let Ok(dimensions) = reader.into_dimensions() {
            metadata.width = Some(dimensions.0);
            metadata.height = Some(dimensions.1);
            metadata.has_metadata = true;
            return metadata;
        }
    }

    // Fall back to HEIC decoder
    if matches!(extension, "heic" | "heif") {
        if let Ok(lib_heif) = LibHeif::new() {
            if let Ok(ctx) = HeifContext::read_from_file(path.to_str().unwrap_or("")) {
                if let Ok(handle) = ctx.primary_image_handle() {
                    metadata.width = Some(handle.width());
                    metadata.height = Some(handle.height());
                    metadata.has_metadata = true;
                }
            }
        }
    }

    // Fall back to RAW decoder
    if matches!(extension, "nef" | "cr2" | "arw" | "dng" | /* etc */) {
        if let Ok(raw) = rawloader::decode_file(path) {
            metadata.width = Some(raw.width);
            metadata.height = Some(raw.height);
            metadata.bit_depth = Some(raw.bit_depth as u8);
            metadata.has_metadata = true;
        }
    }

    metadata
}
```

- [ ] **Step 2: Add document metadata extraction in `files.rs`**

```rust
MediaType::Document => {
    // Document metadata: file size, page count (via pandoc if available)
    FileMetadata {
        format: extension.to_string(),
        ..Default::default()
    }
}
```

- [ ] **Step 3: Build and commit**

---

### Task 12: Update `estimate_duration_ms` for new formats

**Files:**
- Modify: `src-tauri/src/commands/convert.rs`

- [ ] **Step 1: Add duration estimates**

```rust
fn estimate_duration_ms(format: &str, _resolution: Option<(u32, u32)>, speed: Option<&str>) -> f64 {
    let rate_ms = match format.to_lowercase().as_str() {
        // Existing
        "avif" => match speed { Some("ultrafast") => 200.0, Some("veryslow") => 4000.0, _ => 900.0 },
        "webp" => 50.0,
        "png" => 100.0,
        "jpeg" | "jpg" => 30.0,
        "gif" => 150.0,
        // New image formats
        "hdr" => 40.0,
        "ico" => 30.0,
        "qoi" => 20.0,
        "pnm" => 25.0,
        "bmp" => 20.0,
        "tiff" => 60.0,
        // HEIC/HEIF
        "heic" | "heif" => 500.0,
        // Audio (FFmpeg-based - fast)
        "mp3" | "aac" | "ogg" | "opus" | "wav" => 10.0,
        "flac" | "alac" => 20.0,
        "wma" | "ac3" => 15.0,
        // Video (FFmpeg-based - depends on resolution and codec)
        "mp4" => 50.0,
        "webm" => 80.0,
        "avi" | "mkv" | "mov" => 50.0,
        "flv" | "f4v" => 40.0,
        "wmv" => 60.0,
        "mpg" | "mpeg" | "vob" => 30.0,
        "mxf" => 100.0,
        // Documents (pandoc - fast)
        "md" | "html" | "rtf" | "csv" | "json" | "rst" => 5.0,
        "docx" | "odt" | "epub" | "docbook" => 15.0,
        _ => 40.0,
    };
    rate_ms
}
```

- [ ] **Step 2: Build and commit**

---

## Cross-cutting Concerns

### Build time impact
- Adding `image` crate features has minimal build impact (most are pure Rust)
- `libheif-rs` with `embedded-libheif` significantly increases build time (compiles C libheif from source) — expect 2-5 minutes added
- `jxl-oxide` is pure Rust, moderate build impact (~30s)
- `resvg` is pure Rust, moderate build impact (~30s)
- `rawloader` is pure Rust with minimal deps

### Binary size impact
- Current binary: ~20-30MB
- Expected growth: +5-10MB for all new backends
- `embedded-libheif` is the largest contributor (~3-5MB)

### Testing strategy
- Per-format unit tests: verify decode + re-encode roundtrip on sample files
- Integration test: drop 1 file of each format, verify it appears in queue
- E2E: convert each format to every other format in same category
- Edge cases: empty files, corrupt files, very large files

### Performance considerations
- Camera RAW decoding is slow (rawloader does CPU-intensive demosaic) — consider adding progress reporting
- HEIC encoding via libheif is also CPU-intensive
- SVG rasterization is fast for typical SVGs but can be slow for complex ones
- Consider adding format-specific concurrency limits

### UI/UX updates needed
- The `MediaType` selector tabs should now include "Documents"
- Format dropdown should show documents section
- Document settings panel may need different options (page range, CSS for HTML, etc.)
- File dialog filters should include documents
- History panel should display document conversions

---

## Final Verification

- [ ] Run `cd src-tauri && cargo build` - verify compilation
- [ ] Run `cd src && npm run typecheck` - verify TypeScript types
- [ ] Run `cd src && npm run test` - verify existing tests pass
- [ ] Manual test: drop one file of each new format, verify it's detected
- [ ] Manual test: convert each format to at least one target format
- [ ] Verify `ffmpeg -encoders` includes all expected encoders
- [ ] Verify pandoc is available: `pandoc --version`
- [ ] Check edge cases: 0-byte files, files without extensions, nested directories
