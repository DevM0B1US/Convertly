import { useEffect, memo } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { StatusBar } from "./components/layout/StatusBar";
import { SplitPane } from "./components/layout/SplitPane";
import { HistoryPanel } from "./components/history/HistoryPanel";
import { useAppStore } from "./stores/appStore";
import { useConversion } from "./hooks/useConversion";

import { Sidebar } from "./components/layout/Sidebar";
import { useSettingsStore } from "./stores/settingsStore";
import { downloadDir, join } from "@tauri-apps/api/path";

const Content = memo(({ activeView }: { activeView: string }) => {
  switch (activeView) {
    case "converter":
      return <SplitPane />;
    case "history":
      return <HistoryPanel />;
    default:
      return <SplitPane />;
  }
});
Content.displayName = "Content";

export function App() {
  const isDark = useAppStore((state) => state.isDark);
  const activeView = useAppStore((state) => state.activeView);
  const { outputDir, setOutputDir } = useSettingsStore();

  useConversion();

  useEffect(() => {
    const initDefaultDir = async () => {
      if (!outputDir) {
        try {
          const downloads = await downloadDir();
          const defaultPath = await join(downloads, "Convertly");
          setOutputDir(defaultPath);
        } catch (err) {
          console.error("Failed to set default output directory:", err);
        }
      }
    };
    initDefaultDir();
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-text transition-colors duration-300">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <Content activeView={activeView} />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
