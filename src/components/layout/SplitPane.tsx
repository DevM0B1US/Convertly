import { QueueItem } from "../queue/QueueItem";
import { SettingsPanel } from "../settings/SettingsPanel";
import { useQueueStore } from "../../stores/queueStore";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useConversion } from "../../hooks/useConversion";
import { open } from "@tauri-apps/plugin-dialog";
import { addFiles } from "../../lib/ipc";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

export const SplitPane = () => {
  const items = useQueueStore((state) => state.items);
  const addFilesToQueue = useQueueStore((state) => state.addFiles);
  const reorderQueue = useQueueStore((state) => state.reorder);
  const { isHovering } = useFileDrop();
  
  useConversion();

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
        const newItems = await addFiles(selected as string[]);
        addFilesToQueue(newItems);
      } else if (selected && !Array.isArray(selected)) {
        const newItems = await addFiles([selected as string]);
        addFilesToQueue(newItems);
      }
    } catch (err) {
      console.error("Failed to select files:", err);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderQueue(result.source.index, result.destination.index);
  };

  return (
    <div className="flex h-full w-full">
      <div className="flex-4 p-6 overflow-y-auto flex flex-col h-full bg-background transition-colors duration-300">
        <button
          type="button"
          onClick={handleBrowse}
          aria-label="Browse files to add to queue"
          className={`border-2 border-dashed rounded-lg min-h-[160px] flex flex-col items-center justify-center transition-colors mb-6 cursor-pointer shrink-0 w-full
            ${isHovering 
              ? 'border-primary bg-primary/5 text-primary' 
              : 'border-border bg-surface text-text hover:bg-black/5 dark:hover:bg-white/5'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            {/* Octopus Icon */}
            <svg aria-hidden="true" focusable="false" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <circle cx="12" cy="10" r="5" />
              <path d="M12 15c-2.5 0-4.5 1-4.5 3 0 1.5.5 3 2 3s2.5-1.5 2.5-1.5 1 1.5 2.5 1.5 2 1.5 2-1.5c0-2-2-3-4.5-3Z" />
              <path d="M7 13c-2 0-4 1-4 3 0 1.5.5 3 2 3s2.5-1.5 2.5-1.5" />
              <path d="M17 13c2 0 4 1 4 3 0 1.5-.5 3-2 3s-2.5-1.5-2.5-1.5" />
              <circle cx="10" cy="9" r="0.5" fill="currentColor" />
              <circle cx="14" cy="9" r="0.5" fill="currentColor" />
              <path d="M11 11c.5.5 1.5.5 2 0" />
            </svg>
            {/* File Icon Overlay */}
            <svg aria-hidden="true" focusable="false" width="32" height="32" viewBox="0 0 24 24" fill="#0A7C6E" stroke="none" className="-ml-4 mt-2 shadow-sm rounded">
              <path d="M4 4h6l2 2h8v12H4z" />
              <path d="M10 14l5-3-5-3v6z" fill="white" />
            </svg>
            <svg aria-hidden="true" focusable="false" width="32" height="32" viewBox="0 0 24 24" fill="#F59E0B" stroke="none" className="-ml-6 -mt-6 shadow-sm rounded -z-10">
               <path d="M4 4h6l2 2h8v12H4z" />
            </svg>
          </div>
          <span className="text-lg font-medium text-text">Drag & Drop Files Here</span>
        </button>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          {items.length === 0 ? (
            <div className="text-center text-muted text-sm mt-8">
              Your queue is empty.
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="queue-list">
                {(provided) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef}
                    className="flex flex-col gap-2 pb-4"
                  >
                    {items.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-2 ${snapshot.isDragging ? 'opacity-90' : ''}`}
                            style={provided.draggableProps.style}
                          >
                            <div 
                              {...provided.dragHandleProps}
                              className="text-muted hover:text-text cursor-grab active:cursor-grabbing p-1"
                            >
                              <GripVertical size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <QueueItem
                                id={item.id}
                                name={item.fileName}
                                size={(item.sizeBytes / 1024 / 1024).toFixed(2) + " MB"}
                                format={`${item.settings?.targetFormat || "default"} - ${item.settings?.quality || 85}%`}
                                status={item.status}
                                progress={item.progress}
                              />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* Right panel (Settings) - 20% */}
      <SettingsPanel />
    </div>
  );
};
