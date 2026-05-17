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

#[derive(Debug, Clone, Default)]
pub struct HwCapabilities {
    pub has_nvenc: bool,
    pub has_qsv: bool,
    pub has_vaapi: bool,
    pub has_videotoolbox: bool,
}

pub async fn probe_hw_capabilities() -> HwCapabilities {
    tokio::task::spawn_blocking(|| {
        let mut caps = HwCapabilities::default();
        if let Ok(output) = std::process::Command::new("ffmpeg")
            .arg("-encoders")
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            caps.has_nvenc = stdout.contains("nvenc");
            caps.has_qsv = stdout.contains("qsv");
            caps.has_vaapi = stdout.contains("vaapi");
            caps.has_videotoolbox = stdout.contains("videotoolbox");
        }
        caps
    })
    .await
    .unwrap_or_default()
}

fn is_audio_codec_compatible(input_codec: Option<&str>, target_format: &str) -> bool {
    let codec = match input_codec {
        Some(c) => c.to_lowercase(),
        None => return false, // If unknown, transcode to be safe
    };
    let fmt = target_format.to_lowercase();
    if fmt == "webm" {
        // WebM container only supports Vorbis or Opus audio codecs
        codec == "opus" || codec == "vorbis" || codec == "libopus" || codec == "libvorbis"
    } else if fmt == "mp4" || fmt == "mp4-hevc" {
        // MP4 supports aac, mp3, ac3, etc. but not typical WebM or lossless formats easily
        codec == "aac" || codec == "mp3" || codec == "ac3" || codec == "m4a"
    } else {
        // For MKV or others, copy is usually robust
        true
    }
}

pub async fn convert_media(
    app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    media_type: &crate::types::MediaType,
    item_id: &str,
    input_codec: Option<String>,
) -> Result<PathBuf, String> {
    let caps = probe_hw_capabilities().await;
    let base_target = match settings.target_format.as_str() {
        "mp4" => "h264",
        "mp4-hevc" => "hevc",
        "webm" => "vp9",
        _ => "copy",
    };

    let has_video_modifications = settings.fps.is_some() || settings.resize.as_ref().map_or(false, |r| r.enabled);

    let can_stream_copy_video = if let Some(ref codec) = input_codec {
        let clean_codec = codec.to_lowercase();
        if !has_video_modifications {
            (base_target == "h264" && (clean_codec.contains("h264") || clean_codec.contains("avc"))) ||
            (base_target == "hevc" && (clean_codec.contains("hevc") || clean_codec.contains("h265"))) ||
            (base_target == "vp9" && clean_codec.contains("vp9"))
        } else {
            false
        }
    } else {
        false
    };

    let hw_choice = if can_stream_copy_video {
        None
    } else {
        match settings.hw_accel.as_deref() {
            Some("none") => None,
            Some("nvenc") if caps.has_nvenc => Some("nvenc"),
            Some("qsv") if caps.has_qsv => Some("qsv"),
            Some("vaapi") if caps.has_vaapi => Some("vaapi"),
            Some("videotoolbox") if caps.has_videotoolbox => Some("videotoolbox"),
            _ => {
                // "auto" or unspecified: pick best available
                if caps.has_nvenc {
                    Some("nvenc")
                } else if caps.has_videotoolbox {
                    Some("videotoolbox")
                } else if caps.has_qsv {
                    Some("qsv")
                } else if caps.has_vaapi {
                    Some("vaapi")
                } else {
                    None
                }
            }
        }
    };

    let mut args = vec!["-y".to_string()];

    // Add VAAPI device initialization if we are using VAAPI
    if hw_choice == Some("vaapi") && std::path::Path::new("/dev/dri/renderD128").exists() {
        args.push("-vaapi_device".to_string());
        args.push("/dev/dri/renderD128".to_string());
    }

    args.push("-i".to_string());
    args.push(input_path.to_string_lossy().to_string());
    args.push("-progress".to_string());
    args.push("pipe:1".to_string());

    if settings.strip_metadata {
        args.push("-map_metadata".to_string());
        args.push("-1".to_string());
    }

    if matches!(media_type, crate::types::MediaType::Video) {
        let vcodec = if can_stream_copy_video {
            "copy".to_string()
        } else {
            match base_target {
                "h264" => {
                    match hw_choice {
                        Some("nvenc") => "h264_nvenc".to_string(),
                        Some("videotoolbox") => "h264_videotoolbox".to_string(),
                        Some("qsv") => "h264_qsv".to_string(),
                        Some("vaapi") => "h264_vaapi".to_string(),
                        _ => "libx264".to_string(),
                    }
                }
                "hevc" => {
                    match hw_choice {
                        Some("nvenc") => "hevc_nvenc".to_string(),
                        Some("videotoolbox") => "hevc_videotoolbox".to_string(),
                        Some("qsv") => "hevc_qsv".to_string(),
                        Some("vaapi") => "hevc_vaapi".to_string(),
                        _ => "libx265".to_string(),
                    }
                }
                "vp9" => {
                    match hw_choice {
                        Some("qsv") => "vp9_qsv".to_string(),
                        Some("vaapi") => "vp9_vaapi".to_string(),
                        _ => "libvpx-vp9".to_string(),
                    }
                }
                _ => "copy".to_string(),
            }
        };

        args.push("-c:v".to_string());
        args.push(vcodec.clone());

        if !can_stream_copy_video {
            let crf = 51 - (settings.quality as f32 * 0.51) as u8;

            if vcodec == "libx264" || vcodec == "libx265" || vcodec == "libvpx-vp9" {
                args.push("-crf".to_string());
                args.push(crf.to_string());

                let cores = std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(4);
                let threads = (cores * 7 / 10).max(2).min(cores);
                args.push("-threads".to_string());
                args.push(threads.to_string());
            } else if vcodec.contains("nvenc") {
                args.push("-rc".to_string());
                args.push("vbr".to_string());
                args.push("-cq".to_string());
                args.push(crf.to_string());
            } else if vcodec.contains("qsv") {
                args.push("-global_quality".to_string());
                args.push(crf.to_string());
            } else if vcodec.contains("vaapi") {
                args.push("-qp".to_string());
                args.push(crf.to_string());
            } else if vcodec.contains("videotoolbox") {
                args.push("-q:v".to_string());
                args.push(settings.quality.to_string());
            }

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
                } else if vcodec.contains("nvenc") {
                    let nv_preset = match speed.as_str() {
                        "ultrafast" | "superfast" | "veryfast" => "p1",
                        "faster" | "fast" => "p3",
                        "medium" => "p4",
                        "slow" | "slower" => "p6",
                        "veryslow" => "p7",
                        _ => "p4",
                    };
                    args.push("-preset".to_string());
                    args.push(nv_preset.to_string());
                } else if vcodec.contains("qsv") {
                    let qsv_preset = match speed.as_str() {
                        "ultrafast" | "superfast" | "veryfast" => "veryfast",
                        "faster" | "fast" => "fast",
                        "medium" => "medium",
                        "slow" | "slower" => "slow",
                        "veryslow" => "veryslow",
                        _ => "medium",
                    };
                    args.push("-preset".to_string());
                    args.push(qsv_preset.to_string());
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

        // Fast & lossless audio stream copy for video when audio channels are unmodified
        if settings.audio_channels.is_none() {
            let codec_compatible = is_audio_codec_compatible(input_codec.as_deref(), settings.target_format.as_str());
            args.push("-c:a".to_string());
            if codec_compatible {
                args.push("copy".to_string());
            } else {
                let target_fmt = settings.target_format.as_str().to_lowercase();
                if target_fmt == "webm" {
                    args.push("libopus".to_string());
                } else {
                    args.push("aac".to_string());
                }
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

    let pid = child.pid();

    #[cfg(unix)]
    {
        let _ = std::process::Command::new("renice")
            .args(["-n", "10", "-p", &pid.to_string()])
            .spawn();
    }

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("powershell")
            .args([
                "-Command",
                &format!("(Get-Process -Id {}).PriorityClass = 'BelowNormal'", pid),
            ])
            .spawn();
    }

    let mut guard = ChildGuard { child: Some(child) };

    let mut exit_code = None;
    let mut duration_secs: Option<f64> = None;
    let item_id_owned = item_id.to_string();

    loop {
        let event_opt = tokio::time::timeout(
            tokio::time::Duration::from_secs(30),
            rx.recv()
        ).await;

        match event_opt {
            Ok(Some(event)) => {
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
            Ok(None) => {
                break;
            }
            Err(_) => {
                return Err("FFmpeg process timed out due to inactivity (30s)".to_string());
            }
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
