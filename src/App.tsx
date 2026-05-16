import { useEffect } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { StatusBar } from "./components/layout/StatusBar";
import { SplitPane } from "./components/layout/SplitPane";
import { useAppStore } from "./stores/appStore";

import { Sidebar } from "./components/layout/Sidebar";
import { useSettingsStore } from "./stores/settingsStore";
import { downloadDir, join } from "@tauri-apps/api/path";

function App() {
  const isDark = useAppStore((state) => state.isDark);
  const activeView = useAppStore((state) => state.activeView);
  const { outputDir, setOutputDir } = useSettingsStore();

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

  const renderContent = () => {
    switch (activeView) {
      case "converter":
        return <SplitPane />;
      case "history":
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted p-8">
            <div className="w-16 h-16 mb-4 rounded-full bg-muted/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text mb-2">Conversion History</h2>
            <p className="text-center max-w-xs">Your past conversions will appear here once you've completed some tasks.</p>
          </div>
        );
      case "queue":
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted p-8">
            <div className="w-16 h-16 mb-4 rounded-full bg-muted/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h18" />
                <path d="M3 6h18" />
                <path d="M3 18h18" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text mb-2">Task Queue</h2>
            <p className="text-center max-w-xs">You can manage all your active and pending conversion tasks here.</p>
          </div>
        );
      default:
        return <SplitPane />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-text transition-colors duration-300">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
