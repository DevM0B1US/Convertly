use crate::types::ConversionSettings;
use image::{DynamicImage, RgbImage, RgbaImage};
use jxl_oxide::JxlImage;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use tauri::AppHandle;

/// Decode a JXL file into a DynamicImage
pub fn decode_jxl(input_path: &Path) -> Result<DynamicImage, String> {
    let image = JxlImage::builder().open(input_path)
        .map_err(|e| format!("Failed to open JXL image: {}", e))?;

    let render = image.render_frame(0)
        .map_err(|e| format!("Failed to render JXL frame: {}", e))?;

    let grid = render.image_all_channels();
    let width = grid.width() as u32;
    let height = grid.height() as u32;
    let channels = grid.channels();

    match channels {
        4 => {
            let mut data = Vec::with_capacity((width * height * 4) as usize);
            for pixel in grid.buf().chunks_exact(4) {
                let r = (pixel[0] * 255.0).clamp(0.0, 255.0) as u8;
                let g = (pixel[1] * 255.0).clamp(0.0, 255.0) as u8;
                let b = (pixel[2] * 255.0).clamp(0.0, 255.0) as u8;
                let a = (pixel[3] * 255.0).clamp(0.0, 255.0) as u8;
                data.push(r);
                data.push(g);
                data.push(b);
                data.push(a);
            }
            RgbaImage::from_raw(width, height, data)
                .map(DynamicImage::ImageRgba8)
                .ok_or_else(|| "Failed to construct RgbaImage from raw JXL data".to_string())
        }
        _ => {
            let mut data = Vec::with_capacity((width * height * 3) as usize);
            for pixel in grid.buf().chunks_exact(channels) {
                if channels == 1 {
                    let v = (pixel[0] * 255.0).clamp(0.0, 255.0) as u8;
                    data.push(v);
                    data.push(v);
                    data.push(v);
                } else {
                    let r = (pixel[0] * 255.0).clamp(0.0, 255.0) as u8;
                    let g = if channels > 1 { (pixel[1] * 255.0).clamp(0.0, 255.0) as u8 } else { 0 };
                    let b = if channels > 2 { (pixel[2] * 255.0).clamp(0.0, 255.0) as u8 } else { 0 };
                    data.push(r);
                    data.push(g);
                    data.push(b);
                }
            }
            RgbImage::from_raw(width, height, data)
                .map(DynamicImage::ImageRgb8)
                .ok_or_else(|| "Failed to construct RgbImage from raw JXL data".to_string())
        }
    }
}

pub fn convert_jxl(
    _app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    _settings: &ConversionSettings,
    cancel_flag: std::sync::Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let img = decode_jxl(input_path)?;

    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    img.save(output_path)
        .map_err(|e| format!("Failed to save decoded JXL output: {}", e))?;

    Ok(output_path.to_path_buf())
}
