import { useEffect } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { StatusBar } from "./components/layout/StatusBar";
import { SplitPane } from "./components/layout/SplitPane";
import { useAppStore } from "./stores/appStore";

import { Sidebar } from "./components/layout/Sidebar";

function App() {
  const isDark = useAppStore((state) => state.isDark);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-text">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          <SplitPane />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
