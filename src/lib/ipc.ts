import { invoke } from "@tauri-apps/api/core";
import { QueuedFile } from "../types/file";

export const addFiles = async (paths: string[]): Promise<QueuedFile[]> => {
  return await invoke("add_files", { paths });
};

export const startConversion = async (items: QueuedFile[], outputDir?: string, maxConcurrent?: number): Promise<void> => {
  return await invoke("start_conversion", { items, outputDir, maxConcurrent });
};

export const cancelConversion = async (id: string): Promise<void> => {
  return await invoke("cancel_conversion", { id });
};

