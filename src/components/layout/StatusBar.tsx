import { useQueueStore } from "../../stores/queueStore";

export const StatusBar = () => {
  const items = useQueueStore((state) => state.items);
  
  return (
    <div className="h-7 border-t border-border bg-surface px-3 flex items-center justify-between text-xs text-muted">
      <div className="flex items-center gap-4">
        <span>Ready</span>
        <span>{items.length} file{items.length !== 1 && 's'} queued</span>
      </div>
      <div>
        <span>Output: Same as source</span>
      </div>
    </div>
  );
};
