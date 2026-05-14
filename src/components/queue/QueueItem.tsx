import { MoreVertical, Film, Music, Image as ImageIcon, FileText, Trash2 } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useState } from "react";
import { TargetFormat } from "../../types/file";
import { cancelConversion } from "../../lib/ipc";

interface QueueItemProps {
  id: string;
  name: string;
  size: string;
  format: string;
  status: "queued" | "converting" | "paused" | "done" | "error";
  progress?: number;
}

export const QueueItem = ({ id, name, size, format, status, progress }: QueueItemProps) => {
  const removeFile = useQueueStore((state) => state.removeFile);
  const updateItem = useQueueStore((state) => state.updateItem);
  const [expanded, setExpanded] = useState(false);
  
  const globalFormat = useSettingsStore(state => state.globalFormat);
  const globalQuality = useSettingsStore(state => state.globalQuality);
  
  const item = useQueueStore(state => state.items.find(i => i.id === id));
  const itemFormat = item?.settings?.targetFormat || globalFormat;
  const itemQuality = item?.settings?.quality || globalQuality;

  const handleFormatChange = (newFormat: TargetFormat) => {
    updateItem(id, {
      settings: {
        ...(item?.settings || { quality: globalQuality, resize: null, stripMetadata: false }),
        targetFormat: newFormat
      }
    });
  };

  const handleQualityChange = (newQuality: number) => {
    updateItem(id, {
      settings: {
        ...(item?.settings || { targetFormat: globalFormat, resize: null, stripMetadata: false }),
        quality: newQuality
      }
    });
  };

  const ext = name.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
  const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext);
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'].includes(ext);

  let Icon = FileText;
  let iconBg = "bg-accent"; // Default orange

  if (isVideo) {
    Icon = Film;
    iconBg = "bg-primary";
  } else if (isAudio) {
    Icon = Music;
    iconBg = "bg-secondary";
  } else if (isImage) {
    Icon = ImageIcon;
    iconBg = "bg-primary"; // Or a split gradient if possible, using solid for now
  }

  // Image special case for gradient background
  const finalIconBgStyle = isImage ? { background: 'linear-gradient(135deg, #FF9F1C 50%, #0A7C6E 50%)' } : {};

  return (
    <div className="flex flex-col bg-white rounded-lg transition-colors py-2">
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-4 flex-1">
          {/* File Type Icon */}
          <div 
            className={`relative w-12 h-12 rounded flex items-center justify-center text-white shrink-0 ${iconBg}`}
            style={isImage ? finalIconBgStyle : undefined}
          >
            <Icon size={24} stroke="currentColor" fill="none" className={isImage ? "text-white" : ""} />
            {isImage && (
              <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="white" className="absolute">
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            )}
          </div>

          {/* File Details */}
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-bold text-[15px] text-gray-800 truncate">{name}</span>
            <span className="text-xs text-gray-500">{size} • {format}</span>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Status Badge */}
          {status === "queued" && (
            <div className="px-4 py-1.5 rounded-full bg-secondary text-white text-sm font-semibold shadow-sm">
              Queued
            </div>
          )}
          {status === "converting" && (
            <div className="px-4 py-1.5 rounded-full bg-primary text-white text-sm font-semibold shadow-sm">
              Converting... ({progress || 0}%)
            </div>
          )}
          {status === "done" && (
            <div className="px-4 py-1.5 rounded-full bg-accent text-white text-sm font-semibold shadow-sm">
              done
            </div>
          )}
          {status === "error" && (
            <div className="px-4 py-1.5 rounded-full bg-red-500 text-white text-sm font-semibold shadow-sm">
              failed
            </div>
          )}

          {/* 3-dots Menu */}
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-600 hover:text-gray-900 rounded hover:bg-gray-100 transition-colors"
          >
            <MoreVertical size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Expanded Menu (Settings Override & Delete) */}
      {expanded && (
        <div className="mx-2 mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md flex gap-4 items-center">
          {status === "queued" && (
            <>
              <div className="flex-1">
                <select 
                  value={itemFormat}
                  onChange={(e) => handleFormatChange(e.target.value as TargetFormat)}
                  className="w-full bg-white border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-primary"
                >
                  <option value="webp">WebP</option>
                  <option value="mp4">MP4</option>
                  <option value="mp3">MP3</option>
                </select>
              </div>
              <div className="flex-1">
                <input 
                  type="range" 
                  min="1" max="100" 
                  value={itemQuality}
                  onChange={(e) => handleQualityChange(Number(e.target.value))}
                  className="w-full accent-primary" 
                />
              </div>
            </>
          )}
          
          <button 
            onClick={() => {
              if (status === "converting" || status === "paused") cancelConversion(id);
              removeFile(id);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded text-sm font-medium transition-colors ml-auto"
          >
            <Trash2 size={16} />
            Remove
          </button>
        </div>
      )}
    </div>
  );
};
