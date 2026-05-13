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
  status: ConversionStatus;
  progress?: number;
  error?: string;
}
