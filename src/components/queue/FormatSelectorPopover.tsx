import { Search, X } from "lucide-react";
import { TargetFormat } from "../../types/file";
import { useState } from "react";

interface FormatSelectorPopoverProps {
  onSelect: (format: TargetFormat) => void;
  onClose: () => void;
  currentFormat: string;
  sourceType?: 'image' | 'video' | 'audio';
}

type CategoryId = 'image' | 'video' | 'audio';

const IMAGE_FORMATS = ['AVIF', 'BMP', 'GIF', 'JPEG', 'JPG', 'PNG', 'TIFF', 'WEBP'];
const VIDEO_FORMATS = ['MP4', 'WEBM', 'MKV', 'MOV', 'AVI'];
const AUDIO_FORMATS = ['MP3', 'WAV', 'FLAC', 'OGG', 'M4A', 'AAC'];

const CATEGORIES: { id: CategoryId; label: string; formats: string[] }[] = [
  { id: 'image', label: 'Image', formats: IMAGE_FORMATS },
  { id: 'video', label: 'Video', formats: VIDEO_FORMATS },
  { id: 'audio', label: 'Audio', formats: AUDIO_FORMATS },
];

export const FormatSelectorPopover = ({ onSelect, onClose, currentFormat, sourceType }: FormatSelectorPopoverProps) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(sourceType ?? 'image');

  const visibleCategories = sourceType
    ? CATEGORIES.filter((c) => c.id === sourceType)
    : CATEGORIES;

  const currentFormats = (
    CATEGORIES.find((c) => c.id === activeCategory)?.formats ?? []
  ).filter((f) => f.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="absolute top-full right-0 mt-2 w-[320px] bg-surface/90 backdrop-blur-md border border-border rounded-xl shadow-2xl z-100 flex flex-col overflow-hidden">
      {/* Search Header */}
      <div className="flex items-center gap-2 p-2.5 border-b border-border bg-background/40">
        <Search size={14} className="text-muted" />
        <input
          autoFocus
          type="text"
          placeholder="Search Format"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-xs font-medium text-text placeholder:text-muted"
        />
      </div>

      <div className="flex h-[200px]">
        {/* Sidebar Categories - only show when multiple are available */}
        {visibleCategories.length > 1 && (
          <div className="w-1/3 border-r border-border bg-muted/5 p-1 flex flex-col gap-0.5">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as 'image' | 'video' | 'audio')}
                className={`flex items-center justify-between px-2 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeCategory === cat.id 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-text hover:bg-muted/10'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-40">&gt;</span>
              </button>
            ))}
          </div>
        )}

        {/* Formats Grid */}
        <div className={visibleCategories.length > 1 ? "w-2/3 p-2.5 overflow-y-auto" : "w-full p-2.5 overflow-y-auto"}>
          <div className={`grid gap-1.5 ${visibleCategories.length > 1 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {currentFormats.map((format) => (
              <button
                key={format}
                onClick={() => onSelect(format.toLowerCase() as TargetFormat)}
                className={`p-2 rounded-md border text-xs font-bold transition-all duration-150 cursor-pointer ${
                  currentFormat.toLowerCase() === format.toLowerCase()
                    ? 'bg-primary border-primary text-white shadow-md'
                    : 'bg-surface border-border text-text hover:border-primary/50 hover:bg-primary/5'
                }`}
              >
                {format}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end p-2 border-t border-border bg-muted/5">
        <button
          onClick={onClose}
          className="p-1 text-muted hover:text-text hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
