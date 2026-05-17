use crate::types::ConversionSettings;
use image::{DynamicImage, RgbImage};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use tauri::AppHandle;

/// Decode a Camera RAW file into a DynamicImage
pub fn decode_raw(input_path: &Path) -> Result<DynamicImage, String> {
    let mut file = std::fs::File::open(input_path)
        .map_err(|e| format!("Failed to open Camera RAW file: {}", e))?;

    let raw = rawloader::decode(&mut file)
        .map_err(|e| format!("Failed to decode Camera RAW: {:?}", e))?;

    let width = raw.width;
    let height = raw.height;

    let rgb_data = match raw.data {
        rawloader::RawImageData::Integer(ref vec) => {
            let mut data = Vec::with_capacity(width * height * 3);
            let get_val = |x: usize, y: usize| -> u16 {
                let clamped_x = x.min(width - 1);
                let clamped_y = y.min(height - 1);
                vec[clamped_y * width + clamped_x]
            };

            for y in 0..height {
                for x in 0..width {
                    // Assume RGGB Bayer pattern:
                    // y % 2 == 0, x % 2 == 0 -> R
                    // y % 2 == 0, x % 2 == 1 -> G
                    // y % 2 == 1, x % 2 == 0 -> G
                    // y % 2 == 1, x % 2 == 1 -> B
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

                    data.push((r_val >> 8) as u8);
                    data.push((g_val >> 8) as u8);
                    data.push((b_val >> 8) as u8);
                }
            }
            data
        }
        rawloader::RawImageData::Float(ref vec) => {
            let mut data = Vec::with_capacity(width * height * 3);
            let get_val = |x: usize, y: usize| -> f32 {
                let clamped_x = x.min(width - 1);
                let clamped_y = y.min(height - 1);
                vec[clamped_y * width + clamped_x]
            };

            let scale = |v: f32| -> u8 { (v * 255.0).clamp(0.0, 255.0) as u8 };

            for y in 0..height {
                for x in 0..width {
                    let (r_val, g_val, b_val) = match (y % 2, x % 2) {
                        (0, 0) => {
                            let r = get_val(x, y);
                            let g = (get_val(x + 1, y) + get_val(x, y + 1)) / 2.0;
                            let b = get_val(x + 1, y + 1);
                            (r, g, b)
                        }
                        (0, 1) => {
                            let r = (get_val(x - 1, y) + get_val(x + 1, y)) / 2.0;
                            let g = get_val(x, y);
                            let b = get_val(x, y + 1);
                            (r, g, b)
                        }
                        (1, 0) => {
                            let r = (get_val(x, y - 1) + get_val(x, y + 1)) / 2.0;
                            let g = get_val(x, y);
                            let b = get_val(x + 1, y);
                            (r, g, b)
                        }
                        (1, 1) | _ => {
                            let r = get_val(x - 1, y - 1);
                            let g = (get_val(x - 1, y) + get_val(x, y - 1)) / 2.0;
                            let b = get_val(x, y);
                            (r, g, b)
                        }
                    };

                    data.push(scale(r_val));
                    data.push(scale(g_val));
                    data.push(scale(b_val));
                }
            }
            data
        }
    };

    RgbImage::from_raw(width as u32, height as u32, rgb_data)
        .map(DynamicImage::ImageRgb8)
        .ok_or_else(|| "Failed to construct RgbImage from Camera RAW data".to_string())
}

pub fn convert_raw(
    _app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    _settings: &ConversionSettings,
    cancel_flag: std::sync::Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let img = decode_raw(input_path)?;

    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    img.save(output_path)
        .map_err(|e| format!("Failed to save Camera RAW output: {}", e))?;

    Ok(output_path.to_path_buf())
}
