import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueueStore } from "../stores/queueStore";

export const useConversion = () => {
  const updateItem = useQueueStore((state) => state.updateItem);

  useEffect(() => {
    const unlistenProgress = listen<{id: string, percent: number}>("conversion:progress", (event) => {
      const { id, percent } = event.payload;
      updateItem(id, { 
        status: percent === 100 ? "done" : "converting", 
        progress: percent 
      });
    });

    const unlistenComplete = listen<{id: string, output_path: string}>("conversion:complete", (event) => {
      updateItem(event.payload.id, { 
        status: "done", 
        progress: 100 
      });
    });

    const unlistenError = listen<{id: string, error: string}>("conversion:error", (event) => {
      updateItem(event.payload.id, { 
        status: "error", 
        error: event.payload.error 
      });
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [updateItem]);
};
