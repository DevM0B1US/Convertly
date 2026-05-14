import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useQueueStore } from "../stores/queueStore";
import { addFiles } from "../lib/ipc";

export const useFileDrop = () => {
  const [isHovering, setIsHovering] = useState(false);
  const addFilesToQueue = useQueueStore((state) => state.addFiles);

  useEffect(() => {
    const unlistenDragEnter = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "over" || event.payload.type === "enter") {
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
      } else {
        setIsHovering(false);
      }
    });

    return () => {
      unlistenDragEnter.then((fn) => fn());
    };
  }, [addFilesToQueue]);

  return { isHovering };
};
