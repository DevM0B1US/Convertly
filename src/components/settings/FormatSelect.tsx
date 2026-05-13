import { useSettingsStore } from "../../stores/settingsStore";
import { TargetFormat } from "../../types/file";

export const FormatSelect = () => {
  const globalFormat = useSettingsStore((state) => state.globalFormat);
  const setGlobalFormat = useSettingsStore((state) => state.setGlobalFormat);

  return (
    <div className="p-3 border border-border rounded-md">
      <label className="text-xs font-medium text-muted mb-2 block">Output Format</label>
      <select 
        value={globalFormat}
        onChange={(e) => setGlobalFormat(e.target.value as TargetFormat)}
        className="w-full bg-background border border-border rounded p-1.5 text-sm outline-none focus:border-primary transition-colors"
      >
        <optgroup label="Image">
          <option value="webp">WebP</option>
          <option value="avif">AVIF</option>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </optgroup>
        <optgroup label="Video">
          <option value="mp4">MP4 (H.264)</option>
          <option value="mp4-hevc">MP4 (H.265)</option>
          <option value="webm">WebM (VP9)</option>
        </optgroup>
        <optgroup label="Audio">
          <option value="mp3">MP3</option>
          <option value="flac">FLAC</option>
          <option value="wav">WAV</option>
        </optgroup>
      </select>
    </div>
  );
};
