import { create } from "zustand";

interface AppState {
  isDark: boolean;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
}));
