use crate::types::ConversionSettings;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;


fn parse_ffmpeg_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let sec: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + sec)
}

pub async fn convert_media(
    app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    media_type: &crate::types::MediaType,
    item_id: &str,
) -> Result<PathBuf, String> {

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(), input_path.to_string_lossy().to_string(),
        "-progress".to_string(), "pipe:1".to_string(),
    ];

    if settings.strip_metadata {
        args.push("-map_metadata".to_string());
        args.push("-1".to_string());
    }

    if matches!(media_type, crate::types::MediaType::Video) {
        let vcodec = match settings.target_format.as_str() {
            "mp4" => "libx264",
            "mp4-hevc" => "libx265",
            "webm" => "libvpx-vp9",
            _ => "copy",
        };
        args.push("-c:v".to_string());
        args.push(vcodec.to_string());

        let crf = 51 - (settings.quality as f32 * 0.51) as u8;
        args.push("-crf".to_string());
        args.push(crf.to_string());

        if let Some(ref speed) = settings.speed {
            if vcodec == "libx264" || vcodec == "libx265" {
                args.push("-preset".to_string());
                args.push(speed.clone());
            } else if vcodec == "libvpx-vp9" {
                args.push("-deadline".to_string());
                match speed.as_str() {
                    "ultrafast" => {
                        args.push("realtime".to_string());
                        args.push("-cpu-used".to_string());
                        args.push("8".to_string());
                    }
                    "veryslow" => {
                        args.push("best".to_string());
                    }
                    _ => {
                        args.push("good".to_string());
                        args.push("-cpu-used".to_string());
                        args.push("2".to_string());
                    }
                }
            }
        }

        if let Some(fps) = settings.fps {
            if fps > 0 {
                args.push("-r".to_string());
                args.push(fps.to_string());
            }
        }

        if let Some(resize) = &settings.resize {
            if resize.enabled {
                let w = resize.width.unwrap_or(0);
                let h = resize.height.unwrap_or(0);

                let scale_filter = if resize.maintain_aspect_ratio {
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
        let bitrate = 32 + (settings.quality as f32 * 2.88) as u32;
        args.push("-b:a".to_string());
        args.push(format!("{}k", bitrate));
    }

    if let Some(channels) = settings.audio_channels {
        if channels > 0 {
            args.push("-ac".to_string());
            args.push(channels.to_string());
        }
    }

    args.push(output_path.to_string_lossy().to_string());

    let cmd = app_handle.shell().command("ffmpeg").args(&args);

    struct ChildGuard {
        child: Option<tauri_plugin_shell::process::CommandChild>,
    }

    impl Drop for ChildGuard {
        fn drop(&mut self) {
            if let Some(child) = self.child.take() {
                let _ = child.kill();
            }
        }
    }

    let (mut rx, child) = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(format!(
            "Failed to spawn ffmpeg: {}. Please install FFmpeg and verify it is available on your system's PATH.",
            e
        )),
    };

    let mut guard = ChildGuard { child: Some(child) };

    let mut exit_code = None;
    let mut duration_secs: Option<f64> = None;
    let item_id_owned = item_id.to_string();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                if let Ok(output) = String::from_utf8(bytes) {
                    for line in output.lines() {
                        if let Some(usec_str) = line.trim().strip_prefix("out_time_usec=") {
                            if let Ok(usec) = usec_str.trim().parse::<u64>() {
                                if let Some(total) = duration_secs {
                                    let total_usec = (total * 1_000_000.0) as u64;
                                    if total_usec > 0 {
                                        let percent = ((usec as f64 / total_usec as f64) * 100.0).min(100.0);
                                        let _ = app_handle.emit("conversion:progress", serde_json::json!({
                                            "id": item_id_owned.clone(),
                                            "percent": percent as f32,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                if let Ok(output) = String::from_utf8(bytes) {
                    for line in output.lines() {
                        if duration_secs.is_none() {
                            let trimmed = line.trim();
                            if let Some(dur_line) = trimmed.strip_prefix("Duration:") {
                                if let Some(end) = dur_line.find(',') {
                                    let time_str = dur_line[..end].trim();
                                    duration_secs = parse_ffmpeg_time(time_str);
                                }
                            }
                        }
                    }
                }
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
            }
            _ => {}
        }
    }

    // Disarm the guard on success / termination
    guard.child.take();

    match exit_code {
        Some(0) => Ok(output_path.to_path_buf()),
        Some(code) => Err(format!("FFmpeg failed with exit code: {:?}", code)),
        None => Err("FFmpeg terminated unexpectedly without exit code".to_string()),
    }
}
