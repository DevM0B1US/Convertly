import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const TitleBar = () => {
  const appWindow = getCurrentWindow();

  return (
    <div className="h-10 flex items-center justify-between bg-primary text-white select-none">
      {/* Drag region: clicking & dragging here moves the window */}
      <div
        onMouseDown={(e) => {
          // Only drag on primary button, not inside button children
          if (e.button === 0) appWindow.startDragging();
        }}
        className="flex-1 flex items-center gap-2 px-3 h-full cursor-grab active:cursor-grabbing select-none"
      >
        {/* Simple Octopus SVG icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
          <circle cx="12" cy="10" r="5" />
          <path d="M12 15c-2.5 0-4.5 1-4.5 3 0 1.5.5 3 2 3s2.5-1.5 2.5-1.5 1 1.5 2.5 1.5 2 1.5 2-1.5c0-2-2-3-4.5-3Z" />
          <path d="M7 13c-2 0-4 1-4 3 0 1.5.5 3 2 3s2.5-1.5 2.5-1.5" />
          <path d="M17 13c2 0 4 1 4 3 0 1.5-.5 3-2 3s-2.5-1.5-2.5-1.5" />
        </svg>
        <span className="font-medium text-sm" style={{ pointerEvents: "none" }}>
          Convertly - File Converter
        </span>
      </div>

      {/* Window controls: NOT inside drag region so clicks are received */}
      <div className="flex items-center gap-1 px-2 h-full shrink-0">
        <button
          onClick={() => appWindow.minimize()}
          title="Minimize"
          className="p-1.5 hover:bg-white/20 rounded transition-colors cursor-pointer"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          title="Maximize"
          className="p-1.5 hover:bg-white/20 rounded transition-colors cursor-pointer"
        >
          <Square size={14} />
        </button>
        <button
          onClick={() => appWindow.close()}
          title="Close"
          className="p-1.5 hover:bg-red-500 rounded transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
