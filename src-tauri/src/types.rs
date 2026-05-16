use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueuedFile {
    pub id: Uuid,
    pub path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "mediaType")]
    pub media_type: MediaType,
    pub metadata: FileMetadata,
    #[serde(default)]
    pub settings: Option<ConversionSettings>,
    #[serde(default, rename = "sourceDir")]
    pub source_dir: Option<String>,
    pub status: ConversionStatus,
    #[serde(default)]
    pub progress: Option<f32>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum MediaType {
    Image,
    Video,
    Audio,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub format: String,
    #[serde(default)]
    pub codec: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub duration_secs: Option<f64>,
    #[serde(default)]
    pub bitrate_kbps: Option<u64>,
    #[serde(default)]
    pub sample_rate: Option<u32>,
    #[serde(default)]
    pub channels: Option<u8>,
    pub has_metadata: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversionSettings {
    pub target_format: String,
    pub quality: u8,
    #[serde(default)]
    pub resize: Option<ResizeConfig>,
    pub strip_metadata: bool,
}

impl Default for ConversionSettings {
    fn default() -> Self {
        Self {
            target_format: "webp".to_string(),
            quality: 85,
            resize: None,
            strip_metadata: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResizeConfig {
    pub enabled: bool,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    pub maintain_aspect_ratio: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ConversionStatus {
    Queued,
    Converting,
    Paused,
    Done,
    Error,
}
