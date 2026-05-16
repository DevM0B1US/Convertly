import { QueueItem } from "../queue/QueueItem";
import { SettingsPanel } from "../settings/SettingsPanel";
import { useQueueStore } from "../../stores/queueStore";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useConversion } from "../../hooks/useConversion";
import { open } from "@tauri-apps/plugin-dialog";
import { addFiles } from "../../lib/ipc";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, Plus } from "lucide-react";
import { VisualFormatSelector } from "../convert/VisualFormatSelector";

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
        {/* Functional Visual Selector */}
        <VisualFormatSelector onBrowse={handleBrowse} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <h2 className="text-xs font-black text-muted uppercase tracking-[0.2em]">Queue</h2>
            <span className="text-[10px] text-muted/50 font-medium mt-0.5">Manage and individualize your conversions</span>
          </div>
          <button
            onClick={handleBrowse}
            className="flex items-center gap-2 px-3 h-8 bg-surface border border-border text-muted rounded-lg hover:text-text hover:border-muted transition-all text-[11px] font-bold uppercase tracking-wider shadow-sm"
          >
            <Plus size={14} />
            Add More
          </button>
        </div>

        <div 
          className={`flex-1 overflow-y-auto min-h-0 rounded-xl transition-all border-2 border-dashed p-4
            ${isHovering 
              ? 'border-primary bg-primary/5' 
              : 'border-transparent'}`}
        >
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted p-12">
              <img src="/logo.avif" alt="Convertly" width="64" height="64" className="mb-4 opacity-40" />
              <p className="text-sm">Your queue is empty.</p>
              <p className="text-xs mt-1">Drag and drop files here or click "Add Files"</p>
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="queue-list">
                {(provided) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef}
                    className="flex flex-col gap-3 pb-4"
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
