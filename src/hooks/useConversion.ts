import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueueStore } from "../stores/queueStore";
import { useHistoryStore } from "../stores/historyStore";
import { useSettingsStore } from "../stores/settingsStore";

export const useConversion = () => {
  const updateItem = useQueueStore((state) => state.updateItem);
  const addHistoryEntry = useHistoryStore((state) => state.addEntry);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    let cancelled = false;

    const setupListeners = async () => {
      try {
        const uProgress = await listen<{ id: string; percent: number }>(
          "conversion:progress",
          (event) => {
            if (cancelled) return;
            const percent = Math.min(Math.max(event.payload.percent, 0), 99.9);
            updateItem(event.payload.id, { status: "converting", progress: percent });
          }
        );
        if (cancelled) { uProgress(); return; }
        unlisteners.push(uProgress);

        const uComplete = await listen<{ id: string; output_path: string }>(
          "conversion:complete",
          (event) => {
            if (cancelled) return;
            const { id, output_path } = event.payload;
            updateItem(id, { status: "done", progress: 100 });

            const item = useQueueStore.getState().items.find((i) => i.id === id);
            if (item) {
              const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
              const globalFormat = useSettingsStore.getState().globalFormat;
              addHistoryEntry({
                id,
                fileName: item.fileName,
                sourceFormat: ext.toUpperCase(),
                targetFormat: (item.settings?.targetFormat || globalFormat || "webp").toUpperCase(),
                outputPath: output_path,
                timestamp: Date.now(),
                status: "done",
              });
            }
          }
        );
        if (cancelled) { uComplete(); return; }
        unlisteners.push(uComplete);

        const uError = await listen<{ id: string; error: string }>(
          "conversion:error",
          (event) => {
            if (cancelled) return;
            updateItem(event.payload.id, { status: "error", error: event.payload.error });

            const item = useQueueStore.getState().items.find((i) => i.id === event.payload.id);
            if (item) {
              const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
              addHistoryEntry({
                id: event.payload.id,
                fileName: item.fileName,
                sourceFormat: ext.toUpperCase(),
                targetFormat: (item.settings?.targetFormat || "webp").toUpperCase(),
                outputPath: "",
                timestamp: Date.now(),
                status: "error",
                error: event.payload.error,
              });
            }
          }
        );
        if (cancelled) { uError(); return; }
        unlisteners.push(uError);
      } catch (err) {
        console.error("Failed to set up conversion event listeners:", err);
      }
    };

    setupListeners();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [updateItem, addHistoryEntry]);
};


