import { create } from "zustand";

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

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: JSON.parse(localStorage.getItem("convertly-history") || "[]"),
  addEntry: (entry) =>
    set((state) => {
      const entries = [entry, ...state.entries].slice(0, 200);
      localStorage.setItem("convertly-history", JSON.stringify(entries));
      return { entries };
    }),
  clearHistory: () => {
    localStorage.setItem("convertly-history", "[]");
    set({ entries: [] });
  },
}));
