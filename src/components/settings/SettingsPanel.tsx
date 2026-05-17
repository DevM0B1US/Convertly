import { useQueueStore } from "../../stores/queueStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { startConversion } from "../../lib/ipc";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Maximize, AlignLeft, Folder, Plus, Minus, Sliders, ChevronDown, Info } from "lucide-react";

const InfoTooltip = ({ content }: { content: string }) => {
  return (
    <div className="relative group/tooltip inline-flex items-center shrink-0 select-none ml-1.5">
      <Info 
        size={13} 
        className="text-muted/50 hover:text-primary cursor-help transition-colors" 
      />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-surface border border-border rounded-lg shadow-xl pointer-events-none opacity-0 scale-95 group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 transition-all duration-150 origin-bottom z-50">
        <div className="text-[11px] font-medium text-text leading-relaxed text-center whitespace-normal">
          {content}
        </div>
        {/* Triangle Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-surface" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border -z-10 mt-[0.5px]" />
      </div>
    </div>
  );
};

export const SettingsPanel = () => {
  const items = useQueueStore((state) => state.items);
  const updateItem = useQueueStore((state) => state.updateItem);
  const globalSettings = useSettingsStore();
  
  const [isConverting, setIsConverting] = useState(false);

  const presets = [1080, 720, 500, 420, 260];
  const initialIsCustom = 
    globalSettings.globalResize?.enabled && 
    globalSettings.globalResize?.height !== undefined && 
    !presets.includes(globalSettings.globalResize.height);

  const [showCustomInput, setShowCustomInput] = useState(!!initialIsCustom);
  const [customHeight, setCustomHeight] = useState<string>(
    initialIsCustom ? String(globalSettings.globalResize?.height) : "1440"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCustomHeightChange = (val: string) => {
    setCustomHeight(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      globalSettings.setGlobalResize({
        enabled: true,
        height: parsed,
        maintainAspectRatio: true
      });
    }
  };

  const handleCustomClick = () => {
    setShowCustomInput(true);
    const parsed = parseInt(customHeight, 10);
    const heightVal = !isNaN(parsed) && parsed > 0 ? parsed : 1440;
    if (isNaN(parsed) || parsed <= 0) {
      setCustomHeight("1440");
    }
    globalSettings.setGlobalResize({
      enabled: true,
      height: heightVal,
      maintainAspectRatio: true
    });
  };

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
        stripMetadata: globalSettings.globalStripMetadata,
        fps: globalSettings.globalFps,
        audioChannels: globalSettings.globalAudioChannels,
        speed: globalSettings.globalSpeed
      }
    }));

    try {
      await startConversion(itemsToConvert, globalSettings.outputDir || undefined, globalSettings.maxConcurrent);
    } catch (err) {
      console.error("Conversion batch failed:", err);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="w-80 bg-surface border-l border-border h-full flex flex-col transition-colors duration-300">
      {/* Scrollable Settings Area */}
      <div className="flex-1 overflow-y-auto pt-6 px-6 pb-4">
        <h2 className="text-sm font-extrabold text-text uppercase tracking-widest mb-6">Global Settings</h2>

      {/* Resize & Resolution Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Maximize size={16} className="text-muted" />
            <span>Resize</span>
            <InfoTooltip content="Scale your images or videos to standard resolutions or define a custom height." />
          </div>
          <button 
            className={`w-10 h-6 rounded-full relative flex items-center px-1 cursor-pointer transition-colors ${globalSettings.globalResize?.enabled ? 'bg-accent' : 'bg-muted/20'}`}
            onClick={() => {
              if (globalSettings.globalResize?.enabled) {
                globalSettings.setGlobalResize(null);
                setShowCustomInput(false);
              } else {
                const heightVal = showCustomInput ? (parseInt(customHeight, 10) || 1440) : 720;
                globalSettings.setGlobalResize({ enabled: true, height: heightVal, maintainAspectRatio: true });
              }
            }}
          >
            <div className={`w-4 h-4 bg-white rounded-full absolute shadow-sm transition-all duration-200 ${globalSettings.globalResize?.enabled ? 'right-1' : 'left-1'}`}></div>
          </button>
        </div>

        {globalSettings.globalResize?.enabled && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <label className="text-xs font-bold text-muted uppercase tracking-wider mb-2 block">Resolution Presets</label>
            <div className="grid grid-cols-3 gap-1 bg-muted/10 rounded-lg p-1 shadow-inner mb-3">
              {[
                { label: '1080p', height: 1080 },
                { label: '720p', height: 720 },
                { label: '500p', height: 500 },
                { label: '420p', height: 420 },
                { label: '260p', height: 260 }
              ].map((res) => {
                const isActive = !showCustomInput && globalSettings.globalResize?.height === res.height;
                return (
                  <button 
                    key={res.label} 
                    onClick={() => {
                      globalSettings.setGlobalResize({ enabled: true, height: res.height, maintainAspectRatio: true });
                      setShowCustomInput(false);
                    }}
                    className={`text-xs font-semibold py-2 rounded-md transition-all cursor-pointer ${isActive ? 'bg-primary text-white shadow-md scale-105 z-10' : 'text-muted/70 hover:bg-muted/20 hover:text-text'}`}
                  >
                    {res.label}
                  </button>
                );
              })}
              <button 
                onClick={handleCustomClick}
                className={`text-xs font-semibold py-2 rounded-md transition-all cursor-pointer ${showCustomInput ? 'bg-primary text-white shadow-md scale-105 z-10' : 'text-muted/70 hover:bg-muted/20 hover:text-text'}`}
              >
                Custom
              </button>
            </div>

            {showCustomInput && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3">
                <label className="text-[11px] font-semibold text-muted mb-1.5 block">Custom Height</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="number" 
                      min="1"
                      max="8192"
                      placeholder="e.g. 1440, 2160"
                      value={customHeight}
                      onChange={(e) => handleCustomHeightChange(e.target.value)}
                      className="w-full bg-muted/5 border border-border rounded-lg py-2 px-3 pr-10 text-sm font-semibold text-text focus:outline-none focus:border-primary transition-all font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted select-none">px</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted mt-1.5 leading-relaxed font-medium">
                  Aspect ratio is maintained automatically. Standard: 2K (1440px), 4K (2160px).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compression Slider */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-text">Quality</label>
            <InfoTooltip content="Set the output compression level. Higher quality produces larger files; lower quality reduces size." />
          </div>
          <span className="text-xs font-bold font-mono bg-accent text-white px-2 py-0.5 rounded-full shadow-sm select-none">{globalSettings.globalQuality}%</span>
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
            <div className="absolute h-1.5 bg-accent rounded-full" style={{ width: `${globalSettings.globalQuality}%` }}></div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={globalSettings.globalQuality}
              onChange={(e) => globalSettings.setGlobalQuality(Number(e.target.value))}
              className="absolute w-full h-full opacity-0 cursor-pointer" 
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-accent rounded-full pointer-events-none"
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
          <InfoTooltip content="Remove hidden file metadata (like camera model, EXIF tags, or GPS coordinates) for smaller size and privacy." />
        </div>
        <button 
          onClick={() => globalSettings.setGlobalStripMetadata(!globalSettings.globalStripMetadata)}
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${globalSettings.globalStripMetadata ? 'border-accent bg-accent' : 'border-border bg-muted/10 hover:border-accent/50'}`}
        >
          {globalSettings.globalStripMetadata && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
        </button>
      </div>

      {/* Advanced Settings Drawer */}
      <div className="mb-6 border-t border-border/30 pt-4">
        <button 
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between py-2 text-sm font-semibold text-muted hover:text-text transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <Sliders size={16} />
            <span>Advanced Settings</span>
          </div>
          <ChevronDown size={16} className={`transition-transform duration-200 pointer-events-none ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Framerate Selection */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <label className="text-xs font-semibold text-muted">Framerate (FPS)</label>
                <InfoTooltip content="Control the playback speed of your video. Lowering FPS reduces file size; keeping original preserves motion." />
              </div>
              <div className="relative">
                <select 
                  value={globalSettings.globalFps ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    globalSettings.setGlobalFps(val === "" ? null : Number(val));
                  }}
                  className="w-full appearance-none bg-muted/5 border border-border rounded-lg py-2 pl-3 pr-10 text-sm font-medium text-text focus:outline-none focus:border-primary transition-all cursor-pointer"
                >
                  <option value="" className="bg-surface text-text">Keep Original FPS</option>
                  <option value="60" className="bg-surface text-text">60 FPS (Ultra-smooth)</option>
                  <option value="30" className="bg-surface text-text">30 FPS (Standard)</option>
                  <option value="24" className="bg-surface text-text">24 FPS (Cinematic)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>

            {/* Audio Channels */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <label className="text-xs font-semibold text-muted">Audio Channels</label>
                <InfoTooltip content="Configure audio outputs. Stereo preserves spatial sound; Mono merges channels for small voice recordings." />
              </div>
              <div className="relative">
                <select 
                  value={globalSettings.globalAudioChannels ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    globalSettings.setGlobalAudioChannels(val === "" ? null : Number(val));
                  }}
                  className="w-full appearance-none bg-muted/5 border border-border rounded-lg py-2 pl-3 pr-10 text-sm font-medium text-text focus:outline-none focus:border-primary transition-all cursor-pointer"
                >
                  <option value="" className="bg-surface text-text">Keep Original Channels</option>
                  <option value="2" className="bg-surface text-text">Stereo (2 Channels)</option>
                  <option value="1" className="bg-surface text-text">Mono (1 Channel - voice/draft)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>

            {/* Encoder Speed (Preset) */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <label className="text-xs font-semibold text-muted">Encoder Speed</label>
                <InfoTooltip content="Ultrafast encodes instantly but creates larger files; Veryslow takes longer but highly compresses quality." />
              </div>
              <div className="relative">
                <select 
                  value={globalSettings.globalSpeed ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "ultrafast" || val === "medium" || val === "veryslow") {
                      globalSettings.setGlobalSpeed(val);
                    } else {
                      globalSettings.setGlobalSpeed(null);
                    }
                  }}
                  className="w-full appearance-none bg-muted/5 border border-border rounded-lg py-2 pl-3 pr-10 text-sm font-medium text-text focus:outline-none focus:border-primary transition-all cursor-pointer"
                >
                  <option value="" className="bg-surface text-text">Medium (Balanced)</option>
                  <option value="ultrafast" className="bg-surface text-text">Ultrafast (Instant, larger files)</option>
                  <option value="veryslow" className="bg-surface text-text">Veryslow (Longer, smallest files)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Output Destination */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-3">
          <label className="text-sm font-medium text-text">Output Destination</label>
          <InfoTooltip content="Choose the directory where your successfully converted files will be saved." />
        </div>
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

      </div>

      {/* Pinned Footer with Convert All Button */}
      <div className="p-6 border-t border-border bg-surface shrink-0">
        <button 
          onClick={handleConvertAll}
          disabled={items.length === 0 || isConverting}
          className="w-full py-3 bg-accent hover:bg-accent/90 active:scale-[0.98] text-white rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex flex-col items-center justify-center shadow-md cursor-pointer"
        >
          <span className="text-lg font-bold">Convert All</span>
          <span className="text-xs font-medium opacity-90">Start Conversion</span>
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
