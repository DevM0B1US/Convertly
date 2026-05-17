import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";

export const StatusBar = () => {
  const items = useQueueStore((state) => state.items);
  const outputDir = useSettingsStore((state) => state.outputDir);
  
  return (
    <div className="h-7 border-t border-border bg-surface px-3 flex items-center justify-between text-xs text-muted">
      <div className="flex items-center gap-4">
        <span>Ready</span>
        <span>{items.length} file{items.length !== 1 && 's'} queued</span>
      </div>
      <div className="flex items-center max-w-[50%] overflow-hidden">
        <span className="truncate" title={outputDir || "Same as source"}>
          Output: {outputDir ? outputDir : "Same as source"}
        </span>
      </div>
    </div>
  );
};
