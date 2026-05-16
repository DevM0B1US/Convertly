import { useHistoryStore, type HistoryEntry } from "../../stores/historyStore";
import { Clock, FileDown, XCircle, Trash2, CheckCircle } from "lucide-react";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0 transition-colors hover:bg-muted/5">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        entry.status === "done" ? "bg-success/10 text-success" : "bg-error/10 text-error"
      }`}>
        {entry.status === "done" ? <CheckCircle size={16} /> : <XCircle size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{entry.fileName}</p>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-semibold">{entry.sourceFormat}</span>
          <span className="opacity-40">→</span>
          <span className="font-semibold">{entry.targetFormat}</span>
          <span className="opacity-40">•</span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatTime(entry.timestamp)}
          </span>
        </div>
        {entry.status === "error" && entry.error && (
          <p className="text-xs text-error mt-0.5 truncate">{entry.error}</p>
        )}
      </div>
      {entry.status === "done" && entry.outputPath && (
        <button
          onClick={() => {
            // Future: reveal in file manager
          }}
          className="p-1.5 rounded-md text-muted hover:text-text hover:bg-muted/10 transition-colors"
          title="Open file location"
        >
          <FileDown size={16} />
        </button>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const entries = useHistoryStore((state) => state.entries);
  const clearHistory = useHistoryStore((state) => state.clearHistory);

  if (entries.length === 0) {
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
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold text-text">Conversion History</h2>
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted hover:text-error hover:bg-error/10 transition-colors"
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
