use crate::types::ConversionSettings;
use image::{DynamicImage, RgbaImage};
use resvg::usvg::{Options, Tree};
use resvg::tiny_skia::{Pixmap, Transform};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use tauri::AppHandle;

pub fn convert_svg(
    _app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    cancel_flag: std::sync::Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let svg_data = std::fs::read(input_path)
        .map_err(|e| format!("Failed to read SVG file: {}", e))?;

    let opt = Options::default();
    
    let rtree = Tree::from_data(&svg_data, &opt)
        .map_err(|e| format!("Failed to parse SVG data: {}", e))?;

    let size = rtree.size();
    let width = size.width() as u32;
    let height = size.height() as u32;

    // Support resize options from settings if enabled
    let (target_w, target_h) = if let Some(ref resize) = settings.resize {
        if resize.enabled {
            let w = resize.width.unwrap_or(width);
            let h = resize.height.unwrap_or(height);
            (w, h)
        } else {
            (width, height)
        }
    } else {
        (width, height)
    };

    let mut pixmap = Pixmap::new(target_w, target_h)
        .ok_or_else(|| "Failed to create rendering pixmap".to_string())?;

    // Scaling transform to scale SVG to target size
    let scale_x = target_w as f32 / size.width();
    let scale_y = target_h as f32 / size.height();
    let transform = Transform::from_scale(scale_x, scale_y);

    resvg::render(&rtree, transform, &mut pixmap.as_mut());

    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    // Convert Pixmap to RgbaImage and save it
    let rgba_image = RgbaImage::from_raw(target_w, target_h, pixmap.take())
        .ok_or_else(|| "Failed to create RgbaImage from rendered SVG data".to_string())?;

    let dynamic_img = DynamicImage::ImageRgba8(rgba_image);
    dynamic_img.save(output_path)
        .map_err(|e| format!("Failed to save output image: {}", e))?;

    Ok(output_path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_svg_rendering() {
        let base_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let svg_path = base_path.join("../public/vite.svg");
        assert!(svg_path.exists(), "vite.svg should exist in public folder");

        let svg_data = std::fs::read(svg_path).unwrap();
        let opt = Options::default();
        let rtree = Tree::from_data(&svg_data, &opt).unwrap();
        
        let size = rtree.size();
        let width = size.width() as u32;
        let height = size.height() as u32;
        assert!(width > 0 && height > 0, "SVG size should be non-zero");

        let mut pixmap = Pixmap::new(width, height).unwrap();
        let transform = Transform::default();
        resvg::render(&rtree, transform, &mut pixmap.as_mut());

        let rgba_image = RgbaImage::from_raw(width, height, pixmap.take()).unwrap();
        let dynamic_img = DynamicImage::ImageRgba8(rgba_image);
        assert_eq!(dynamic_img.width(), width);
        assert_eq!(dynamic_img.height(), height);
    }
}
