import { useSettingsStore } from "../../stores/settingsStore";

export const QualitySlider = () => {
  const globalQuality = useSettingsStore((state) => state.globalQuality);
  const setGlobalQuality = useSettingsStore((state) => state.setGlobalQuality);

  return (
    <div className="p-3 border border-border rounded-md">
      <label className="text-xs font-medium text-muted mb-2 block">Quality</label>
      <div className="flex items-center gap-3">
        <input 
          type="range" 
          min="1" 
          max="100" 
          value={globalQuality}
          onChange={(e) => setGlobalQuality(Number(e.target.value))}
          className="flex-1 accent-primary" 
        />
        <span className="text-xs font-mono w-6 text-right">{globalQuality}</span>
      </div>
    </div>
  );
};
