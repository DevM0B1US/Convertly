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
        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center p-[3px] shadow-sm shrink-0 select-none pointer-events-none">
          <img src="/logo.avif" alt="Convertly" className="w-full h-full object-contain pointer-events-none" />
        </div>
        <span className="font-medium text-sm pointer-events-none">
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
          <Square size={16} />
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
