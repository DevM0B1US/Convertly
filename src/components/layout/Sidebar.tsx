import { ArrowLeftRight, FileText, HelpCircle, Moon, Sun } from "lucide-react";
import { useAppStore, AppView } from "../../stores/appStore";

interface NavButtonProps {
  icon: React.ReactNode;
  view?: AppView;
  label: string;
  activeView?: AppView;
  onClick: () => void;
}

const NavButton = ({ icon, view, label, activeView, onClick }: NavButtonProps) => {
  const isActive = view !== undefined && activeView === view;
  return (
    <div className="relative w-full group">
      <button
        onClick={onClick}
        title={label}
        className={`relative p-3 w-full flex justify-center rounded-md transition-all duration-150
          ${isActive
            ? "text-primary"
            : "text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
          }`}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md" />
        )}
        {icon}
      </button>

      {/* Tooltip */}
      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded
        opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 z-50">
        {label}
      </div>
    </div>
  );
};

export const Sidebar = () => {
  const activeView = useAppStore((s) => s.activeView);
  const setView = useAppStore((s) => s.setView);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const theme = useAppStore((s) => s.isDark);

  return (
    <div className="w-16 bg-surface border-r border-border flex flex-col items-center py-4 justify-between h-full transition-colors duration-300">
      {/* Top nav */}
      <div className="flex flex-col gap-1 w-full">
        <NavButton
          icon={<ArrowLeftRight size={22} strokeWidth={1.5} />}
          view="converter"
          label="Converter"
          activeView={activeView}
          onClick={() => setView("converter")}
        />
        <NavButton
          icon={<FileText size={22} strokeWidth={1.5} />}
          view="history"
          label="History"
          activeView={activeView}
          onClick={() => setView("history")}
        />
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-1 w-full">
        <NavButton
          icon={theme ? <Sun size={22} strokeWidth={1.5} /> : <Moon size={22} strokeWidth={1.5} />}
          label="Toggle Theme"
          onClick={toggleTheme}
        />
        <NavButton
          icon={<HelpCircle size={22} strokeWidth={1.5} />}
          label="Help"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.open("https://github.com/DevM0B1US/Convertly", "_blank");
            }
          }}
        />
      </div>
    </div>
  );
};
