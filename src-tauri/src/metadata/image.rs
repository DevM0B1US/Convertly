use std::path::Path;
use image::ImageReader;
use crate::types::FileMetadata;

pub fn extract_image_metadata(path: &Path, extension: &str) -> FileMetadata {
    let mut metadata = FileMetadata {
        format: extension.to_string(),
        codec: Some(extension.to_string()),
        ..Default::default()
    };

    if let Ok(reader) = ImageReader::open(path) {
        if let Ok(dimensions) = reader.into_dimensions() {
            metadata.width = Some(dimensions.0);
            metadata.height = Some(dimensions.1);
        }
    }

    metadata
}
