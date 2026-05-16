use crate::types::ConversionSettings;
use image::{ImageReader, ImageFormat, imageops::FilterType};
use std::path::{Path, PathBuf};
use std::fs::File;

pub fn convert_image(
    input_path: &Path,
    output_dir: &Path,
    settings: &ConversionSettings,
) -> Result<PathBuf, String> {
    // Determine output extension based on target format
    let ext = match settings.target_format.as_str() {
        "webp" => "webp",
        "avif" => "avif",
        "jpeg" => "jpg",
        "png" => "png",
        "gif" => "gif",
        "bmp" => "bmp",
        "tiff" => "tiff",
        _ => return Err(format!("Unsupported target format: {}", settings.target_format)),
    };

    let file_stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    
    let output_path = output_dir.join(format!("{}.{}", file_stem, ext));

    // Open and decode image
    let reader = match ImageReader::open(input_path) {
        Ok(r) => r,
        Err(e) => return Err(format!("Failed to open image: {}", e)),
    };

    let mut img = match reader.with_guessed_format() {
        Ok(r) => match r.decode() {
            Ok(i) => i,
            Err(e) => return Err(format!("Failed to decode image: {}", e)),
        },
        Err(e) => return Err(format!("Failed to guess format: {}", e)),
    };

    // Apply Resize
    if let Some(resize) = &settings.resize {
        if resize.enabled {
            if let (Some(w), Some(h)) = (resize.width, resize.height) {
                if resize.maintain_aspect_ratio {
                    img = img.resize(w, h, FilterType::Lanczos3);
                } else {
                    img = img.resize_exact(w, h, FilterType::Lanczos3);
                }
            }
        }
    }

    // Save with the appropriate format

    let result = match settings.target_format.as_str() {
        "webp" => {
            // WebP quality configuration is a bit more complex in pure image-rs, 
            // but we can map the 1-100 quality directly to webp encoding if supported.
            // Using standard save for MVP
            img.save_with_format(&output_path, ImageFormat::WebP)
        },
        "avif" => {
            img.save_with_format(&output_path, ImageFormat::Avif)
        },
        "jpeg" => {
            img.save_with_format(&output_path, ImageFormat::Jpeg) // Needs custom encoder for quality
        },
        "png" => {
            img.save_with_format(&output_path, ImageFormat::Png)
        },
        "gif" => {
            img.save_with_format(&output_path, ImageFormat::Gif)
        },
        "bmp" => {
            img.save_with_format(&output_path, ImageFormat::Bmp)
        },
        "tiff" => {
            img.save_with_format(&output_path, ImageFormat::Tiff)
        },
        _ => unreachable!(),
    };

    match result {
        Ok(_) => Ok(output_path),
        Err(e) => Err(format!("Failed to encode image: {}", e)),
    }
}
