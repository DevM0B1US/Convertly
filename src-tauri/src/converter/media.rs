use crate::types::ConversionSettings;
use std::path::{Path, PathBuf};
use tauri_plugin_shell::ShellExt;
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
pub async fn convert_media(
    app_handle: &AppHandle,
    input_path: &Path,
    output_dir: &Path,
    settings: &ConversionSettings,
    media_type: &crate::types::MediaType,
) -> Result<PathBuf, String> {
    
    let ext = match settings.target_format.as_str() {
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
        _ => return Err(format!("Unsupported media format: {}", settings.target_format)),
    };

    let file_stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    
    let output_path = output_dir.join(format!("{}.{}", file_stem, ext));

    let mut args = vec![
        "-y".to_string(), // Overwrite output
        "-i".to_string(), input_path.to_string_lossy().to_string(),
    ];

    // Strip metadata
    if settings.strip_metadata {
        args.push("-map_metadata".to_string());
        args.push("-1".to_string());
    }

    // Video specific arguments
    if matches!(media_type, crate::types::MediaType::Video) {
        let vcodec = match settings.target_format.as_str() {
            "mp4" => "libx264",
            "mp4-hevc" => "libx265",
            "webm" => "libvpx-vp9",
            _ => "copy",
        };
        args.push("-c:v".to_string());
        args.push(vcodec.to_string());

        // Map 1-100 quality to CRF (0-51, where lower is better)
        // 100 quality = CRF 0 (lossless)
        // 1 quality = CRF 51 (worst)
        let crf = 51 - (settings.quality as f32 * 0.51) as u8;
        args.push("-crf".to_string());
        args.push(crf.to_string());
        
        // Resize
        if let Some(resize) = &settings.resize {
            if resize.enabled {
                let w = resize.width.unwrap_or(0); // 0 means keep original
                let h = resize.height.unwrap_or(0);
                
                let scale_filter = if resize.maintain_aspect_ratio {
                    // scale=w:h with aspect ratio preservation
                    let w_str = if w == 0 { "-1".to_string() } else { w.to_string() };
                    let h_str = if h == 0 { "-1".to_string() } else { h.to_string() };
                    format!("scale={}:{}", w_str, h_str)
                } else {
                    format!("scale={}:{}", w, h)
                };
                
                args.push("-vf".to_string());
                args.push(scale_filter);
            }
        }
    } else if matches!(media_type, crate::types::MediaType::Audio) {
        // Map 1-100 quality to audio bitrate
        // 100 = 320k, 1 = 32k
        let bitrate = 32 + (settings.quality as f32 * 2.88) as u32;
        args.push("-b:a".to_string());
        args.push(format!("{}k", bitrate));
    }

    args.push(output_path.to_string_lossy().to_string());

    // Execute sidecar
    // For local development, if sidecar fails, we fallback to system ffmpeg for safety.
    let cmd = app_handle.shell().command("ffmpeg").args(&args);
    
    let (mut rx, _child) = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to spawn ffmpeg: {}", e)),
    };

    let mut exit_code = None;

    // Listen for progress (basic parsing)
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(_line) => {
                // FFMPEG outputs progress to stderr
            },
            CommandEvent::Stdout(_line) => {},
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
            },
            _ => {}
        }
    }

    match exit_code {
        Some(0) => Ok(output_path),
        Some(code) => Err(format!("FFmpeg failed with exit code: {:?}", code)),
        None => Err("FFmpeg terminated unexpectedly without exit code".to_string()),
    }
}
