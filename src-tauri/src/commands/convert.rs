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

    // Sanitize: strip any path separators or traversal components from the directory name
    let sanitized_name = dir_name
        .replace(['/', '\\'], "_")
        .replace("..", "_");

    if sanitized_name.is_empty() {
        return Ok(out_dir.to_path_buf());
    }

    let target_dir_name = if let Some(fmt) = format {
        format!("{} ({})", sanitized_name, fmt)
    } else {
        sanitized_name
    };

    let base_path = out_dir.join(&target_dir_name);

    // Validate the resolved path stays within the intended output directory
    let canonical_base = std::fs::canonicalize(out_dir).unwrap_or_else(|_| out_dir.to_path_buf());
    let canonical_target = if base_path.exists() {
        std::fs::canonicalize(&base_path).unwrap_or_else(|_| base_path.clone())
    } else {
        // For paths that don't exist yet, ensure the parent resolves within bounds
        base_path.clone()
    };
    if !canonical_target.starts_with(&canonical_base) {
        return Err(format!(
            "Output path '{}' escapes the target directory boundary",
            base_path.display()
        ));
    }

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

pub struct ConversionTask {
    pub handle: tokio::task::JoinHandle<()>,
    pub cancel_flag: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

pub struct ActiveConversions {
    pub tasks: std::sync::Mutex<std::collections::HashMap<String, ConversionTask>>,
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
            "hdr" => "hdr",
            "ico" | "cur" => "ico",
            "qoi" => "qoi",
            "pnm" | "ppm" | "pgm" | "pbm" => "pnm",
            "ff" | "farbfeld" => "ff",
            "mp4" | "mp4-hevc" => "mp4",
            "webm" => "webm",
            "avi" | "divx" => "avi",
            "mkv" => "mkv",
            "mov" => "mov",
            "flv" | "f4v" | "swf" => "flv",
            "ts" | "mts" | "m2ts" => "ts",
            "mpg" | "mpeg" | "vob" => "mpg",
            "m4v" => "m4v",
            "3gp" | "3g2" => "3gp",
            "ogv" => "ogv",
            "wmv" => "wmv",
            "mxf" => "mxf",
            "rm" | "rmvb" => "rm",
            "mp3" => "mp3",
            "flac" => "flac",
            "wav" => "wav",
            "aac" => "aac",
            "ogg" | "oga" => "ogg",
            "m4a" => "m4a",
            "wma" => "wma",
            "opus" => "opus",
            "aiff" | "aifc" | "aif" => "aiff",
            "ac3" => "ac3",
            "alac" => "alac",
            "amr" => "amr",
            "mp1" => "mp1",
            "mp2" => "mp2",
            "mpc" => "mpc",
            "au" => "au",
            "dsd" | "dsf" | "dff" => "dsf",
            "mqa" => "mqa",
            _ => return Err(format!("Unsupported target format: {}", settings.target_format)),
        };

        let file_stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| format!("Invalid filename: cannot extract stem from '{}'", input_path.display()))?;

        let output_path = match crate::utils::generate_unique_path(&out_dir_path, file_stem, ext, &reserved_paths) {
            Ok(p) => p,
            Err(e) => return Err(e),
        };
        reserved_paths.insert(output_path.clone());

        let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cancel_flag_for_task = cancel_flag.clone();
        let semaphore_clone = semaphore.clone();
        let input_codec = item.metadata.codec.clone();
        let task = tokio::spawn(async move {
            let _permit = match semaphore_clone.acquire_owned().await {
                Ok(p) => p,
                Err(_) => {
                    let _ = handle_for_task.emit("conversion:error", serde_json::json!({
                        "id": id_for_task,
                        "error": "Failed to acquire concurrency permit".to_string(),
                    }));
                    return;
                }
            };
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

                    let cancel_flag_for_image = cancel_flag_for_task.clone();
                    let result = tokio::task::spawn_blocking(move || {
                        let is_heic_input = input.extension()
                            .map(|e| e.to_string_lossy().to_lowercase())
                            .map(|ext| ext == "heic" || ext == "heif")
                            .unwrap_or(false);
                        let is_heic_output = s.target_format.to_lowercase() == "heic" || s.target_format.to_lowercase() == "heif";

                        let is_jxl_input = input.extension()
                            .map(|e| e.to_string_lossy().to_lowercase())
                            .map(|ext| ext == "jxl")
                            .unwrap_or(false);

                        let is_svg_input = input.extension()
                            .map(|e| e.to_string_lossy().to_lowercase())
                            .map(|ext| ext == "svg" || ext == "svgz")
                            .unwrap_or(false);

                        let is_raw_input = input.extension()
                            .map(|e| e.to_string_lossy().to_lowercase())
                            .map(|ext| {
                                matches!(ext.as_str(), 
                                    "nef" | "nrw" | "cr2" | "crw" | "cr3" | "arw" | "srf" | "sr2" |
                                    "orf" | "raf" | "rw2" | "dng" | "pef" | "mrw" | "mef" | "srw" |
                                    "erf" | "kdc" | "dcs" | "dcr" | "3fr" | "iiq" | "mos" | "ari"
                                )
                            })
                            .unwrap_or(false);

                        if is_heic_input || is_heic_output {
                            crate::converter::heic::convert_heic(&handle, &input, &out_path, &s, cancel_flag_for_image)
                        } else if is_jxl_input {
                            crate::converter::jxl::convert_jxl(&handle, &input, &out_path, &s, cancel_flag_for_image)
                        } else if is_svg_input {
                            crate::converter::svg::convert_svg(&handle, &input, &out_path, &s, cancel_flag_for_image)
                        } else if is_raw_input {
                            crate::converter::raw::convert_raw(&handle, &input, &out_path, &s, cancel_flag_for_image)
                        } else {
                            convert_image(&handle, &input, &out_path, &s, &fid, cancel_flag_for_image)
                        }
                    }).await
                        .unwrap_or_else(|e| Err(format!("Task panicked: {}", e)));

                    // Explicitly drop guard here (or let it go out of scope)
                    drop(guard);

                    result
                },
                MediaType::Video | MediaType::Audio => {
                    convert_media(&handle_for_task, &input_path, &output_path, &settings, &media_type, &id_for_task, input_codec).await
                },
                MediaType::Document => {
                    let cancel_flag_for_doc = cancel_flag_for_task.clone();
                    let input = input_path.clone();
                    let out_path = output_path.clone();
                    let s = settings.clone();
                    let handle = handle_for_task.clone();

                    let result = tokio::task::spawn_blocking(move || {
                        crate::converter::document::convert_document(&handle, &input, &out_path, &s, cancel_flag_for_doc)
                    }).await
                        .unwrap_or_else(|e| Err(format!("Document task panicked: {}", e)));

                    result
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
                tasks.insert(id, ConversionTask {
                    handle: task,
                    cancel_flag,
                });
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
            if let Some(task) = tasks.remove(&id) {
                task.cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                task.handle.abort();
            }
        }
    }
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
        "heic" | "heif" => 350.0,
        "jxl" => 250.0,
        "svg" | "svgz" => 200.0,
        "nef" | "nrw" | "cr2" | "crw" | "cr3" | "arw" | "dng" | "raf" => 600.0,
        _ => 40.0,
    };
    let duration = (pixels * rate_ms) as u64;
    duration.max(150) // at least 150ms
}
