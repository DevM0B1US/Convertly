import { Film, Music, Image as ImageIcon, FileText, X, ChevronDown, RefreshCw } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { TargetFormat } from "../../types/file";
import { cancelConversion, startConversion } from "../../lib/ipc";
import { useState, useRef, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FormatSelectorPopover } from "./FormatSelectorPopover";

interface QueueItemProps {
  id: string;
  name: string;
  size: string;
  status: "queued" | "converting" | "paused" | "done" | "error";
  progress?: number;
}

export const QueueItem = ({ id, name, size, status, progress }: QueueItemProps) => {
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
  
  const item = useQueueStore(state => state.items.find(i => i.id === id));
  const targetFormat = (item?.settings?.targetFormat || globalFormat).toUpperCase();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [id, item?.path]);

  const ext = name.split('.').pop()?.toLowerCase() || '';
  const sourceFormat = ext.toUpperCase();

  const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
  const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext);
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'].includes(ext);

  let Icon = FileText;
  if (isVideo) Icon = Film;
  else if (isAudio) Icon = Music;
  else if (isImage) Icon = ImageIcon;

  const handleRemove = () => {
    if (status === "converting" || status === "paused") cancelConversion(id);
    removeFile(id);
  };

  const handleConvert = async () => {
    if (!item) return;
    updateItem(id, { status: "queued", error: undefined });
    const settings = item.settings || {
      targetFormat: globalFormat,
      quality: globalQuality,
      resize: globalResize,
      stripMetadata: globalStripMetadata,
      fps: globalFps,
      audioChannels: globalAudioChannels,
      speed: globalSpeed,
    };
    await startConversion([{ ...item, settings }], outputDir || undefined);
  };

  const handleFormatChange = (newFormat: TargetFormat) => {
    updateItem(id, {
      settings: {
        ...(item?.settings || { quality: globalQuality, resize: null, stripMetadata: false, targetFormat: globalFormat }),
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
    <div className="relative bg-surface border border-border rounded-lg hover:shadow-md hover:scale-[1.005] hover:border-border/80 transition-all duration-200">
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        {/* File Type Icon / Preview */}
        <div className="w-12 h-12 rounded-xl bg-muted/5 flex items-center justify-center text-muted shrink-0 overflow-hidden relative border border-border/45 shadow-sm">
          {isImage && item?.path && !imageError ? (
            <img 
              src={convertFileSrc(item.path)} 
              alt={name} 
              className="w-full h-full object-cover select-none pointer-events-none"
              onError={() => setImageError(true)}
            />
          ) : (
            <Icon size={24} className="text-muted" />
          )}
        </div>

        {/* File Details */}
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-semibold text-sm text-text truncate">{name}</span>
          <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
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
};
