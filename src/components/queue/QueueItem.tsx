import { Trash2, Play, Pause, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useState } from "react";
import { TargetFormat } from "../../types/file";
import { cancelConversion, pauseConversion } from "../../lib/ipc";

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
  
  // Using global settings as fallback
  const globalFormat = useSettingsStore(state => state.globalFormat);
  const globalQuality = useSettingsStore(state => state.globalQuality);
  
  // Get this specific item's settings
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

  return (
    <div className="flex flex-col border border-border rounded-lg bg-surface hover:bg-hover-bg transition-colors">
      <div className="flex items-center justify-between p-3">
        <div className="flex flex-col flex-1">
          <span className="font-medium text-sm truncate">{name}</span>
          <div className="flex items-center gap-2 text-xs text-muted mt-1 font-mono">
            <span>{size}</span>
            <span>•</span>
            <span>{itemFormat.toUpperCase()}</span>
          </div>
          
          {status === "converting" && (
            <div className="mt-2 w-full max-w-xs">
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-out" 
                  style={{ width: `${progress || 0}%` }}
                />
              </div>
            </div>
          )}
          {status === "done" && <span className="text-xs text-success mt-1">Complete</span>}
          {status === "error" && <span className="text-xs text-error mt-1">Failed</span>}
        </div>

        <div className="flex items-center gap-1">
          {status === "queued" && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className={`p-1.5 rounded transition-colors ${expanded ? 'text-primary bg-primary/10' : 'text-muted hover:text-text hover:bg-border'}`}
            >
              <Settings2 size={16} />
            </button>
          )}
          {status === "converting" && (
            <button 
              onClick={() => pauseConversion(id)}
              className="p-1.5 text-muted hover:text-text rounded hover:bg-border transition-colors"
            >
              <Pause size={16} />
            </button>
          )}
          {status === "paused" && (
            <button 
              className="p-1.5 text-muted hover:text-text rounded hover:bg-border transition-colors"
            >
              <Play size={16} />
            </button>
          )}
          <button 
            onClick={() => {
              cancelConversion(id);
              removeFile(id);
            }}
            className="p-1.5 text-muted hover:text-error rounded hover:bg-border transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {expanded && status === "queued" && (
        <div className="p-3 border-t border-border bg-background/50 flex gap-4">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted mb-1 block">Override Format</label>
            <select 
              value={itemFormat}
              onChange={(e) => handleFormatChange(e.target.value as TargetFormat)}
              className="w-full bg-surface border border-border rounded p-1 text-xs outline-none focus:border-primary"
            >
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="mp4">MP4 (H.264)</option>
              <option value="mp3">MP3</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted mb-1 block">Quality: {itemQuality}</label>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={itemQuality}
              onChange={(e) => handleQualityChange(Number(e.target.value))}
              className="w-full accent-primary mt-1" 
            />
          </div>
        </div>
      )}
    </div>
  );
};
