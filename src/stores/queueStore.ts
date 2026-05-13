import { create } from "zustand";
import { QueuedFile } from "../types/file";

interface QueueState {
  items: QueuedFile[];
  addFiles: (files: QueuedFile[]) => void;
  removeFile: (id: string) => void;
  reorder: (from: number, to: number) => void;
  updateItem: (id: string, partial: Partial<QueuedFile>) => void;
  clearAll: () => void;
  selectItems: (ids: string[]) => void;
  selectedIds: string[];
}

export const useQueueStore = create<QueueState>((set) => ({
  items: [],
  selectedIds: [],
  addFiles: (files) => set((state) => ({ items: [...state.items, ...files] })),
  removeFile: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  reorder: (from, to) =>
    set((state) => {
      const items = [...state.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { items };
    }),
  updateItem: (id, partial) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...partial } : item
      ),
    })),
  clearAll: () => set({ items: [] }),
  selectItems: (ids) => set({ selectedIds: ids }),
}));
