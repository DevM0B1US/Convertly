import { Trash2, Play, Pause, Settings2 } from "lucide-react";
import { useQueueStore } from "../../stores/queueStore";

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

  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-surface hover:bg-hover-bg transition-colors">
      <div className="flex flex-col flex-1">
        <span className="font-medium text-sm truncate">{name}</span>
        <div className="flex items-center gap-2 text-xs text-muted mt-1 font-mono">
          <span>{size}</span>
          <span>•</span>
          <span>{format}</span>
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
      </div>

      <div className="flex items-center gap-1">
        {status === "queued" && (
          <button className="p-1.5 text-muted hover:text-text rounded hover:bg-border transition-colors">
            <Settings2 size={16} />
          </button>
        )}
        <button 
          onClick={() => removeFile(id)}
          className="p-1.5 text-muted hover:text-error rounded hover:bg-border transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};
