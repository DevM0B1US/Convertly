import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { startConversion } from "../../lib/ipc";
import { useState } from "react";
import { TargetFormat } from "../../types/file";
import { open } from "@tauri-apps/plugin-dialog";

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
      
      {/* Format Select */}
      <div className="mb-4">
        <label className="text-[15px] font-semibold text-text mb-2 block">Format</label>
        <div className="relative">
          <select 
            value={globalSettings.globalFormat}
            onChange={(e) => globalSettings.setGlobalFormat(e.target.value as TargetFormat)}
            className="w-full bg-surface border-2 border-border/50 rounded-lg p-3 text-[15px] font-medium text-text outline-none focus:border-primary transition-all appearance-none cursor-pointer hover:border-border"
          >
            <option value="webp">WebP</option>
            <option value="mp4">MP4</option>
            <option value="mp3">MP3</option>
            <option value="flac">FLAC</option>
            <option value="ogg">OGG</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="avif">AVIF</option>
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Resolution Pills */}
      <div className="flex bg-muted/20 rounded-lg p-1 mb-8 shadow-inner">
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
              className={`flex-1 text-[11px] font-bold py-2 rounded-md transition-all ${isActive ? 'bg-primary text-white shadow-md scale-105 z-10' : 'text-muted/80 hover:bg-muted/30 hover:text-text'}`}
            >
              {res.label}
            </button>
          );
        })}
      </div>

      {/* Resize Toggle */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 text-text font-medium">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
          <span>Resize</span>
        </div>
        <button 
          className={`w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition-colors ${globalSettings.globalResize?.enabled ? 'bg-primary' : 'bg-muted/30'}`}
          onClick={() => globalSettings.setGlobalResize(globalSettings.globalResize?.enabled ? null : { enabled: true, height: globalSettings.globalResize?.height ?? 720, maintainAspectRatio: true })}
        >
          <div className={`w-4 h-4 bg-white rounded-full absolute shadow-sm transition-all duration-200 ${globalSettings.globalResize?.enabled ? 'right-1' : 'left-1'}`}></div>
        </button>
      </div>

      {/* Compression Slider */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <label className="text-[15px] font-semibold text-text">Quality</label>
          <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{globalSettings.globalQuality}%</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => globalSettings.setGlobalQuality(Math.max(1, globalSettings.globalQuality - 5))}
            className="text-muted hover:text-text cursor-pointer p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
          </button>
          
          <div className="flex-1 relative flex items-center h-4">
            {/* Custom Range Track */}
            <div className="absolute w-full h-1.5 bg-muted/30 rounded-full"></div>
            <div className="absolute h-1.5 bg-primary rounded-full" style={{ width: `${globalSettings.globalQuality}%` }}></div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={globalSettings.globalQuality}
              onChange={(e) => globalSettings.setGlobalQuality(Number(e.target.value))}
              className="absolute w-full h-full opacity-0 cursor-pointer" 
            />
            {/* Custom Thumb */}
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-primary rounded-full pointer-events-none"
              style={{ left: `calc(${globalSettings.globalQuality}% - 8px)` }}
            ></div>
          </div>

          <button 
            onClick={() => globalSettings.setGlobalQuality(Math.min(100, globalSettings.globalQuality + 5))}
            className="text-muted hover:text-text cursor-pointer p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5v14"/></svg>
          </button>
        </div>
      </div>

      {/* Metadata Strip */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 text-text font-medium">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
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
        <label className="text-[15px] font-semibold text-text mb-3 block">Output Destination</label>
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
            className="w-full flex items-center justify-between p-3 bg-muted/10 border border-border rounded-lg hover:border-primary/50 transition-all text-left group cursor-pointer"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-muted mb-1 uppercase tracking-wider">Destination:</span>
              <span className="text-sm font-medium text-text truncate">
                {globalSettings.outputDir ? globalSettings.outputDir : "Original folder"}
              </span>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-primary transition-colors">
              <path d="M20 7h-9l-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
            </svg>
          </button>
          
          {globalSettings.outputDir && (
            <button 
              onClick={() => globalSettings.setOutputDir(null)}
              className="text-[11px] font-bold text-primary hover:underline self-end"
            >
              Reset to original folder
            </button>
          )}
        </div>
      </div>

      {/* Convert All Button */}
      <div className="mt-8">
        <button 
          onClick={handleConvertAll}
          disabled={items.length === 0 || isConverting}
          className="w-full py-3 bg-accent hover:opacity-90 text-white rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center shadow-md relative overflow-hidden"
        >
          <span className="text-xl font-bold">Convert All</span>
          <span className="text-sm font-medium opacity-90">Start Conversion</span>
          <div className="absolute right-0 bottom-0 opacity-20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
              <path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z"/>
            </svg>
          </div>
        </button>
        {globalSettings.outputDir === null && (
          <p className="text-[10px] text-muted text-center mt-2 font-medium">
            Files will be saved in the original folder
          </p>
        )}
      </div>
    </div>
  );
};
