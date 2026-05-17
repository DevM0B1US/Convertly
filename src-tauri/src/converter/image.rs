use crate::types::ConversionSettings;
use image::{ImageReader, ImageFormat, imageops::FilterType, ExtendedColorType, ImageEncoder};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::avif::AvifEncoder;
use webp::Encoder as WebpEncoder;
use webp::WebPConfig;
use std::path::{Path, PathBuf};
use std::fs::File;
use tauri::AppHandle;

pub fn convert_image(
    _app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    _file_id: &str,
) -> Result<PathBuf, String> {
    let format = match settings.target_format.as_str() {
        "webp" => "webp",
        "avif" => "avif",
        "jpeg" | "jpg" => "jpeg",
        "png" => "png",
        "gif" => "gif",
        "bmp" => "bmp",
        "tiff" => "tiff",
        _ => return Err(format!("Unsupported target format: {}", settings.target_format)),
    };

    let reader = ImageReader::open(input_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    let mut img = reader.with_guessed_format()
        .map_err(|e| format!("Failed to guess format: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    if let Some(resize) = &settings.resize {
        if resize.enabled {
            let orig_w = img.width();
            let orig_h = img.height();

            if orig_w > 0 && orig_h > 0 {
                let target_w = resize.width.filter(|&w| w > 0);
                let target_h = resize.height.filter(|&h| h > 0);

                match (target_w, target_h) {
                    (Some(w), Some(h)) => {
                        if resize.maintain_aspect_ratio {
                            img = img.resize(w, h, FilterType::Lanczos3);
                        } else {
                            img = img.resize_exact(w, h, FilterType::Lanczos3);
                        }
                    }
                    (None, Some(h)) => {
                        let w = ((orig_w as f64 * h as f64) / orig_h as f64).round() as u32;
                        img = img.resize(w, h, FilterType::Lanczos3);
                    }
                    (Some(w), None) => {
                        let h = ((orig_h as f64 * w as f64) / orig_w as f64).round() as u32;
                        img = img.resize(w, h, FilterType::Lanczos3);
                    }
                    _ => {}
                }
            }

        }
    }

    let quality = settings.quality.clamp(1, 100);

    match format {
        "jpeg" => {
            let file = File::create(&output_path)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            let rgb = img.to_rgb8();
            JpegEncoder::new_with_quality(file, quality)
                .encode(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8)
                .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
        }
        "avif" => {
            let file = File::create(&output_path)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            let rgba = img.to_rgba8();
            let avif_speed = match settings.speed.as_deref() {
                Some("ultrafast") => 9,
                Some("veryslow") => 3,
                _ => 6,
            };
            AvifEncoder::new_with_speed_quality(file, avif_speed, quality)
                .write_image(rgba.as_raw(), rgba.width(), rgba.height(), ExtendedColorType::Rgba8)
                .map_err(|e| format!("Failed to encode AVIF: {}", e))?;
        }
        "webp" => {
            let rgba = img.to_rgba8();
            let encoder = WebpEncoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
            let mut config = WebPConfig::new().map_err(|_| "Failed to create WebP config".to_string())?;
            config.quality = quality as f32;
            config.method = match settings.speed.as_deref() {
                Some("ultrafast") => 0,
                Some("veryslow") => 6,
                _ => 3,
            };
            let webp_data = encoder.encode_advanced(&config)
                .map_err(|e| format!("Failed to encode WebP: {:?}", e))?;
            std::fs::write(&output_path, &webp_data[..])
                .map_err(|e| format!("Failed to write WebP: {}", e))?;
        }
        "png" => {
            img.save_with_format(&output_path, ImageFormat::Png)
                .map_err(|e| format!("Failed to encode PNG: {}", e))?;
        }
        "gif" => {
            img.save_with_format(&output_path, ImageFormat::Gif)
                .map_err(|e| format!("Failed to encode GIF: {}", e))?;
        }
        "bmp" => {
            img.save_with_format(&output_path, ImageFormat::Bmp)
                .map_err(|e| format!("Failed to encode BMP: {}", e))?;
        }
        "tiff" => {
            img.save_with_format(&output_path, ImageFormat::Tiff)
                .map_err(|e| format!("Failed to encode TIFF: {}", e))?;
        }
        other => return Err(format!("Unsupported target format: {}", other)),
    }

    Ok(output_path.to_path_buf())
}
