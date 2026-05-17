import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueueStore } from "../stores/queueStore";
import { useHistoryStore } from "../stores/historyStore";
import { useSettingsStore } from "../stores/settingsStore";

export const useConversion = () => {
  const updateItem = useQueueStore((state) => state.updateItem);
  const addHistoryEntry = useHistoryStore((state) => state.addEntry);

  useEffect(() => {
    let active = true;
    let unlistenProgress: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupListeners = async () => {
      const uProgress = await listen<{ id: string; percent: number }>(
        "conversion:progress",
        (event) => {
          if (active) {
            // Cap ticker progress at 99.9 to ensure it never prematurely displays 100% in UI
            const percent = Math.min(Math.max(event.payload.percent, 0), 99.9);
            updateItem(event.payload.id, { progress: percent });
          }
        }
      );
      if (!active) {
        uProgress();
        return;
      }
      unlistenProgress = uProgress;

      const uComplete = await listen<{
        id: string;
        output_path: string;
      }>("conversion:complete", (event) => {
        if (active) {
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
      });
      if (!active) {
        uComplete();
        return;
      }
      unlistenComplete = uComplete;

      const uError = await listen<{ id: string; error: string }>(
        "conversion:error",
        (event) => {
          if (active) {
            updateItem(event.payload.id, { status: "error", error: event.payload.error });
            
            // Log error in conversion history as well
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
        }
      );
      if (!active) {
        uError();
        return;
      }
      unlistenError = uError;
    };

    setupListeners();

    return () => {
      active = false;
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };
  }, [updateItem, addHistoryEntry]);
};
