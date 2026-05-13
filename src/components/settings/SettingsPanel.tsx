import { FormatSelect } from "./FormatSelect";
import { QualitySlider } from "./QualitySlider";
import { useQueueStore } from "../../stores/queueStore";

export const SettingsPanel = () => {
  const items = useQueueStore((state) => state.items);
  const clearAll = useQueueStore((state) => state.clearAll);

  const totalSize = items.reduce((acc, item) => acc + item.sizeBytes, 0);
  const sizeFormatted = (totalSize / 1024 / 1024).toFixed(2);

  return (
    <div className="flex-1 bg-surface p-4 overflow-y-auto min-w-[250px] border-l border-border h-full flex flex-col">
      <h2 className="font-bold text-sm mb-4">Settings</h2>
      
      <div className="space-y-4 flex-1">
        <FormatSelect />
        <QualitySlider />
      </div>

      <div className="mt-4 pt-4 border-t border-border space-y-3">
        {items.length > 0 && (
          <div className="text-xs text-muted flex justify-between">
            <span>Total: {items.length} files</span>
            <span>{sizeFormatted} MB</span>
          </div>
        )}
        
        <button 
          className="w-full py-2 bg-primary hover:bg-primary-hover text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={items.length === 0}
        >
          Convert All
        </button>
        
        <button 
          onClick={clearAll}
          className="w-full py-2 bg-surface hover:bg-hover-bg text-text border border-border rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={items.length === 0}
        >
          Clear All
        </button>
      </div>
    </div>
  );
};
