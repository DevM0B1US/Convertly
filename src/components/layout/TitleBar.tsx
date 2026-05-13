import { Menu, Moon, Sun, Settings, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../stores/appStore";

export const TitleBar = () => {
  const { isDark, toggleTheme } = useAppStore();
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="h-10 flex items-center justify-between px-3 bg-surface border-b border-border select-none"
    >
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <button className="p-1 hover:bg-hover-bg rounded text-muted hover:text-text transition-colors">
          <Menu size={18} />
        </button>
        <span className="font-bold text-sm" data-tauri-drag-region>
          Octovert
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="p-1.5 hover:bg-hover-bg rounded text-muted hover:text-text transition-colors mr-1"
          title="Toggle Theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="p-1.5 hover:bg-hover-bg rounded text-muted hover:text-text transition-colors mr-2"
          title="Settings"
        >
          <Settings size={16} />
        </button>
        
        {/* Window controls */}
        <button
          onClick={() => appWindow.minimize()}
          className="p-1.5 hover:bg-hover-bg rounded text-muted hover:text-text transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="p-1.5 hover:bg-hover-bg rounded text-muted hover:text-text transition-colors"
        >
          <Square size={14} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="p-1.5 hover:bg-error hover:text-white rounded text-muted transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
