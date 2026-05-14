import { invoke } from "@tauri-apps/api/core";
import { QueuedFile, FileMetadata } from "../types/file";

export const addFiles = async (paths: string[]): Promise<QueuedFile[]> => {
  return await invoke("add_files", { paths });
};

export const getFileInfo = async (path: string): Promise<FileMetadata> => {
  return await invoke("get_file_info", { path });
};

export const removeFile = async (id: string): Promise<void> => {
  return await invoke("remove_file", { id });
};

export const clearQueue = async (): Promise<void> => {
  return await invoke("clear_queue");
};

export const startConversion = async (items: QueuedFile[], outputDir?: string): Promise<void> => {
  return await invoke("start_conversion", { items, outputDir });
};
