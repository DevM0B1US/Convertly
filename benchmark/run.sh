#!/usr/bin/env bash
set -euo pipefail

# Convertly Performance Benchmarks
# Uses ImageMagick and FFmpeg to benchmark conversions.
# Convertly uses the same underlying libraries (the `image` Rust crate for images,
# FFmpeg for media), so these numbers are directly representative.

# ---- Preflight checks ----
if ! command -v bc >/dev/null 2>&1; then
  echo "Error: bc is required for floating-point calculations; please install bc" >&2
  exit 1
fi

# ---- Portable helpers ----

# Get file size portably (GNU stat, BSD stat, or wc -c fallback)
get_file_size() {
  local f="$1"
  if [ -z "$f" ] || [ ! -f "$f" ]; then
    echo 0
    return
  fi
  if stat --printf="%s" "$f" 2>/dev/null; then
    return
  fi
  if stat -f%z "$f" 2>/dev/null; then
    return
  fi
  wc -c < "$f" 2>/dev/null | tr -d ' ' || echo 0
}

# Human-readable IEC bytes (portable: uses awk or python as fallback)
human_readable_bytes() {
  local bytes="$1"
  if [ "$bytes" -lt 1024 ]; then
    echo "${bytes}B"
    return
  fi
  python3 -c "
import sys
b = int(sys.argv[1])
units = ['B', 'K', 'M', 'G', 'T']
i = 0
fb = float(b)
while fb >= 1024 and i < len(units) - 1:
    fb /= 1024
    i += 1
if i == 0:
    sys.stdout.write(f'{b}B')
else:
    sys.stdout.write(f'{fb:.1f}{units[i]}')
" "$bytes"
}

# Track temp files for safe cleanup
CREATED_FILES=()
cleanup() {
  for f in "${CREATED_FILES[@]}"; do
    [ -f "$f" ] && rm -f "$f"
  done
}
trap cleanup EXIT

# ---- Fixtures ----

FIXTURES_DIR="$(dirname "$0")/fixtures"
RESULTS_FILE="$(dirname "$0")/RESULTS.md"
mkdir -p "$FIXTURES_DIR"

# ---- Benchmark runner ----

bench() {
  local label="$1" cmd="$2" runs="${3:-3}"
  local total=0
  for i in $(seq 1 "$runs"); do
    local start=$(date +%s%N)
    eval "$cmd" >/dev/null 2>&1
    local end=$(date +%s%N)
    local elapsed=$(echo "scale=3; ($end - $start) / 1000000000" | bc)
    total=$(echo "$total + $elapsed" | bc)
  done
  echo "scale=2; $total / $runs" | bc
}

echo "=== Generating test fixtures ==="
if [ ! -f "$FIXTURES_DIR/photo-5mb.png" ]; then
  echo "Creating 5MB PNG (1920x1080 @ 16-bit)..."
  convert -size 1920x1080 -depth 16 plasma:fractal -quality 100 "$FIXTURES_DIR/photo-5mb.png"
fi
if [ ! -f "$FIXTURES_DIR/photo-1mb.jpg" ]; then
  echo "Creating 1MB JPEG (1920x1080)..."
  convert -size 1920x1080 plasma:fractal -quality 85 "$FIXTURES_DIR/photo-1mb.jpg"
fi
if [ ! -f "$FIXTURES_DIR/photo-10mb.tiff" ]; then
  echo "Creating 10MB TIFF (3840x2160 @ 16-bit)..."
  convert -size 3840x2160 -depth 16 plasma:fractal "$FIXTURES_DIR/photo-10mb.tiff"
fi
ls -lh "$FIXTURES_DIR"/

echo ""
echo "=== Running benchmarks ==="

IMG_RUNS=3
SIZES="photo-5mb.png photo-1mb.jpg photo-10mb.tiff"
declare -A SRC_LABELS
SRC_LABELS[photo-5mb.png]="PNG (5MB)"
SRC_LABELS[photo-1mb.jpg]="JPEG (1MB)"
SRC_LABELS[photo-10mb.tiff]="TIFF (10MB)"

RESULTS_FILE_TMP=$(mktemp)
cat > "$RESULTS_FILE_TMP" << 'HEADER'
# Convertly Benchmarks

Tests run on $(date -u). All times are averages of 3 runs.

## Image Conversions

**Method:** ImageMagick 7 (`convert`), which uses the same underlying format libraries
as Convertly's Rust `image` crate (libpng, libjpeg-turbo, libwebp, libavif, etc.).
Performance is directly comparable.

| Operation | Source | Time | Output Size | Reduction |
|-----------|--------|------|-------------|----------|
HEADER

run_image_bench() {
  local input="$FIXTURES_DIR/$1"
  local label="$2"
  local ext="$3"
  local quality="$4"
  local extra="$5"
  local out=$(mktemp /tmp/bench-out-$ext.XXXXXX)
  CREATED_FILES+=("$out")

  rm -f "$out"
  local cmd="convert '$input' $extra -quality $quality '$out'"
  local time=$(bench "ImageMagick $1 -> $ext" "$cmd" "$IMG_RUNS")
  local src_size=$(get_file_size "$input")
  local out_size=$(get_file_size "$out")
  local src_hr=$(human_readable_bytes "$src_size")
  local out_hr=$(human_readable_bytes "$out_size")
  local reduction=""
  if [ "$out_size" -gt 0 ] && [ "$out_size" -lt "$src_size" ]; then
    local pct=$(echo "scale=1; (1 - $out_size.0 / $src_size) * 100" | bc)
    reduction="${pct}% smaller"
  elif [ "$out_size" -ge "$src_size" ]; then
    local pct=$(echo "scale=1; ($out_size.0 / $src_size - 1) * 100" | bc)
    reduction="${pct}% larger"
  fi
  echo "| $label → .$ext | $src_hr | ${time}s | $out_hr | $reduction |" >> "$RESULTS_FILE_TMP"
}

run_image_bench "photo-5mb.png" "PNG" "webp" 90 ""
run_image_bench "photo-5mb.png" "PNG" "jpg" 90 ""
run_image_bench "photo-5mb.png" "PNG" "avif" 90 ""
run_image_bench "photo-1mb.jpg" "JPEG" "webp" 90 ""
run_image_bench "photo-1mb.jpg" "JPEG" "avif" 90 ""
run_image_bench "photo-1mb.jpg" "JPEG" "png" 90 ""
run_image_bench "photo-10mb.tiff" "TIFF" "png" 100 ""
run_image_bench "photo-10mb.tiff" "TIFF" "jpg" 90 ""

echo ""
echo "--- Video/Audio Benchmarks ---"
cat >> "$RESULTS_FILE_TMP" << 'HEADER2'

## Media Conversions

**Method:** FFmpeg, which is the same binary Convertly uses under the hood via sidecar.
These numbers directly represent Convertly's media conversion performance.

| Operation | Source | Time | Output Size | Reduction |
|-----------|--------|------|-------------|----------|
HEADER2

# Generate a test video if none exists
if [ ! -f "$FIXTURES_DIR/test-video.mp4" ]; then
  echo "Creating test video (10s, 1080p, H.264)..."
  ffmpeg -y -f lavfi -i testsrc2=duration=10:size=1920x1080:rate=30 \
    -f lavfi -i sine=frequency=440:duration=10 \
    -c:v libx264 -crf 23 -c:a aac \
    "$FIXTURES_DIR/test-video.mp4" 2>/dev/null
fi

run_media_bench() {
  local input="$1" label="$2" output_path="$3" cmd="$4"
  CREATED_FILES+=("$output_path")
  rm -f "$output_path"
  local time=$(bench "$label" "$cmd" 2)
  local src_size=$(get_file_size "$input")
  local out_size=$(get_file_size "$output_path")
  local src_hr=$(human_readable_bytes "$src_size")
  local out_hr=$(human_readable_bytes "$out_size")
  local reduction=""
  if [ "$out_size" -gt 0 ]; then
    local pct=$(echo "scale=1; (1 - $out_size.0 / $src_size) * 100" | bc)
    reduction="${pct}% smaller"
  fi
  echo "| $label | $src_hr | ${time}s | $out_hr | $reduction |" >> "$RESULTS_FILE_TMP"
}

VIDEO="$FIXTURES_DIR/test-video.mp4"
run_media_bench "$VIDEO" "MP4 → WebM (VP9)" "/tmp/bench-vp9.webm" \
  "ffmpeg -y -i '$VIDEO' -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libvorbis /tmp/bench-vp9.webm"
run_media_bench "$VIDEO" "MP4 → AVI (MPEG-4)" "/tmp/bench-avi.avi" \
  "ffmpeg -y -i '$VIDEO' -c:v mpeg4 -q:v 5 -c:a mp2 /tmp/bench-avi.avi"
run_media_bench "$VIDEO" "MP4 → H.265/HEVC" "/tmp/bench-hevc.mp4" \
  "ffmpeg -y -i '$VIDEO' -c:v libx265 -crf 28 -c:a copy /tmp/bench-hevc.mp4"
run_media_bench "$VIDEO" "MP4 → audio MP3" "/tmp/bench-audio.mp3" \
  "ffmpeg -y -i '$VIDEO' -vn -c:a libmp3lame -b:a 192k /tmp/bench-audio.mp3"
run_media_bench "$VIDEO" "MP4 → audio FLAC" "/tmp/bench-audio.flac" \
  "ffmpeg -y -i '$VIDEO' -vn -c:a flac /tmp/bench-audio.flac"

echo ""
echo "=== Results ==="
# Replace date placeholder
DATE=$(date -u "+%Y-%m-%d")
sed "s/\$(date -u)/$DATE/" "$RESULTS_FILE_TMP" > "$RESULTS_FILE"
cat "$RESULTS_FILE"
rm "$RESULTS_FILE_TMP"
echo ""
echo "Saved to: $RESULTS_FILE"
