export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'];

export type TargetFormat = 
  | "webp" | "avif" | "png" | "jpeg" | "gif" | "bmp" | "tiff"
  | "mp4" | "mp4-hevc" | "webm" | "avi" | "mkv" | "mov"
  | "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "wma";

export type MediaType = "Image" | "Video" | "Audio" | "Unknown";

export interface ResizeConfig {
  enabled: boolean;
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
}

export interface ConversionSettings {
  targetFormat: TargetFormat;
  quality: number; // 1-100
  resize: ResizeConfig | null;
  stripMetadata: boolean;
  fps?: number | null; // null = Keep Original
  audioChannels?: number | null; // null = Keep Original, 1 = Mono, 2 = Stereo
  speed?: "ultrafast" | "medium" | "veryslow" | null; // null = Medium
  hwAccel?: "none" | "nvenc" | "qsv" | "vaapi" | "videotoolbox" | null;
}

export interface FileMetadata {
  format: string;
  codec: string | null;
  width: number | null;
  height: number | null;
  durationSecs: number | null;
  bitrateKbps: number | null;
  sampleRate: number | null;
  channels: number | null;
  hasMetadata: boolean;
}

export type ConversionStatus = "queued" | "converting" | "paused" | "done" | "error";

export interface QueuedFile {
  id: string;
  path: string;
  fileName: string;
  sizeBytes: number;
  mediaType: MediaType;
  metadata: FileMetadata;
  settings: ConversionSettings | null; // null means use global
  sourceDir?: string;
  status: ConversionStatus;
  progress?: number;
  error?: string;
}
