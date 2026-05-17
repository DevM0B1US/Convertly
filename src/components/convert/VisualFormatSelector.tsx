import { RefreshCw, ChevronDown, Image as ImageIcon, Film, Music, Plus, Files } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useQueueStore } from "../../stores/queueStore";
import { TargetFormat } from "../../types/file";
import { useState, useMemo, useEffect, useRef } from "react";
import { FormatSelectorPopover } from "../queue/FormatSelectorPopover";
import { addFiles } from "../../lib/ipc";
import { getCurrentWindow } from "@tauri-apps/api/window";

const ALL_FORMATS = {
  image: [
    { value: 'webp' as TargetFormat, label: 'WEBP' },
    { value: 'avif' as TargetFormat, label: 'AVIF' },
    { value: 'png' as TargetFormat, label: 'PNG' },
    { value: 'jpeg' as TargetFormat, label: 'JPEG' },
    { value: 'gif' as TargetFormat, label: 'GIF' },
    { value: 'bmp' as TargetFormat, label: 'BMP' },
    { value: 'tiff' as TargetFormat, label: 'TIFF' },
  ],
  video: [
    { value: 'mp4' as TargetFormat, label: 'MP4' },
    { value: 'webm' as TargetFormat, label: 'WEBM' },
    { value: 'avi' as TargetFormat, label: 'AVI' },
    { value: 'mkv' as TargetFormat, label: 'MKV' },
    { value: 'mov' as TargetFormat, label: 'MOV' },
  ],
  audio: [
    { value: 'mp3' as TargetFormat, label: 'MP3' },
    { value: 'flac' as TargetFormat, label: 'FLAC' },
    { value: 'wav' as TargetFormat, label: 'WAV' },
    { value: 'aac' as TargetFormat, label: 'AAC' },
    { value: 'ogg' as TargetFormat, label: 'OGG' },
    { value: 'm4a' as TargetFormat, label: 'M4A' },
  ],
};

interface VisualFormatSelectorProps {
  onBrowse: () => void;
}

export const VisualFormatSelector = ({ onBrowse }: VisualFormatSelectorProps) => {
  const globalFormat = useSettingsStore((state) => state.globalFormat);
  const setGlobalFormat = useSettingsStore((state) => state.setGlobalFormat);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOverBox, setIsDragOverBox] = useState(false);
  const addFilesToQueue = useQueueStore((state) => state.addFiles);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragOverBox(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOverBox(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOverBox(false);
  };

  useEffect(() => {
    const unlistenPromise = getCurrentWindow().onDragDropEvent(async (event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths as string[];
        if (paths && paths.length > 0) {
          try {
            const newItems = await addFiles(paths);
            addFilesToQueue(newItems);
          } catch (err) {
            console.error("Failed to add dropped files natively:", err);
          }
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [addFilesToQueue]);

  const queueItems = useQueueStore((state) => state.items);
  const mediaTypes = useMemo(() => {
    const types = new Set(queueItems.map((i) => i.mediaType));
    return types;
  }, [queueItems]);

  const allTypes = useMemo(() => Array.from(mediaTypes), [mediaTypes]);

  const sourceDisplay = useMemo(() => {
    const count = queueItems.length;
    if (count === 0) {
      return {
        icon: <Plus size={24} className={`transition-all duration-200 ${isDragOverBox ? 'text-primary scale-110' : 'text-muted group-hover/card:text-primary'}`} />,
        label: "Add Files"
      };
    }

    let icon = <Files size={24} className="text-primary group-hover/card:scale-110 transition-transform duration-200" />;
    if (allTypes.length === 1) {
      if (allTypes[0] === "Image") {
        icon = <ImageIcon size={24} className="text-primary group-hover/card:scale-110 transition-transform duration-200" />;
      } else if (allTypes[0] === "Video") {
        icon = <Film size={24} className="text-primary group-hover/card:scale-110 transition-transform duration-200" />;
      } else if (allTypes[0] === "Audio") {
        icon = <Music size={24} className="text-primary group-hover/card:scale-110 transition-transform duration-200" />;
      }
    }

    return {
      icon,
      label: `${count} ${count === 1 ? 'File' : 'Files'}`
    };
  }, [queueItems, allTypes, isDragOverBox]);

  const availableFormats = useMemo(() => {
    if (mediaTypes.size === 0 || mediaTypes.has("Unknown")) {
      return [...ALL_FORMATS.image, ...ALL_FORMATS.video, ...ALL_FORMATS.audio];
    }
    const formats: { value: TargetFormat; label: string }[] = [];
    if (mediaTypes.has("Image")) formats.push(...ALL_FORMATS.image);
    if (mediaTypes.has("Video")) formats.push(...ALL_FORMATS.video);
    if (mediaTypes.has("Audio")) formats.push(...ALL_FORMATS.audio);
    return formats;
  }, [mediaTypes]);

  const currentFormat = availableFormats.find((f) => f.value === globalFormat)
    || availableFormats[0];

  useEffect(() => {
    if (!availableFormats.find((f) => f.value === globalFormat)) {
      setGlobalFormat(availableFormats[0]?.value ?? "webp");
    }
  }, [availableFormats, globalFormat, setGlobalFormat]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <Film size={28} />;
      case 'audio': return <Music size={28} />;
      default: return <ImageIcon size={28} />;
    }
  };

  const currentType = ALL_FORMATS.image.find((f) => f.value === currentFormat?.value) ? 'image'
    : ALL_FORMATS.video.find((f) => f.value === currentFormat?.value) ? 'video'
    : 'audio';

  return (
    <div 
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full rounded-lg mb-8 transition-all duration-300 group/card select-none
        ${isDragOverBox 
          ? 'bg-primary/5 border-2 border-dashed border-primary shadow-[0_0_25px_rgba(10,124,110,0.15)] scale-[1.01]' 
          : 'bg-surface border border-border hover:border-primary/20'}`}
    >
      <div className="flex items-center justify-center h-32 gap-10">
        
        {/* Source: Dynamic Queue Indicator / Add Trigger */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-bold text-muted uppercase tracking-[0.2em]">Source</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBrowse();
            }}
            className={`flex flex-col items-center justify-center w-28 h-20 rounded-lg transition-all duration-300 cursor-pointer outline-none
              ${queueItems.length > 0 
                ? 'border border-solid border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10' 
                : `border-2 border-dashed ${
                    isDragOverBox 
                      ? 'border-primary bg-primary/10 text-primary shadow-[0_0_10px_rgba(10,124,110,0.1)] scale-105' 
                      : 'border-muted/20 bg-muted/5 group-hover/card:border-primary/40 group-hover/card:bg-primary/10'
                  }`}`}
          >
            {sourceDisplay.icon}
            <span className={`text-[10px] font-black mt-1.5 uppercase tracking-wider
              ${queueItems.length > 0 ? 'text-text' : 'text-muted'}`}
            >
              {sourceDisplay.label}
            </span>
          </button>
        </div>

        {/* Transition Arrow */}
        <div className="pt-6">
          <RefreshCw size={20} className="text-muted/30" />
        </div>

        {/* Target: Format Selector */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-bold text-muted uppercase tracking-[0.2em]">Target</span>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (availableFormats.length > 1) {
                  setIsOpen(!isOpen);
                }
              }}
              className="flex items-center justify-center w-28 h-20 rounded-lg border-2 border-accent bg-accent/5 hover:bg-accent/10 transition-colors group px-2 cursor-pointer"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="text-accent">
                  {getIcon(currentType)}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-text uppercase">
                    {currentFormat?.label ?? "—"}
                  </span>
                  {availableFormats.length > 1 && (
                    <ChevronDown size={14} className={`text-accent/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isOpen && availableFormats.length > 1 && (
              <div onClick={(e) => e.stopPropagation()}>
                <FormatSelectorPopover
                  onSelect={(format) => {
                    setGlobalFormat(format);
                    setIsOpen(false);
                    // Reset finished items that inherit the global format to queued
                    useQueueStore.getState().items.forEach(item => {
                      if (item.status === "done" && !item.settings?.targetFormat) {
                        useQueueStore.getState().updateItem(item.id, { status: "queued", progress: 0 });
                      }
                    });
                  }}
                  onClose={() => setIsOpen(false)}
                  currentFormat={globalFormat}
                  sourceType={(() => {
                    if (allTypes.length !== 1) return undefined;
                    const type = allTypes[0].toLowerCase();
                    if (type === 'image' || type === 'video' || type === 'audio') {
                      return type as 'image' | 'video' | 'audio';
                    }
                    return undefined;
                  })()}
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
