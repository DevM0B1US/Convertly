import { QueueItem } from "../queue/QueueItem";
import { SettingsPanel } from "../settings/SettingsPanel";
import { useQueueStore } from "../../stores/queueStore";
import { useFileDrop } from "../../hooks/useFileDrop";
import { open } from "@tauri-apps/plugin-dialog";
import { addFiles } from "../../lib/ipc";

export const SplitPane = () => {
  const items = useQueueStore((state) => state.items);
  const addFilesToQueue = useQueueStore((state) => state.addFiles);
  const { isHovering } = useFileDrop();

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Media',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'mp4', 'webm', 'mkv', 'mov', 'avi', 'mp3', 'wav', 'flac']
        }]
      });
      
      if (selected && Array.isArray(selected) && selected.length > 0) {
        const files = selected as string[];
        const newItems = await addFiles(files);
        addFilesToQueue(newItems);
      } else if (selected && !Array.isArray(selected)) {
        const newItems = await addFiles([selected as string]);
        addFilesToQueue(newItems);
      }
    } catch (err) {
      console.error("Failed to select files:", err);
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Left panel (Queue) - 80% */}
      <div className="flex-[4] p-4 overflow-y-auto">
        <div 
          onClick={handleBrowse}
          className={`border-2 border-dashed rounded-lg h-32 flex items-center justify-center transition-colors mb-4 cursor-pointer
            ${isHovering 
              ? 'border-primary bg-primary/5 text-primary' 
              : 'border-dropzone-border text-muted hover:bg-hover-bg'}`}
        >
          Drop files here or click to browse
        </div>
        
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="text-center text-muted text-sm mt-8">
              Your queue is empty.
            </div>
          ) : (
            items.map((item) => (
              <QueueItem
                key={item.id}
                id={item.id}
                name={item.fileName}
                size={(item.sizeBytes / 1024 / 1024).toFixed(2) + " MB"}
                format={`${item.settings?.targetFormat || "default"} - ${item.settings?.quality || 85}%`}
                status={item.status}
                progress={item.progress}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel (Settings) - 20% */}
      <SettingsPanel />
    </div>
  );
};
