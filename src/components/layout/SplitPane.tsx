import { QueueItem } from "../queue/QueueItem";
import { SettingsPanel } from "../settings/SettingsPanel";
import { useQueueStore } from "../../stores/queueStore";
import { open } from "@tauri-apps/plugin-dialog";
import { addFiles, cancelConversion } from "../../lib/ipc";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, Trash2 } from "lucide-react";
import { VisualFormatSelector } from "../convert/VisualFormatSelector";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } from "../../types/file";

export const SplitPane = () => {
  const items = useQueueStore((state) => state.items);
  const addFilesToQueue = useQueueStore((state) => state.addFiles);
  const reorderQueue = useQueueStore((state) => state.reorder);
  const clearAll = useQueueStore((state) => state.clearAll);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Media',
          extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]
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

  const handleClearAll = () => {
    items.forEach((item) => {
      if (item.status === "converting" || item.status === "paused") {
        cancelConversion(item.id).catch((err) => {
          console.error("Failed to cancel conversion on clear queue:", err);
        });
      }
    });
    clearAll();
  };

  return (
    <div className="flex h-full w-full">
      <div className="flex-4 p-6 flex flex-col h-full bg-background transition-colors duration-300 overflow-hidden">
        {/* Functional Visual Selector */}
        <VisualFormatSelector onBrowse={handleBrowse} />

        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <h2 className="text-lg font-extrabold text-text uppercase tracking-widest">Queue</h2>
            <span className="text-sm text-muted/80 font-medium mt-1">Manage and customize your files</span>
          </div>
          {items.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted hover:text-error hover:bg-error/5 border border-border hover:border-error/20 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer shrink-0"
            >
              <Trash2 size={14} />
              <span>Clear Queue</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 min-h-0 rounded-xl transition-colors duration-300">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted p-12">
              <img src="/logo.avif" alt="Convertly" width="96" height="96" className="mb-4 opacity-40 select-none pointer-events-none" />
              <p className="text-lg font-bold text-text mb-1">Your queue is empty.</p>
              <p className="text-sm text-muted mt-2 max-w-[320px] mx-auto leading-relaxed">
                Drag and drop files at the top, or click the <strong className="text-primary font-bold">Source</strong> button to browse.
              </p>
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
                            className={`flex items-center gap-2 ${snapshot.isDragging ? 'opacity-95 z-[9999]' : ''}`}
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
                                index={index}
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
