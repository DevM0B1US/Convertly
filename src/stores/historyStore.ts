import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface HistoryEntry {
  id: string;
  fileName: string;
  sourceFormat: string;
  targetFormat: string;
  outputPath: string;
  timestamp: number;
  status: "done" | "error";
  error?: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: HistoryEntry) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries].slice(0, 200),
        })),
      clearHistory: () => set({ entries: [] }),
    }),
    { name: "convertly-history" }
  )
);
