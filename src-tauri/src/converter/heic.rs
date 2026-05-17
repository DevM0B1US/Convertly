use crate::types::ConversionSettings;
use image::{DynamicImage, RgbImage};
use libheif_rs::{ColorSpace, HeifContext, RgbChroma, CompressionFormat, EncoderQuality, LibHeif};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use tauri::AppHandle;

/// Decode a HEIC/HEIF file into a DynamicImage for processing
pub fn decode_heic(input_path: &Path) -> Result<DynamicImage, String> {
    let input_str = input_path.to_str().ok_or("Invalid input path")?;
    let ctx = HeifContext::read_from_file(input_str)
        .map_err(|e| format!("Failed to read HEIC context: {}", e))?;

    let handle = ctx.primary_image_handle()
        .map_err(|e| format!("Failed to get primary image handle: {}", e))?;

    let lib_heif = LibHeif::new();
    let image = lib_heif.decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None)
        .map_err(|e| format!("Failed to decode HEIC: {}", e))?;

    let width = image.width();
    let height = image.height();
    
    let planes = image.planes();
    let interleaved = planes.interleaved.ok_or("No interleaved data found in HEIC image")?;

    let data = interleaved.data;
    let stride = interleaved.stride;

    let mut rgb_data = Vec::with_capacity((width * height * 3) as usize);
    for y in 0..height {
        let row_start = y as usize * stride;
        let row_end = row_start + (width as usize * 3);
        if row_end <= data.len() {
            rgb_data.extend_from_slice(&data[row_start..row_end]);
        } else {
            return Err("HEIC pixel data out of bounds".to_string());
        }
    }

    RgbImage::from_raw(width, height, rgb_data)
        .map(DynamicImage::ImageRgb8)
        .ok_or_else(|| "Failed to construct RgbImage from raw data".to_string())
}

pub fn convert_heic(
    _app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    cancel_flag: std::sync::Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let img = decode_heic(input_path)?;

    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let format = settings.target_format.to_lowercase();
    if format == "heic" || format == "heif" {
        // Encode back to HEIC using libheif-rs
        let mut context = HeifContext::new()
            .map_err(|e| format!("Failed to create HEIF context: {}", e))?;

        let lib_heif = LibHeif::new();
        let mut encoder = lib_heif.encoder_for_format(CompressionFormat::Hevc)
            .map_err(|e| format!("Failed to create HEVC encoder: {}", e))?;
        
        encoder.set_quality(EncoderQuality::Lossy(settings.quality.clamp(1, 100)))
            .map_err(|e| format!("Failed to set quality: {}", e))?;

        let width = img.width();
        let height = img.height();
        let rgb = img.into_rgb8();

        let mut heif_image = libheif_rs::Image::new(
            width,
            height,
            ColorSpace::Rgb(RgbChroma::Rgb),
        ).map_err(|e| format!("Failed to create HEIF image: {}", e))?;

        let planes = heif_image.planes_mut();
        let interleaved = planes.interleaved.ok_or("No interleaved mutable data in HEIF image")?;

        let data = rgb.as_raw();
        let stride = interleaved.stride;

        for y in 0..height as usize {
            let src_start = y * width as usize * 3;
            let dst_start = y * stride;
            let src = &data[src_start..src_start + width as usize * 3];
            interleaved.data[dst_start..dst_start + src.len()].copy_from_slice(src);
        }

        context.encode_image(&heif_image, &mut encoder, None)
            .map_err(|e| format!("Failed to encode HEIF: {}", e))?;

        let output_str = output_path.to_str().ok_or("Invalid output path")?;
        context.write_to_file(output_str)
            .map_err(|e| format!("Failed to write HEIF file: {}", e))?;
    } else {
        img.save(output_path).map_err(|e| format!("Failed to save output image: {}", e))?;
    }

    Ok(output_path.to_path_buf())
}
