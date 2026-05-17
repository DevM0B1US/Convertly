import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppView = "converter" | "history";

interface AppState {
  isDark: boolean;
  activeView: AppView;
  toggleTheme: () => void;
  setView: (view: AppView) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isDark: typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true,
      activeView: "converter",
      toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
      setView: (view) => set({ activeView: view }),
    }),
    {
      name: "convertly-app-storage",
      partialize: (state) => ({ isDark: state.isDark }),
    }
  )
);
