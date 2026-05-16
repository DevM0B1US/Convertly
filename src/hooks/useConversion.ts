import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueueStore } from "../stores/queueStore";
import { useHistoryStore } from "../stores/historyStore";

export const useConversion = () => {
  const updateItem = useQueueStore((state) => state.updateItem);
  const addHistoryEntry = useHistoryStore((state) => state.addEntry);

  useEffect(() => {
    const unlistenProgress = listen<{id: string, percent: number}>("conversion:progress", (event) => {
      const { id, percent } = event.payload;
      updateItem(id, { 
        status: percent === 100 ? "done" : "converting", 
        progress: percent 
      });
    });

    const unlistenComplete = listen<{id: string, output_path: string}>("conversion:complete", (event) => {
      const { id, output_path } = event.payload;
      updateItem(id, { status: "done", progress: 100 });

      const item = useQueueStore.getState().items.find((i) => i.id === id);
      if (item) {
        const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
        addHistoryEntry({
          id,
          fileName: item.fileName,
          sourceFormat: ext.toUpperCase(),
          targetFormat: (item.settings?.targetFormat || "webp").toUpperCase(),
          outputPath: output_path,
          timestamp: Date.now(),
          status: "done",
        });
      }
    });

    const unlistenError = listen<{id: string, error: string}>("conversion:error", (event) => {
      const { id, error } = event.payload;
      updateItem(id, { status: "error", error });

      const item = useQueueStore.getState().items.find((i) => i.id === id);
      if (item) {
        const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
        addHistoryEntry({
          id,
          fileName: item.fileName,
          sourceFormat: ext.toUpperCase(),
          targetFormat: (item.settings?.targetFormat || "webp").toUpperCase(),
          outputPath: "",
          timestamp: Date.now(),
          status: "error",
          error,
        });
      }
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [updateItem, addHistoryEntry]);
};
