use crate::types::{QueuedFile, MediaType};
use crate::converter::image::convert_image;
use crate::converter::media::convert_media;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

fn resolve_output_dir(out_dir: &Path, source_dir: Option<&str>) -> PathBuf {
    let Some(dir_name) = source_dir else {
        return out_dir.to_path_buf();
    };

    // Try the name as-is first, then append (1), (2), etc.
    let mut candidate = out_dir.join(dir_name);
    if !candidate.exists() {
        std::fs::create_dir_all(&candidate).ok();
        return candidate;
    }

    for i in 1..1000 {
        candidate = out_dir.join(format!("{} ({})", dir_name, i));
        if !candidate.exists() {
            std::fs::create_dir_all(&candidate).ok();
            return candidate;
        }
    }

    // Fallback: use the name directly (unlikely to reach here)
    let _ = std::fs::create_dir_all(&candidate);
    candidate
}

pub struct ActiveConversions {
    pub tasks: std::sync::Mutex<std::collections::HashMap<String, tokio::task::JoinHandle<()>>>,
}

#[tauri::command]
pub async fn start_conversion(
    app_handle: AppHandle,
    items: Vec<QueuedFile>,
    output_dir: Option<String>,
) -> Result<(), String> {
    let out_dir_base = output_dir.map(std::path::PathBuf::from);
    let total = items.len();

    for (index, item) in items.into_iter().enumerate() {
        let handle_for_task = app_handle.clone();
        let out_dir_base = out_dir_base.clone();
        let id = item.id.to_string();

        let input_path = Path::new(&item.path);
        let out_dir_path = if let Some(ref dir) = out_dir_base {
            resolve_output_dir(dir, item.source_dir.as_deref())
        } else {
            if let Ok(downloads) = handle_for_task.path().download_dir() {
                let default_path = downloads.join("Convertly");
                resolve_output_dir(&default_path, item.source_dir.as_deref())
            } else {
                resolve_output_dir(
                    input_path.parent().unwrap_or(Path::new("")),
                    item.source_dir.as_deref(),
                )
            }
        };

        let settings = item.settings.unwrap_or_default();

        let _ = handle_for_task.emit("conversion:progress", serde_json::json!({
            "id": id,
            "percent": 0.0,
            "stage": "starting",
            "currentFile": index + 1,
            "totalFiles": total,
        }));

            let result = match item.media_type {
                MediaType::Image => {
                    let input = input_path.to_path_buf();
                    let out = out_dir_path.clone();
                    let s = settings.clone();
                    let handle = handle_for_task.clone();
                    let fid = id.clone();
                    tokio::task::spawn_blocking(move || {
                        convert_image(&handle, &input, &out, &s, &fid)
                    }).await
                        .map_err(|e| format!("Task panicked: {}", e))?
                },
            MediaType::Video | MediaType::Audio => {
                convert_media(&handle_for_task, input_path, &out_dir_path, &settings, &item.media_type, &id).await
            },
            _ => Err("Unknown media type".to_string()),
        };

        match result {
            Ok(out_path) => {
                let _ = handle_for_task.emit("conversion:progress", serde_json::json!({
                    "id": id,
                    "percent": 100.0,
                    "stage": "done",
                    "currentFile": index + 1,
                    "totalFiles": total,
                }));

                let _ = handle_for_task.emit("conversion:complete", serde_json::json!({
                    "id": id,
                    "output_path": out_path,
                }));
            },
            Err(e) => {
                let _ = handle_for_task.emit("conversion:error", serde_json::json!({
                    "id": id,
                    "error": e,
                }));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_conversion(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    if let Some(state) = app_handle.try_state::<ActiveConversions>() {
        if let Ok(mut tasks) = state.tasks.lock() {
            if let Some(handle) = tasks.remove(&id) {
                handle.abort();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn pause_conversion(id: String) -> Result<(), String> {
    let _ = id;
    Ok(())
}
