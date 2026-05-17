use crate::types::{QueuedFile, MediaType, FileMetadata, ConversionStatus};
use crate::metadata::image::extract_image_metadata;
use std::fs;
use uuid::Uuid;

fn collect_files(path: &std::path::Path) -> Vec<(std::path::PathBuf, Option<String>)> {
    // Use symlink_metadata to avoid following symlinks (prevents traversal attacks)
    let metadata = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return Vec::new(),
    };

    // Skip symlinks entirely to prevent directory traversal loops
    if metadata.is_symlink() {
        return Vec::new();
    }

    if metadata.is_dir() {
        let dir_name = path.file_name().map(|n| n.to_string_lossy().to_string());
        let mut files = Vec::new();
        let dir = match fs::read_dir(path) {
            Ok(d) => d,
            Err(_) => return Vec::new(),
        };
        for entry in dir.flatten() {
            files.extend(collect_files(&entry.path()));
        }
        // Tag all discovered files with this directory name
        for file in &mut files {
            if file.1.is_none() {
                file.1 = dir_name.clone();
            }
        }
        files
    } else if metadata.is_file() && metadata.len() > 0 {
        vec![(path.to_path_buf(), None)]
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub async fn add_files(paths: Vec<String>) -> Result<Vec<QueuedFile>, String> {
    let mut queued_files = Vec::new();

    for path_str in paths {
        let path = std::path::Path::new(&path_str);

        let file_paths = collect_files(path);

        for (file_path, source_dir) in file_paths {
            let size_bytes = match fs::metadata(&file_path) {
                Ok(m) => m.len(),
                Err(_) => continue,
            };

            let Some(file_name_os) = file_path.file_name() else {
                continue;
            };
            let file_name = file_name_os.to_string_lossy().to_string();

            let Some(extension_os) = file_path.extension() else {
                continue;
            };
            let extension = extension_os.to_string_lossy().to_lowercase();

            let media_type = if crate::types::IMAGE_EXTENSIONS.contains(&extension.as_str()) {
                MediaType::Image
            } else if crate::types::VIDEO_EXTENSIONS.contains(&extension.as_str()) {
                MediaType::Video
            } else if crate::types::AUDIO_EXTENSIONS.contains(&extension.as_str()) {
                MediaType::Audio
            } else {
                MediaType::Unknown
            };

            if matches!(media_type, MediaType::Unknown) {
                continue;
            }

            let file_metadata = match media_type {
                MediaType::Image => extract_image_metadata(&file_path, &extension),
                _ => FileMetadata {
                    format: extension,
                    ..Default::default()
                }
            };

            let file = QueuedFile {
                id: Uuid::new_v4(),
                path: file_path.to_string_lossy().to_string(),
                file_name,
                size_bytes,
                media_type,
                metadata: file_metadata,
                settings: None,
                source_dir,
                status: ConversionStatus::Queued,
                progress: None,
                error: None,
            };

            queued_files.push(file);
        }
    }

    Ok(queued_files)
}
