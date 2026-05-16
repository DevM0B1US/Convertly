import { RefreshCw, ChevronDown, Image as ImageIcon, Film, Music, Plus } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useQueueStore } from "../../stores/queueStore";
import { TargetFormat } from "../../types/file";
import { useState, useMemo, useEffect } from "react";

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

  const queueItems = useQueueStore((state) => state.items);
  const mediaTypes = useMemo(() => {
    const types = new Set(queueItems.map((i) => i.mediaType));
    return types;
  }, [queueItems]);

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
    <div className="w-full bg-surface border border-border rounded-lg mb-8">
      <div className="flex items-center justify-center h-32 gap-10">
        
        {/* Source: Add Files Button */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-bold text-muted uppercase tracking-[0.2em]">Source</span>
          <button
            onClick={onBrowse}
            className="flex flex-col items-center justify-center w-28 h-20 rounded-lg border-2 border-dashed border-muted/20 bg-muted/5 hover:border-primary/40 hover:bg-primary/5 transition-all group"
          >
            <Plus size={24} className="text-muted group-hover:text-primary transition-colors" />
            <span className="text-[10px] font-bold text-muted mt-1 uppercase tracking-wider group-hover:text-primary">Add Files</span>
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
              onClick={availableFormats.length > 1 ? () => setIsOpen(!isOpen) : undefined}
              className="flex items-center justify-center w-28 h-20 rounded-lg border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors group px-2"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="text-primary">
                  {getIcon(currentType)}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-text uppercase">
                    {currentFormat?.label ?? "—"}
                  </span>
                  {availableFormats.length > 1 && (
                    <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isOpen && availableFormats.length > 1 && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-1 max-h-64 overflow-y-auto">
                  {availableFormats.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => {
                        setGlobalFormat(f.value);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                        globalFormat === f.value
                          ? 'bg-primary text-white'
                          : 'hover:bg-muted/5 text-text'
                      }`}
                    >
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
