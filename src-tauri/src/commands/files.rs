use crate::types::{QueuedFile, MediaType, FileMetadata, ConversionStatus};
use crate::metadata::image::extract_image_metadata;
use std::fs;
use uuid::Uuid;

#[tauri::command]
pub async fn add_files(paths: Vec<String>) -> Result<Vec<QueuedFile>, String> {
    let mut queued_files = Vec::new();

    for path_str in paths {
        let path = std::path::Path::new(&path_str);
        
        if !path.exists() {
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            continue; 
        }

        let size_bytes = metadata.len();
        if size_bytes == 0 {
            continue;
        }

        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let extension = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();

        let media_type = match extension.as_str() {
            "jpg" | "jpeg" | "png" | "webp" | "avif" | "gif" | "bmp" | "tiff" => MediaType::Image,
            "mp4" | "webm" | "mkv" | "mov" | "avi" => MediaType::Video,
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => MediaType::Audio,
            _ => MediaType::Unknown,
        };

        let file_metadata = match media_type {
            MediaType::Image => extract_image_metadata(path, &extension),
            _ => FileMetadata {
                format: extension,
                ..Default::default()
            }
        };

        let file = QueuedFile {
            id: Uuid::new_v4(),
            path: path_str,
            file_name,
            size_bytes,
            media_type,
            metadata: file_metadata,
            settings: None,
            status: ConversionStatus::Queued,
            progress: None,
            error: None,
        };

        queued_files.push(file);
    }

    Ok(queued_files)
}

#[tauri::command]
pub async fn remove_file(id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn clear_queue() -> Result<(), String> {
    Ok(())
}
