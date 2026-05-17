import { Film, Music, Image as ImageIcon, FileText, X, ChevronDown, RefreshCw } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { TargetFormat, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } from "../../types/file";
import { cancelConversion, startConversion } from "../../lib/ipc";
import { useState, useRef, useEffect, memo, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FormatSelectorPopover } from "./FormatSelectorPopover";

interface QueueItemProps {
  id: string;
  name: string;
  size: string;
  status: "queued" | "converting" | "paused" | "done" | "error";
  progress?: number;
  index: number;
}

export const QueueItem = memo(({ id, name, size, status, progress, index }: QueueItemProps) => {
  const removeFile = useQueueStore((state) => state.removeFile);
  const updateItem = useQueueStore((state) => state.updateItem);
  
  const globalFormat = useSettingsStore(state => state.globalFormat);
  const globalQuality = useSettingsStore(state => state.globalQuality);
  const outputDir = useSettingsStore(state => state.outputDir);
  const globalResize = useSettingsStore(state => state.globalResize);
  const globalStripMetadata = useSettingsStore(state => state.globalStripMetadata);
  const globalFps = useSettingsStore(state => state.globalFps);
  const globalAudioChannels = useSettingsStore(state => state.globalAudioChannels);
  const globalSpeed = useSettingsStore(state => state.globalSpeed);
  const maxConcurrent = useSettingsStore(state => state.maxConcurrent);
  
  const item = useQueueStore(state => state.items.find(i => i.id === id));
  const targetFormat = (item?.settings?.targetFormat ?? globalFormat).toUpperCase();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Limit slide-in animation to the first screenful of items (index <= 15)
  // to avoid setting thousands of timers and delaying renders for long lists
  const [shouldAnimate, setShouldAnimate] = useState(() => index <= 15);

  useEffect(() => {
    if (index > 15) return;
    const delay = index * 40;
    const timer = setTimeout(() => {
      setShouldAnimate(false);
    }, delay + 300);
    return () => clearTimeout(timer);
  }, [index]);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [id, item?.path]);

  const ext = name.split('.').pop()?.toLowerCase() || '';
  const sourceFormat = ext.toUpperCase();

  const isVideo = VIDEO_EXTENSIONS.includes(ext);
  const isAudio = AUDIO_EXTENSIONS.includes(ext);
  const isImage = IMAGE_EXTENSIONS.includes(ext);

  let Icon = FileText;
  if (isVideo) Icon = Film;
  else if (isAudio) Icon = Music;
  else if (isImage) Icon = ImageIcon;

  const imageUrl = useMemo(() => {
    if (isImage && item?.path && !imageError) {
      try {
        return convertFileSrc(item.path);
      } catch (err) {
        console.error("Failed to convert image src:", err);
        return null;
      }
    }
    return null;
  }, [isImage, item?.path, imageError]);

  // Handle cached images where browser loads them before React attaches onLoad
  useEffect(() => {
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, [imageUrl]);

  const handleRemove = () => {
    if (status === "converting" || status === "paused") {
      cancelConversion(id).catch((err) => {
        console.error("Failed to cancel conversion:", err);
      });
    }
    removeFile(id);
  };

  const handleConvert = async () => {
    if (!item) return;
    updateItem(id, { status: "queued", error: undefined });
    const settings = {
      targetFormat: item.settings?.targetFormat || globalFormat,
      quality: item.settings?.quality ?? globalQuality,
      resize: item.settings?.resize !== undefined ? item.settings.resize : globalResize,
      stripMetadata: item.settings?.stripMetadata ?? globalStripMetadata,
      fps: item.settings?.fps !== undefined ? item.settings.fps : globalFps,
      audioChannels: item.settings?.audioChannels !== undefined ? item.settings.audioChannels : globalAudioChannels,
      speed: item.settings?.speed !== undefined ? item.settings.speed : globalSpeed,
    };
    await startConversion([{ ...item, settings }], outputDir || undefined, maxConcurrent);
  };

  const handleFormatChange = (newFormat: TargetFormat) => {
    updateItem(id, {
      settings: {
        ...(item?.settings || {
          quality: globalQuality,
          resize: globalResize,
          stripMetadata: globalStripMetadata,
          fps: globalFps,
          audioChannels: globalAudioChannels,
          speed: globalSpeed,
          targetFormat: globalFormat,
        }),
        targetFormat: newFormat
      }
    });
    setIsPopoverOpen(false);
  };

  const getStatusText = () => {
    switch (status) {
      case "converting": return `Converting... ${progress || 0}%`;
      case "queued": return "Waiting...";
      case "done": return "Finished";
      case "error": return "Conversion failed";
      default: return "";
    }
  };

  const friendlyError = item?.error
    ? item.error
        .replace("Failed to open image:", "Couldn't read the file.")
        .replace("Failed to decode image:", "File format not supported or corrupted.")
        .replace("Failed to encode", "Couldn't save as")
        .replace("Failed to spawn ffmpeg:", "FFmpeg not found. Install FFmpeg to convert video/audio.")
        .replace("FFmpeg failed with exit code", "Video/audio conversion failed (FFmpeg error")
        .replace("Failed to guess format:", "Unknown file format.")
        .replace("Unsupported target format:", "This file can't be converted to")
        .replace("Unsupported media format:", "This file can't be converted to")
        .replace("Failed to create output file:", "Couldn't create output file.")
        .replace("Unknown media type", "This file type isn't supported for conversion")
    : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPopoverOpen]);

  return (
    <div 
      className={`relative bg-surface border border-border rounded-lg hover:shadow-md hover:scale-[1.005] hover:border-border/80 transition-[transform,box-shadow,border-color] duration-200 ${shouldAnimate ? 'animate-queue-slide-in' : ''}`}
      style={{
        animationDelay: shouldAnimate ? `${index * 40}ms` : undefined
      }}
    >
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        {/* File Type Icon / Preview */}
        <div className="w-12 h-12 rounded-xl bg-muted/5 flex items-center justify-center text-muted shrink-0 overflow-hidden relative border border-border/45 shadow-sm">
          {imageUrl ? (
            <img 
              ref={imgRef}
              src={imageUrl} 
              alt={name} 
              className={`w-full h-full object-cover select-none pointer-events-none transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onError={() => setImageError(true)}
              onLoad={() => setImageLoaded(true)}
            />
          ) : (
            <Icon size={24} className="text-muted" />
          )}
        </div>

        {/* File Details */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {item?.sourceDir && (
              <span 
                className="text-[10px] font-bold tracking-wider uppercase bg-accent/15 text-accent px-1.5 py-0.5 rounded shrink-0 select-none border border-accent/10 shadow-sm"
                title={`Original folder: ${item.sourceDir}`}
              >
                {item.sourceDir}
              </span>
            )}
            <span className="font-semibold text-sm text-text truncate" title={item?.path || name}>{name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted mt-1">
            <span>{size}</span>
            <span className="opacity-40">•</span>
            <span>{sourceFormat}</span>
          </div>
        </div>

        {/* Actions & Format Transformation */}
        <div className="flex items-center gap-3">
          {status === "queued" && (
            <button 
              onClick={handleConvert}
              className="h-8 px-4 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
            >
              Convert
            </button>
          )}
          {status === "error" && (
            <button 
              onClick={handleConvert}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-error/10 text-error text-xs font-semibold transition-all hover:bg-error/20 active:scale-95 border border-error/20"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          )}
          {status === "done" && (
            <button 
              onClick={handleConvert}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-success/10 text-success text-xs font-semibold transition-all hover:bg-success/20 active:scale-95 border border-success/20"
            >
              <RefreshCw size={14} />
              Reconvert
            </button>
          )}

          <div className="flex items-center gap-2 relative" ref={popoverRef}>
            <div className="flex items-center h-8 px-3 rounded-lg border border-border bg-muted/5">
               <span className="text-xs font-bold text-muted/80">{sourceFormat}</span>
            </div>
            <span className="text-muted/30 text-xs">→</span>
            <button 
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              className={`flex items-center gap-2 h-8 px-3 rounded-lg border transition-all cursor-pointer ${
                isPopoverOpen 
                  ? 'border-accent bg-accent text-white shadow-md' 
                  : 'border-accent/20 bg-accent/5 text-accent hover:border-accent/50'
              }`}
            >
               <span className="text-xs font-bold">{targetFormat}</span>
               <ChevronDown size={14} className={`transition-transform duration-200 ${isPopoverOpen ? 'rotate-180' : ''}`} />
            </button>

            {isPopoverOpen && (
              <FormatSelectorPopover 
                currentFormat={targetFormat}
                onSelect={handleFormatChange}
                onClose={() => setIsPopoverOpen(false)}
                sourceType={isVideo ? 'video' : isAudio ? 'audio' : 'image'}
              />
            )}
          </div>

          <button 
            onClick={handleRemove}
            className="p-1.5 text-muted hover:text-error transition-colors ml-1"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress Info & Bar */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between text-xs font-medium mb-1">
          <span className={status === "error" ? "text-error" : "text-muted"}>
            {getStatusText()}
          </span>
        </div>
        {friendlyError && (
          <p className="text-xs text-error/80 mt-0.5 leading-tight">{friendlyError}</p>
        )}
        <div className="h-1.5 w-full bg-muted/10 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 rounded-full ${
              status === "done" ? "bg-success" : 
              status === "error" ? "bg-error" : 
              "bg-primary"
            }`}
            style={{ width: `${status === "done" ? 100 : progress || 0}%` }}
          />
        </div>
      </div>
    </div>
  );
});

QueueItem.displayName = "QueueItem";
