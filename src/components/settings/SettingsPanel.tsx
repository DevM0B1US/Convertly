import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { startConversion } from "../../lib/ipc";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Maximize, AlignLeft, Folder, Plus, Minus } from "lucide-react";

export const SettingsPanel = () => {
  const items = useQueueStore((state) => state.items);
  const updateItem = useQueueStore((state) => state.updateItem);
  const globalSettings = useSettingsStore();
  
  const [isConverting, setIsConverting] = useState(false);

  const handleConvertAll = async () => {
    setIsConverting(true);
    items.forEach(item => {
      if (item.status !== "done") {
        updateItem(item.id, { status: "queued", error: undefined });
      }
    });

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
    <div className="w-80 bg-surface border-l border-border h-full flex flex-col pt-6 pb-4 px-6 overflow-y-auto transition-colors duration-300">
      
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-6">Global Settings</h2>

      {/* Resolution Pills */}
      <div className="flex bg-muted/10 rounded-lg p-1 mb-6 shadow-inner">
        {[
          { label: '1080p', height: 1080 },
          { label: '720p', height: 720 },
          { label: '500p', height: 500 },
          { label: '420p', height: 420 },
          { label: '260p', height: 260 }
        ].map((res) => {
          const isActive = globalSettings.globalResize?.height === res.height;
          return (
            <button 
              key={res.label} 
              onClick={() => globalSettings.setGlobalResize({ enabled: true, height: res.height, maintainAspectRatio: true })}
              className={`flex-1 text-xs font-semibold py-2 rounded-md transition-all ${isActive ? 'bg-primary text-white shadow-md scale-105 z-10' : 'text-muted/70 hover:bg-muted/20 hover:text-text'}`}
            >
              {res.label}
            </button>
          );
        })}
      </div>

      {/* Resize Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <Maximize size={16} className="text-muted" />
          <span>Resize</span>
        </div>
        <button 
          className={`w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition-colors ${globalSettings.globalResize?.enabled ? 'bg-primary' : 'bg-muted/20'}`}
          onClick={() => globalSettings.setGlobalResize(globalSettings.globalResize?.enabled ? null : { enabled: true, height: globalSettings.globalResize?.height ?? 720, maintainAspectRatio: true })}
        >
          <div className={`w-4 h-4 bg-white rounded-full absolute shadow-sm transition-all duration-200 ${globalSettings.globalResize?.enabled ? 'right-1' : 'left-1'}`}></div>
        </button>
      </div>

      {/* Compression Slider */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <label className="text-sm font-medium text-text">Quality</label>
          <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{globalSettings.globalQuality}%</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => globalSettings.setGlobalQuality(Math.max(1, globalSettings.globalQuality - 5))}
            className="text-muted hover:text-text cursor-pointer p-1"
          >
            <Minus size={16} />
          </button>
          
          <div className="flex-1 relative flex items-center h-4">
            <div className="absolute w-full h-1.5 bg-muted/20 rounded-full"></div>
            <div className="absolute h-1.5 bg-primary rounded-full" style={{ width: `${globalSettings.globalQuality}%` }}></div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={globalSettings.globalQuality}
              onChange={(e) => globalSettings.setGlobalQuality(Number(e.target.value))}
              className="absolute w-full h-full opacity-0 cursor-pointer" 
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-primary rounded-full pointer-events-none"
              style={{ left: `calc(${globalSettings.globalQuality}% - 8px)` }}
            ></div>
          </div>

          <button 
            onClick={() => globalSettings.setGlobalQuality(Math.min(100, globalSettings.globalQuality + 5))}
            className="text-muted hover:text-text cursor-pointer p-1"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Metadata Strip */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <AlignLeft size={16} className="text-muted" />
          <span>Metadata strip</span>
        </div>
        <button 
          onClick={() => globalSettings.setGlobalStripMetadata(!globalSettings.globalStripMetadata)}
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${globalSettings.globalStripMetadata ? 'border-primary bg-primary shadow-lg shadow-primary/20' : 'border-border bg-muted/10 hover:border-primary/50'}`}
        >
          {globalSettings.globalStripMetadata && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
        </button>
      </div>

      {/* Output Destination */}
      <div className="mb-auto">
        <label className="text-sm font-medium text-text mb-3 block">Output Destination</label>
        <div className="flex flex-col gap-2">
          <button 
            onClick={async () => {
              try {
                const selected = await open({
                  directory: true,
                  multiple: false,
                  title: "Select Output Directory"
                });
                if (selected && typeof selected === "string") {
                  globalSettings.setOutputDir(selected);
                }
              } catch (err) {
                console.error("Failed to open directory dialog:", err);
              }
            }}
            className="w-full flex items-center justify-between p-3 bg-muted/5 border border-border rounded-lg hover:border-primary/50 transition-all text-left group cursor-pointer"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-muted mb-1">Destination</span>
              <span className="text-sm font-medium text-text truncate">
                {globalSettings.outputDir ? globalSettings.outputDir : "Original folder"}
              </span>
            </div>
            <Folder size={18} className="text-muted group-hover:text-primary transition-colors shrink-0" />
          </button>
          
          {globalSettings.outputDir && (
            <button 
              onClick={() => globalSettings.setOutputDir(null)}
              className="text-xs font-medium text-primary hover:underline self-end"
            >
              Reset to original folder
            </button>
          )}
        </div>
      </div>

      {/* Convert All Button */}
      <div className="mt-6">
        <button 
          onClick={handleConvertAll}
          disabled={items.length === 0 || isConverting}
          className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center shadow-md"
        >
          <span className="text-lg font-bold">Convert All</span>
          <span className="text-xs font-medium opacity-80">Start Conversion</span>
        </button>
        {!globalSettings.outputDir && (
          <p className="text-xs text-muted text-center mt-2 font-medium">
            Files will be saved in the original folder
          </p>
        )}
      </div>
    </div>
  );
};
