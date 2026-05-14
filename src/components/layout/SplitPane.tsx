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
      {/* Left panel (Queue) - 80% */}
      <div className="flex-[4] p-4 overflow-y-auto flex flex-col h-full">
        <div 
          onClick={handleBrowse}
          className={`border-2 border-dashed rounded-lg min-h-[100px] flex items-center justify-center transition-colors mb-4 cursor-pointer shrink-0
            ${isHovering 
              ? 'border-primary bg-primary/5 text-primary' 
              : 'border-dropzone-border text-muted hover:bg-hover-bg'}`}
        >
          Drop files here or click to browse
        </div>
        
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
