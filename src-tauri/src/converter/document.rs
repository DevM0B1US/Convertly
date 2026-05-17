use crate::types::ConversionSettings;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::process::Command;
use tauri::AppHandle;

pub fn convert_document(
    _app_handle: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    settings: &ConversionSettings,
    cancel_flag: std::sync::Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let input_str = input_path.to_string_lossy().to_string();
    let output_str = output_path.to_string_lossy().to_string();

    let target_ext = settings.target_format.to_lowercase();
    
    let from_fmt = match input_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "doc" | "docx" => "docx",
        "markdown" | "md" => "markdown",
        "htm" | "html" => "html",
        "rtf" => "rtf",
        "csv" => "csv",
        "tsv" => "tsv",
        "json" => "json",
        "rst" => "rst",
        "epub" => "epub",
        "odt" => "odt",
        "docbook" => "docbook",
        _ => "markdown",
    };

    let to_fmt = match target_ext.as_str() {
        "doc" | "docx" => "docx",
        "markdown" | "md" => "markdown",
        "htm" | "html" => "html",
        "rtf" => "rtf",
        "csv" => "csv",
        "tsv" => "tsv",
        "json" => "json",
        "rst" => "rst",
        "epub" => "epub",
        "odt" => "odt",
        "docbook" => "docbook",
        _ => target_ext.as_str(),
    };

    let mut cmd = Command::new("pandoc");
    cmd.arg("-f").arg(from_fmt)
       .arg("-t").arg(to_fmt)
       .arg(&input_str)
       .arg("-o").arg(&output_str);

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute pandoc: {}. Please ensure pandoc is installed on your system.", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pandoc conversion failed: {}", stderr));
    }

    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        let _ = std::fs::remove_file(output_path);
        return Err("Cancelled".to_string());
    }

    Ok(output_path.to_path_buf())
}
