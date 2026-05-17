import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";

export const StatusBar = () => {
  const items = useQueueStore((state) => state.items);
  const outputDir = useSettingsStore((state) => state.outputDir);

  const totalItems = items.length;
  const activeItems = items.filter(
    (item) => item.status === "converting" || item.status === "queued"
  );
  const doneItems = items.filter((item) => item.status === "done");
  const failedItems = items.filter((item) => item.status === "error");

  // Calculate overall progress based on each file's progress
  const totalProgress = items.reduce((sum, item) => sum + (item.progress || 0), 0);
  const overallPercent = totalItems > 0 ? Math.round(totalProgress / totalItems) : 0;

  // Determine status bar text
  let statusText = "Ready";
  let detailText = `${totalItems} file${totalItems !== 1 ? "s" : ""} queued`;

  if (activeItems.length > 0) {
    statusText = "Converting";
    detailText = `${doneItems.length} of ${totalItems} completed (${overallPercent}%)`;
  } else if (totalItems > 0 && (doneItems.length > 0 || failedItems.length > 0)) {
    if (failedItems.length > 0) {
      statusText = "Batch Completed";
      detailText = `${doneItems.length} succeeded, ${failedItems.length} failed`;
    } else {
      statusText = "Batch Completed";
      detailText = `All ${doneItems.length} files successfully converted!`;
    }
  }

  return (
    <div className="h-7 border-t border-border bg-surface px-3 flex items-center justify-between text-xs text-muted relative overflow-hidden">
      {/* Sleek, glowing overall queue progress bar */}
      {activeItems.length > 0 && (
        <div
          className="absolute top-0 left-0 h-[2.5px] bg-gradient-to-r from-primary to-accent transition-all duration-300 ease-out shadow-[0_0_8px_var(--color-primary)]"
          style={{ width: `${overallPercent}%` }}
        />
      )}

      <div className="flex items-center gap-4 select-none">
        <span className={`font-bold uppercase tracking-wider ${
          activeItems.length > 0 
            ? "text-primary animate-pulse" 
            : doneItems.length > 0 && activeItems.length === 0
              ? "text-success"
              : "text-muted"
        }`}>
          {statusText}
        </span>
        <span className="h-3 w-[1px] bg-border/80" />
        <span className="font-medium">{detailText}</span>
      </div>
      <div className="flex items-center max-w-[50%] overflow-hidden">
        <span className="truncate" title={outputDir || "Same as source"}>
          Output: {outputDir ? outputDir : "Same as source"}
        </span>
      </div>
    </div>
  );
};

