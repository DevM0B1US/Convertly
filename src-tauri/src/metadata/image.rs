use std::path::Path;
use image::ImageReader;
use crate::types::FileMetadata;

pub fn extract_image_metadata(path: &Path, extension: &str) -> FileMetadata {
    let mut metadata = FileMetadata {
        format: extension.to_string(),
        codec: Some(extension.to_string()),
        ..Default::default()
    };

    let ext = extension.to_lowercase();
    if ext == "heic" || ext == "heif" {
        if let Ok(ctx) = libheif_rs::HeifContext::read_from_file(path.to_str().unwrap_or("")) {
            if let Ok(handle) = ctx.primary_image_handle() {
                metadata.width = Some(handle.width());
                metadata.height = Some(handle.height());
            }
        }
    } else if ext == "jxl" {
        if let Ok(image) = jxl_oxide::JxlImage::builder().open(path) {
            metadata.width = Some(image.width());
            metadata.height = Some(image.height());
        }
    } else if ext == "svg" || ext == "svgz" {
        if let Ok(svg_data) = std::fs::read(path) {
            let opt = resvg::usvg::Options::default();
            if let Ok(rtree) = resvg::usvg::Tree::from_data(&svg_data, &opt) {
                let size = rtree.size();
                metadata.width = Some(size.width() as u32);
                metadata.height = Some(size.height() as u32);
            }
        }
    } else if matches!(ext.as_str(), 
        "nef" | "nrw" | "cr2" | "crw" | "cr3" | "arw" | "srf" | "sr2" |
        "orf" | "raf" | "rw2" | "dng" | "pef" | "mrw" | "mef" | "srw" |
        "erf" | "kdc" | "dcs" | "dcr" | "3fr" | "iiq" | "mos" | "ari"
    ) {
        if let Ok(mut file) = std::fs::File::open(path) {
            if let Ok(raw) = rawloader::decode(&mut file) {
                metadata.width = Some(raw.width as u32);
                metadata.height = Some(raw.height as u32);
            }
        }
    } else {
        if let Ok(reader) = ImageReader::open(path) {
            if let Ok(dimensions) = reader.into_dimensions() {
                metadata.width = Some(dimensions.0);
                metadata.height = Some(dimensions.1);
            }
        }
    }

    metadata
}
