use crate::types::{QueuedFile, MediaType};
use crate::converter::image::convert_image;
use crate::converter::media::convert_media;
use std::path::Path;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use std::sync::Arc;
use tokio::sync::Semaphore;

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
    // PRD: max_concurrent = 2
    let semaphore = Arc::new(Semaphore::new(2));
    
    let out_dir_base = output_dir.map(std::path::PathBuf::from);

    let mut tasks = Vec::new();

    for item in items {
        let app_handle = app_handle.clone();
        let semaphore = semaphore.clone();
        let out_dir_base = out_dir_base.clone();

        let task = tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            let input_path = Path::new(&item.path);
            let out_dir_path = if let Some(ref dir) = out_dir_base {
                dir.clone()
            } else {
                // Default to Downloads/Convertly if no output_dir provided
                if let Ok(downloads) = app_handle.path().download_dir() {
                    let default_path = downloads.join("Convertly");
                    if !default_path.exists() {
                        let _ = std::fs::create_dir_all(&default_path);
                    }
                    default_path
                } else {
                    // Fallback to original folder if Downloads can't be resolved
                    input_path.parent().unwrap_or(Path::new("")).to_path_buf()
                }
            };

            let settings = item.settings.unwrap_or_default();

            let _ = app_handle.emit("conversion:progress", ProgressEvent {
                id: item.id.to_string(),
                percent: 0.0,
            });

            let result = match item.media_type {
                MediaType::Image => {
                    convert_image(input_path, &out_dir_path, &settings)
                },
                MediaType::Video | MediaType::Audio => {
                    convert_media(&app_handle, input_path, &out_dir_path, &settings, &item.media_type).await
                },
                _ => Err("Unknown media type".to_string()),
            };

            match result {
                Ok(out_path) => {
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
        });

        tasks.push(task);
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_conversion(_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn pause_conversion(_id: String) -> Result<(), String> {
    Ok(())
}
