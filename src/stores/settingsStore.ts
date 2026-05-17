import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TargetFormat, ResizeConfig } from "../types/file";

interface SettingsState {
  globalFormat: TargetFormat;
  globalQuality: number; // 1-100
  globalResize: ResizeConfig | null;
  globalStripMetadata: boolean;
  globalFps: number | null; // null = Keep Original
  globalAudioChannels: number | null; // null = Keep Original, 1 = Mono, 2 = Stereo
  globalSpeed: "ultrafast" | "medium" | "veryslow" | null; // null = Medium
  globalHwAccel: "none" | "nvenc" | "qsv" | "vaapi" | "videotoolbox" | null;
  outputDir: string | null; // null = same as source
  maxConcurrent: number; // 1-4, default 2
  
  setGlobalFormat: (format: TargetFormat) => void;
  setGlobalQuality: (quality: number) => void;
  setGlobalResize: (resize: ResizeConfig | null) => void;
  setGlobalStripMetadata: (strip: boolean) => void;
  setGlobalFps: (fps: number | null) => void;
  setGlobalAudioChannels: (channels: number | null) => void;
  setGlobalSpeed: (speed: "ultrafast" | "medium" | "veryslow" | null) => void;
  setGlobalHwAccel: (hwAccel: "none" | "nvenc" | "qsv" | "vaapi" | "videotoolbox" | null) => void;
  setOutputDir: (dir: string | null) => void;
  setMaxConcurrent: (max: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      globalFormat: "webp" as TargetFormat,
      globalQuality: 85,
      globalResize: null,
      globalStripMetadata: false,
      globalFps: null,
      globalAudioChannels: null,
      globalSpeed: null,
      globalHwAccel: null,
      outputDir: null,
      maxConcurrent: 2,

      setGlobalFormat: (format) => set({ globalFormat: format }),
      setGlobalQuality: (quality) => set({ globalQuality: quality }),
      setGlobalResize: (resize) => set({ globalResize: resize }),
      setGlobalStripMetadata: (strip) => set({ globalStripMetadata: strip }),
      setGlobalFps: (fps) => set({ globalFps: fps }),
      setGlobalAudioChannels: (channels) => set({ globalAudioChannels: channels }),
      setGlobalSpeed: (speed) => set({ globalSpeed: speed }),
      setGlobalHwAccel: (hwAccel) => set({ globalHwAccel: hwAccel }),
      setOutputDir: (dir) => set({ outputDir: dir }),
      setMaxConcurrent: (max) => set({ maxConcurrent: max }),
    }),
    { name: "convertly-settings" }
  )
);


