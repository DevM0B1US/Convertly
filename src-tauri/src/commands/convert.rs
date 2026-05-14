use crate::types::{ConversionSettings, QueuedFile, MediaType, ConversionStatus};
use crate::converter::image::convert_image;
use std::path::Path;
use std::fs;
use tauri::AppHandle;
use tauri::Emitter;

#[derive(serde::Serialize, Clone)]
struct ProgressEvent {
    id: String,
    percent: f32,
}

#[tauri::command]
pub async fn start_conversion(
    app_handle: AppHandle,
    items: Vec<QueuedFile>,
    output_dir: Option<String>,
) -> Result<(), String> {
    
    // Process items sequentially for MVP
    // In production, we'd use a QueueManager with max_concurrent
    for item in items {
        if let MediaType::Image = item.media_type {
            let input_path = Path::new(&item.path);
            let out_dir_path = if let Some(ref dir) = output_dir {
                std::path::PathBuf::from(dir)
            } else {
                input_path.parent().unwrap_or(Path::new("")).to_path_buf()
            };

            // Use global settings or item overrides
            let settings = item.settings.unwrap_or_default();

            // Emit progress 0%
            let _ = app_handle.emit("conversion:progress", ProgressEvent {
                id: item.id.to_string(),
                percent: 0.0,
            });

            // Convert image
            match convert_image(input_path, &out_dir_path, &settings) {
                Ok(out_path) => {
                    // Emit progress 100% and done
                    let _ = app_handle.emit("conversion:progress", ProgressEvent {
                        id: item.id.to_string(),
                        percent: 100.0,
                    });
                    
                    let _ = app_handle.emit("conversion:complete", serde_json::json!({
                        "id": item.id.to_string(),
                        "output_path": out_path,
                    }));
                },
                Err(e) => {
                    let _ = app_handle.emit("conversion:error", serde_json::json!({
                        "id": item.id.to_string(),
                        "error": e,
                    }));
                }
            }
        }
    }

    Ok(())
}
