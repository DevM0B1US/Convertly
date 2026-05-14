import { FormatSelect } from "./FormatSelect";
import { QualitySlider } from "./QualitySlider";
import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { startConversion } from "../../lib/ipc";
import { useState } from "react";

export const SettingsPanel = () => {
  const items = useQueueStore((state) => state.items);
  const clearAll = useQueueStore((state) => state.clearAll);
  const updateItem = useQueueStore((state) => state.updateItem);
  const globalSettings = useSettingsStore();
  
  const [isConverting, setIsConverting] = useState(false);

  const totalSize = items.reduce((acc, item) => acc + item.sizeBytes, 0);
  const sizeFormatted = (totalSize / 1024 / 1024).toFixed(2);

  const handleConvertAll = async () => {
    setIsConverting(true);
    
    // Set status to queued for all non-done items
    items.forEach(item => {
      if (item.status !== "done") {
        updateItem(item.id, { status: "queued", error: undefined });
      }
    });

    // Prepare items with global settings applied if they don't have overrides
    const itemsToConvert = items.map(item => ({
      ...item,
      settings: item.settings || {
        targetFormat: globalSettings.globalFormat,
        quality: globalSettings.globalQuality,
        resize: globalSettings.globalResize,
        stripMetadata: globalSettings.globalStripMetadata
      }
    }));

    try {
      await startConversion(itemsToConvert, globalSettings.outputDir || undefined);
    } catch (err) {
      console.error("Conversion batch failed:", err);
    } finally {
      setIsConverting(false);
    }
  };

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
          onClick={handleConvertAll}
          className="w-full py-2 bg-primary hover:bg-primary-hover text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={items.length === 0 || isConverting}
        >
          {isConverting ? "Converting..." : "Convert All"}
        </button>
        
        <button 
          onClick={clearAll}
          className="w-full py-2 bg-surface hover:bg-hover-bg text-text border border-border rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={items.length === 0 || isConverting}
        >
          Clear All
        </button>
      </div>
    </div>
  );
};
