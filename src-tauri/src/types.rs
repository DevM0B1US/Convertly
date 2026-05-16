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
    pub settings: Option<ConversionSettings>,
    pub status: ConversionStatus,
    pub progress: Option<f32>,
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
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_secs: Option<f64>,
    pub bitrate_kbps: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub has_metadata: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversionSettings {
    pub target_format: String,
    pub quality: u8,
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
    pub width: Option<u32>,
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
