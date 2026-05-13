import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useQueueStore } from "../stores/queueStore";
import { addFiles } from "../lib/ipc";
import { Event } from "@tauri-apps/api/event";

interface DropEventPayload {
  paths: string[];
}

export const useFileDrop = () => {
  const [isHovering, setIsHovering] = useState(false);
  const addFilesToQueue = useQueueStore((state) => state.addFiles);

  useEffect(() => {
    const unlistenDragEnter = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setIsHovering(true);
      } else if (event.payload.type === "drop") {
        setIsHovering(false);
        const paths = event.payload.paths as string[];
        if (paths && paths.length > 0) {
          // Pass the file paths to our Rust backend to validate and extract metadata
          addFiles(paths)
            .then((newItems) => {
              addFilesToQueue(newItems);
            })
            .catch((err) => {
              console.error("Failed to add files:", err);
            });
        }
      } else if (event.payload.type === "leave" || event.payload.type === "cancel") {
        setIsHovering(false);
      }
    });

    return () => {
      unlistenDragEnter.then((fn) => fn());
    };
  }, [addFilesToQueue]);

  return { isHovering };
};
