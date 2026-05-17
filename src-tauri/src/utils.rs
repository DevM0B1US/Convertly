use std::path::{Path, PathBuf};
use std::collections::HashSet;

/// Safely generates a unique file path by checking if the base path exists on disk
/// or is already reserved in the thread-safe/sequential registry,
/// and appending an incremental suffix (e.g., "filename (1).ext") if needed.
/// Returns an error if the suffix count exceeds 9999 to prevent infinite loops.
pub fn generate_unique_path(
    output_dir: &Path,
    file_stem: &str,
    ext: &str,
    reserved: &HashSet<PathBuf>,
) -> Result<PathBuf, String> {
    let output_path = output_dir.join(format!("{}.{}", file_stem, ext));
    if !output_path.exists() && !reserved.contains(&output_path) {
        return Ok(output_path);
    }

    for i in 1..10000 {
        let candidate = output_dir.join(format!("{} ({}).{}", file_stem, i, ext));
        if !candidate.exists() && !reserved.contains(&candidate) {
            return Ok(candidate);
        }
    }

    Err("Failed to generate a unique filename: duplicate limit reached (9999 files)".to_string())
}
