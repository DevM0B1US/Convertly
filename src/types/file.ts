export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif',
  'dds', 'exr', 'ff', 'farbfeld', 'hdr', 'ico', 'cur',
  'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'qoi', 'tga', 'tpic',
  'heic', 'heif', 'jxl', 'svg', 'svgz',
  'nef', 'nrw', 'cr2', 'crw', 'cr3', 'arw', 'srf', 'sr2',
  'orf', 'raf', 'rw2', 'dng', 'pef', 'mrw', 'mef',
  'srw', 'erf', 'kdc', 'dcs', 'dcr', '3fr', 'iiq', 'mos', 'ari', 'icns'
];

export const VIDEO_EXTENSIONS = [
  'mp4', 'mov', 'webm', 'avi', 'mkv',
  'flv', 'f4v', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg',
  'vob', 'm4v', '3gp', '3g2', 'ogv', 'wmv', 'mxf',
  'rm', 'rmvb', 'h264', '264', 'h265', 'hevc', '265', 'divx', 'swf'
];

export const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma',
  'opus', 'oga', 'aiff', 'aifc', 'aif', 'ac3', 'alac',
  'amr', 'mp1', 'mp2', 'mpc', 'au',
  'dsd', 'dsf', 'dff', 'mqa'
];

export const DOCUMENT_EXTENSIONS = [
  'docx', 'doc', 'md', 'markdown', 'html', 'htm', 'rtf',
  'csv', 'tsv', 'json', 'rst', 'epub', 'odt', 'docbook'
];

export type TargetFormat = 
  // Images
  | "webp" | "avif" | "png" | "jpeg" | "gif" | "bmp" | "tiff"
  | "hdr" | "ico" | "qoi" | "ff" | "farbfeld" | "heic"
  // Videos
  | "mp4" | "mp4-hevc" | "webm" | "avi" | "mkv" | "mov"
  | "flv" | "f4v" | "ts" | "mts" | "m2ts" | "mpg" | "mpeg"
  | "vob" | "m4v" | "3gp" | "3g2" | "ogv" | "wmv" | "mxf"
  | "rm" | "rmvb" | "divx" | "swf"
  // Audios
  | "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "wma"
  | "opus" | "oga" | "aiff" | "ac3" | "alac" | "amr" | "mp1" | "mp2" | "mpc" | "au"
  // Documents
  | "docx" | "odt" | "md" | "html" | "rtf" | "csv" | "tsv" | "json" | "rst" | "epub" | "docbook";

export type MediaType = "Image" | "Video" | "Audio" | "Document" | "Unknown";

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
  bitDepth: number | null;
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
