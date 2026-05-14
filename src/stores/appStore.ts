import { create } from "zustand";

export type AppView = "converter" | "history" | "queue";

interface AppState {
  isDark: boolean;
  activeView: AppView;
  toggleTheme: () => void;
  setView: (view: AppView) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  activeView: "converter",
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
  setView: (view) => set({ activeView: view }),
}));
