use crate::types::{QueuedFile, MediaType};
use crate::converter::image::convert_image;
use crate::converter::media::convert_media;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Semaphore;

fn resolve_output_dir(out_dir: &Path, source_dir: Option<&str>, format: Option<&str>) -> Result<PathBuf, String> {
    let Some(dir_name) = source_dir else {
        return Ok(out_dir.to_path_buf());
    };

    let target_dir_name = if let Some(fmt) = format {
        format!("{} ({})", dir_name, fmt)
    } else {
        dir_name.to_string()
    };

    let base_path = out_dir.join(&target_dir_name);
    if !base_path.exists() {
        std::fs::create_dir_all(&base_path)
            .map_err(|e| format!("Failed to create output directory '{}': {}", base_path.display(), e))?;
        return Ok(base_path);
    }

    for i in 1..10000 {
        let candidate = out_dir.join(format!("{} ({})", target_dir_name, i));
        if !candidate.exists() {
            std::fs::create_dir_all(&candidate)
                .map_err(|e| format!("Failed to create output directory '{}': {}", candidate.display(), e))?;
            return Ok(candidate);
        }
    }

    std::fs::create_dir_all(&base_path)
        .map_err(|e| format!("Failed to create output directory '{}': {}", base_path.display(), e))?;
    Ok(base_path)
}

pub struct ActiveConversions {
    pub tasks: std::sync::Mutex<std::collections::HashMap<String, tokio::task::JoinHandle<()>>>,
}

#[tauri::command]
pub async fn start_conversion(
    app_handle: AppHandle,
    items: Vec<QueuedFile>,
    output_dir: Option<String>,
    max_concurrent: Option<usize>,
) -> Result<(), String> {
    let out_dir_base = output_dir.map(std::path::PathBuf::from);
    let total = items.len();
    let semaphore = Arc::new(Semaphore::new(max_concurrent.unwrap_or(2).clamp(1, 8)));

    // Cache resolved directories by their source_dir name so that multiple files from the same
    // dropped folder are placed in the same resolved output directory (avoiding duplicate (1), (2) folders).
    let mut resolved_dirs = std::collections::HashMap::<String, PathBuf>::new();
    let mut reserved_paths = std::collections::HashSet::<PathBuf>::new();

    for (index, item) in items.into_iter().enumerate() {
        let handle_for_task = app_handle.clone();
        let out_dir_base_clone = out_dir_base.clone();
        let id = item.id.to_string();
        let id_for_task = id.clone();

        let input_path = Path::new(&item.path).to_path_buf();
        let base_dir = match out_dir_base_clone {
            Some(dir) => dir,
            None => {
                if let Ok(downloads) = handle_for_task.path().download_dir() {
                    downloads.join("Convertly")
                } else {
                    input_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| {
                        std::env::temp_dir()
                    })
                }
            }
        };

        let out_dir_path = if let Some(ref src_dir) = item.source_dir {
            if let Some(cached) = resolved_dirs.get(src_dir) {
                cached.clone()
            } else {
                let format_str = item.settings.as_ref().map(|s| s.target_format.to_uppercase());
                let resolved = resolve_output_dir(&base_dir, Some(src_dir), format_str.as_deref())?;
                resolved_dirs.insert(src_dir.clone(), resolved.clone());
                resolved
            }
        } else {
            resolve_output_dir(&base_dir, None, None)?
        };

        let settings = item.settings.unwrap_or_default();
        let media_type = item.media_type.clone();

        // Determine target extension
        let ext = match settings.target_format.to_lowercase().as_str() {
            "webp" => "webp",
            "avif" => "avif",
            "jpeg" | "jpg" => "jpg",
            "png" => "png",
            "gif" => "gif",
            "bmp" => "bmp",
            "tiff" => "tiff",
            "mp4" | "mp4-hevc" => "mp4",
            "webm" => "webm",
            "avi" => "avi",
            "mkv" => "mkv",
            "mov" => "mov",
            "mp3" => "mp3",
            "flac" => "flac",
            "wav" => "wav",
            "aac" => "aac",
            "ogg" => "ogg",
            "m4a" => "m4a",
            "wma" => "wma",
            _ => "output",
        };

        let file_stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");

        let output_path = match crate::utils::generate_unique_path(&out_dir_path, file_stem, ext, &reserved_paths) {
            Ok(p) => p,
            Err(e) => return Err(e),
        };
        reserved_paths.insert(output_path.clone());

        let permit = match semaphore.clone().acquire_owned().await {
            Ok(p) => p,
            Err(_) => return Err("Failed to acquire semaphore permit: closed".to_string()),
        };

        let task = tokio::spawn(async move {
            let _permit = permit;
            let _ = handle_for_task.emit("conversion:progress", serde_json::json!({
                "id": id_for_task,
                "percent": 0.0,
                "stage": "starting",
                "currentFile": index + 1,
                "totalFiles": total,
            }));

            let result = match media_type {
                MediaType::Image => {
                    let input = input_path.clone();
                    let out_path = output_path.clone();
                    let s = settings.clone();
                    let handle = handle_for_task.clone();
                    let fid = id_for_task.clone();

                    let fid_progress = id_for_task.clone();
                    let handle_progress = handle_for_task.clone();

                    // Instantly inspect image headers for dimensions to estimate encoding time
                    let (width, height) = match image::image_dimensions(&input) {
                        Ok((w, h)) => (w, h),
                        _ => {
                            let size = std::fs::metadata(&input).map(|m| m.len()).unwrap_or(1_000_000);
                            let pixel_count = size.max(10_000);
                            let side = (pixel_count as f64).sqrt() as u32;
                            (side, side)
                        }
                    };

                    let format = s.target_format.clone();
                    let speed = s.speed.clone();

                    let progress_done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                    let progress_done_clone = progress_done.clone();

                    let ticker = tokio::spawn(async move {
                        let expected_ms = estimate_duration_ms(width, height, &format, speed.as_deref());
                        let interval_ms = 250;
                        let mut elapsed_ms = 0u64;

                        loop {
                            tokio::time::sleep(tokio::time::Duration::from_millis(interval_ms)).await;
                            if progress_done_clone.load(std::sync::atomic::Ordering::Relaxed) {
                                break;
                            }
                            elapsed_ms += interval_ms;

                            let ratio = (elapsed_ms as f64 / expected_ms as f64).min(2.0);
                            let percent = (1.0 - (-ratio).exp()) * 95.0;

                            let _ = handle_progress.emit("conversion:progress", serde_json::json!({
                                    "id": fid_progress,
                                    "percent": percent as f32,
                                }));
                        }
                    });

                    struct ProgressGuard {
                        done: std::sync::Arc<std::sync::atomic::AtomicBool>,
                        ticker: tokio::task::JoinHandle<()>,
                    }
                    impl Drop for ProgressGuard {
                        fn drop(&mut self) {
                            self.done.store(true, std::sync::atomic::Ordering::Relaxed);
                            self.ticker.abort();
                        }
                    }

                    let guard = ProgressGuard {
                        done: progress_done.clone(),
                        ticker,
                    };

                    let result = tokio::task::spawn_blocking(move || {
                        convert_image(&handle, &input, &out_path, &s, &fid)
                    }).await
                        .unwrap_or_else(|e| Err(format!("Task panicked: {}", e)));

                    // Explicitly drop guard here (or let it go out of scope)
                    drop(guard);

                    result
                },
                MediaType::Video | MediaType::Audio => {
                    convert_media(&handle_for_task, &input_path, &output_path, &settings, &media_type, &id_for_task).await
                },
                _ => Err("Unknown media type".to_string()),
            };

            match result {
                Ok(out_path) => {
                    let _ = handle_for_task.emit("conversion:progress", serde_json::json!({
                        "id": id_for_task,
                        "percent": 100.0,
                        "stage": "done",
                        "currentFile": index + 1,
                        "totalFiles": total,
                    }));

                    let _ = handle_for_task.emit("conversion:complete", serde_json::json!({
                        "id": id_for_task,
                        "output_path": out_path,
                    }));
                },
                Err(e) => {
                    let _ = handle_for_task.emit("conversion:error", serde_json::json!({
                        "id": id_for_task,
                        "error": e,
                    }));
                }
            }

            // Clean up task handle from ActiveConversions
            if let Some(s) = handle_for_task.try_state::<ActiveConversions>() {
                if let Ok(mut tasks) = s.tasks.lock() {
                    tasks.remove(&id_for_task);
                }
            }
        });

        // Register the task handle with ActiveConversions for cancellation
        if let Some(s) = app_handle.try_state::<ActiveConversions>() {
            if let Ok(mut tasks) = s.tasks.lock() {
                tasks.insert(id, task);
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

fn estimate_duration_ms(width: u32, height: u32, format: &str, speed: Option<&str>) -> u64 {
    let pixels = (width as f64 * height as f64) / 1_000_000.0; // million pixels
    let rate_ms = match format.to_lowercase().as_str() {
        "avif" => match speed {
            Some("ultrafast") => 200.0,
            Some("veryslow") => 4000.0,
            _ => 900.0,
        },
        "webp" => 50.0,
        "png" => 100.0,
        "jpeg" | "jpg" => 30.0,
        "gif" => 150.0,
        _ => 40.0,
    };
    let duration = (pixels * rate_ms) as u64;
    duration.max(150) // at least 150ms
}
