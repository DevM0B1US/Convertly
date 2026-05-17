use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FormatCategory {
    Image,
    Video,
    Audio,
    Document,
}

#[derive(Debug, Clone)]
pub struct FormatInfo {
    pub extensions: &'static [&'static str],
    pub label: &'static str,
    pub category: FormatCategory,
    pub can_decode: bool,
    pub can_encode: bool,
}

macro_rules! fmt_info {
    ($exts:expr, $label:expr, $cat:ident) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: true,
            can_encode: true,
        }
    };
    (decode $exts:expr, $label:expr, $cat:ident) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: true,
            can_encode: false,
        }
    };
    (encode $exts:expr, $label:expr, $cat:ident) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: false,
            can_encode: true,
        }
    };
}

macro_rules! decode {
    ($exts:expr, $label:expr, $cat:ident) => {
        FormatInfo {
            extensions: &$exts,
            label: $label,
            category: FormatCategory::$cat,
            can_decode: true,
            can_encode: false,
        }
    };
}

pub static IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "tiff", "tif",
    "dds", "exr", "ff", "farbfeld", "hdr", "ico", "cur",
    "pbm", "pgm", "ppm", "pnm", "pam", "qoi", "tga", "tpic",
    "heic", "heif", "jxl", "svg", "svgz",
    "nef", "nrw", "cr2", "crw", "cr3", "arw", "srf", "sr2",
    "orf", "raf", "rw2", "dng", "pef", "mrw", "mef",
    "srw", "erf", "kdc", "dcs", "dcr", "3fr", "iiq", "mos", "ari", "icns",
];

pub static VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "webm", "mkv", "mov", "avi",
    "flv", "f4v", "ts", "mts", "m2ts", "mpg", "mpeg",
    "vob", "m4v", "3gp", "3g2", "ogv", "wmv", "mxf",
    "rm", "rmvb", "h264", "264", "h265", "hevc", "265", "divx", "swf",
];

pub static AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma",
    "opus", "oga", "aiff", "aifc", "aif", "ac3", "alac",
    "amr", "mp1", "mp2", "mpc", "au",
    "dsd", "dsf", "dff", "mqa",
];

pub static DOCUMENT_EXTENSIONS: &[&str] = &[
    "docx", "doc", "md", "markdown", "html", "htm", "rtf",
    "csv", "tsv", "json", "rst", "epub", "odt", "docbook",
];

pub static ALL_FORMATS: &[FormatInfo] = &[
    // Image Formats
    fmt_info!(["jpg", "jpeg"], "JPEG", Image),
    fmt_info!(["png"], "PNG", Image),
    fmt_info!(["webp"], "WEBP", Image),
    fmt_info!(["avif"], "AVIF", Image),
    fmt_info!(["gif"], "GIF", Image),
    fmt_info!(["bmp"], "BMP", Image),
    fmt_info!(["tiff", "tif"], "TIFF", Image),
    
    // Tier 1 Images
    decode!(["dds"], "DDS", Image),
    decode!(["exr"], "EXR", Image),
    fmt_info!(["ff", "farbfeld"], "Farbfeld", Image),
    fmt_info!(["hdr"], "HDR", Image),
    fmt_info!(["ico", "cur"], "ICO", Image),
    decode!(["pbm", "pgm", "ppm", "pnm", "pam"], "PNM", Image),
    fmt_info!(["qoi"], "QOI", Image),
    decode!(["tga", "tpic"], "TGA", Image),
    
    // Tier 2 Images
    fmt_info!(["heic", "heif"], "HEIC", Image),
    decode!(["jxl"], "JPEG XL", Image),
    decode!(["svg", "svgz"], "SVG", Image),
    
    // Camera RAW (Decode Only)
    decode!(["nef", "nrw", "cr2", "crw", "cr3", "arw", "srf", "sr2",
             "orf", "raf", "rw2", "dng", "pef", "mrw", "mef",
             "srw", "erf", "kdc", "dcs", "dcr", "3fr", "iiq", "mos", "ari"], "Camera RAW", Image),
    
    // Niche Images
    decode!(["icns"], "ICNS", Image),

    // Video Formats
    fmt_info!(["mp4"], "MP4", Video),
    fmt_info!(["webm"], "WEBM", Video),
    fmt_info!(["mkv"], "MKV", Video),
    fmt_info!(["mov"], "MOV", Video),
    fmt_info!(["avi"], "AVI", Video),
    
    // Tier 1 & 2 Videos
    fmt_info!(["flv", "f4v"], "FLV", Video),
    fmt_info!(["ts", "mts", "m2ts"], "MPEG-TS", Video),
    fmt_info!(["mpg", "mpeg", "vob"], "MPEG Video", Video),
    fmt_info!(["m4v"], "M4V", Video),
    fmt_info!(["3gp", "3g2"], "3GP", Video),
    fmt_info!(["ogv"], "Ogg Video", Video),
    fmt_info!(["wmv"], "WMV", Video),
    fmt_info!(["mxf"], "MXF", Video),
    
    // Tier 4 Videos
    fmt_info!(["rm", "rmvb"], "RealMedia", Video),
    decode!(["h264", "264"], "H.264", Video),
    decode!(["h265", "hevc", "265"], "H.265", Video),
    fmt_info!(["divx"], "DIVX", Video),
    fmt_info!(["swf"], "SWF", Video),

    // Audio Formats
    fmt_info!(["mp3"], "MP3", Audio),
    fmt_info!(["wav"], "WAV", Audio),
    fmt_info!(["flac"], "FLAC", Audio),
    fmt_info!(["aac"], "AAC", Audio),
    fmt_info!(["ogg", "oga"], "OGG Audio", Audio),
    fmt_info!(["m4a"], "M4A", Audio),
    fmt_info!(["wma"], "WMA", Audio),
    
    // Tier 1 & 2 Audios
    fmt_info!(["opus"], "OPUS", Audio),
    fmt_info!(["aiff", "aifc", "aif"], "AIFF", Audio),
    fmt_info!(["ac3"], "AC3", Audio),
    fmt_info!(["alac"], "ALAC", Audio),
    fmt_info!(["amr"], "AMR", Audio),
    fmt_info!(["mp1"], "MP1", Audio),
    fmt_info!(["mp2"], "MP2", Audio),
    fmt_info!(["mpc"], "Musepack", Audio),
    fmt_info!(["au"], "AU", Audio),
    
    // Tier 4 Audios
    decode!(["dsd", "dsf", "dff"], "DSD", Audio),
    decode!(["mqa"], "MQA", Audio),

    // Document Formats (Tier 3)
    fmt_info!(["docx", "doc"], "Word", Document),
    fmt_info!(["md", "markdown"], "Markdown", Document),
    fmt_info!(["html", "htm"], "HTML", Document),
    fmt_info!(["rtf"], "RTF", Document),
    fmt_info!(["csv"], "CSV", Document),
    fmt_info!(["tsv"], "TSV", Document),
    fmt_info!(["json"], "JSON", Document),
    fmt_info!(["rst"], "RST", Document),
    fmt_info!(["epub"], "EPUB", Document),
    fmt_info!(["odt"], "ODT", Document),
    fmt_info!(["docbook"], "Docbook", Document),
];

pub fn lookup_format(extension: &str) -> Option<(FormatCategory, &'static str)> {
    let ext = extension.to_lowercase();
    for entry in ALL_FORMATS {
        if entry.extensions.contains(&ext.as_str()) {
            return Some((entry.category, entry.label));
        }
    }
    None
}
