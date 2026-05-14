import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { startConversion } from "../../lib/ipc";
import { useState } from "react";
import { TargetFormat } from "../../types/file";

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
    <div className="w-80 bg-white border-l border-border h-full flex flex-col pt-6 pb-4 px-6 overflow-y-auto">
      
      {/* Format Select */}
      <div className="mb-4">
        <label className="text-[15px] font-semibold text-gray-800 mb-2 block">Format</label>
        <div className="relative">
          <select 
            value={globalSettings.globalFormat}
            onChange={(e) => globalSettings.setGlobalFormat(e.target.value as TargetFormat)}
            className="w-full bg-white border-2 border-gray-800 rounded-lg p-2 text-[15px] font-medium text-gray-800 outline-none focus:border-primary appearance-none cursor-pointer"
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
      <div className="flex bg-gray-200 rounded-md p-1 mb-8">
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
              className={`flex-1 text-xs font-medium py-1.5 rounded-sm transition-colors ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-300'}`}
            >
              {res.label}
            </button>
          );
        })}
      </div>

      {/* Resize Toggle */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 text-gray-800 font-medium">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
          <span>Resize</span>
        </div>
        <button 
          className={`w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition-colors ${globalSettings.globalResize?.enabled ? 'bg-primary' : 'bg-gray-300'}`}
          onClick={() => globalSettings.setGlobalResize(globalSettings.globalResize?.enabled ? null : { enabled: true, height: globalSettings.globalResize?.height ?? 720, maintainAspectRatio: true })}
        >
          <div className={`w-4 h-4 bg-white rounded-full absolute shadow-sm transition-all duration-200 ${globalSettings.globalResize?.enabled ? 'right-1' : 'left-1'}`}></div>
        </button>
      </div>

      {/* Compression Slider */}
      <div className="mb-8">
        <label className="text-[15px] font-semibold text-gray-800 mb-3 block">Compression level</label>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => globalSettings.setGlobalQuality(Math.max(1, globalSettings.globalQuality - 5))}
            className="text-gray-500 hover:text-gray-800 cursor-pointer p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
          </button>
          
          <div className="flex-1 relative flex items-center h-4">
            {/* Custom Range Track */}
            <div className="absolute w-full h-1.5 bg-gray-300 rounded-full"></div>
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
            className="text-gray-500 hover:text-gray-800 cursor-pointer p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5v14"/></svg>
          </button>
        </div>
      </div>

      {/* Metadata Strip */}
      <div className="flex items-center justify-between mb-auto">
        <div className="flex items-center gap-2 text-gray-800 font-medium">
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
        <div 
          onClick={() => globalSettings.setGlobalStripMetadata(!globalSettings.globalStripMetadata)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${globalSettings.globalStripMetadata ? 'border-primary bg-primary' : 'border-gray-400 bg-white'}`}
        >
          {globalSettings.globalStripMetadata && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
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
      </div>
    </div>
  );
};
