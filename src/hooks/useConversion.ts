import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueueStore } from "../stores/queueStore";
import { useHistoryStore } from "../stores/historyStore";
import { useSettingsStore } from "../stores/settingsStore";

let globalAudioCtx: AudioContext | null = null;

const showDesktopNotification = (succeeded: number, failed: number) => {
  if (!("Notification" in window)) return;

  const sendNotification = () => {
    const title = "Conversion Complete!";
    const body =
      failed > 0
        ? `Successfully converted ${succeeded} file${
            succeeded !== 1 ? "s" : ""
          }. ${failed} file${failed !== 1 ? "s" : ""} failed.`
        : `All ${succeeded} file${
            succeeded !== 1 ? "s" : ""
          } successfully converted!`;

    try {
      new Notification(title, {
        body,
        icon: "/logo.avif",
      });
    } catch (err) {
      console.error("Failed to display desktop notification:", err);
    }
  };

  if (Notification.permission === "granted") {
    sendNotification();
  } else if (Notification.permission !== "denied") {
    try {
      const handlePermissionResult = (permission: NotificationPermission) => {
        if (permission === "granted") {
          sendNotification();
        }
      };

      // Support both callback-based (older WebKit) and promise-based requestPermission APIs safely
      const permissionPromise = Notification.requestPermission(handlePermissionResult);
      if (permissionPromise && typeof permissionPromise.then === "function") {
        permissionPromise
          .then(handlePermissionResult)
          .catch((err) => {
            console.warn("Desktop notification permission promise rejected:", err);
          });
      }
    } catch (err) {
      console.warn("Desktop notification permission request threw an error:", err);
    }
  }
};

const playSuccessChime = async () => {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!globalAudioCtx) {
      globalAudioCtx = new AudioContextClass();
    }

    const ctx = globalAudioCtx;
    
    // Autoplay waker w/ check for suspended state
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (resumeErr) {
        console.warn("Failed to resume global AudioContext waker:", resumeErr);
      }
    }

    const now = ctx.currentTime;

    // Synthesize note 1 (E5, 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Synthesize note 2 (A5, 880.00 Hz) - arpeggiated slightly later
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.00, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.6);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.7);
  } catch (err) {
    console.error("Failed to play success chime:", err);
  }
};

export const useConversion = () => {
  const updateItem = useQueueStore((state) => state.updateItem);
  const addHistoryEntry = useHistoryStore((state) => state.addEntry);
  const items = useQueueStore((state) => state.items);
  const wasConvertingRef = useRef(false);

  // Monitor the entire queue for state transitions (converting -> completed)
  useEffect(() => {
    const isConverting = items.some(
      (item) => item.status === "converting" || item.status === "queued"
    );

    if (isConverting) {
      wasConvertingRef.current = true;
    } else if (wasConvertingRef.current) {
      wasConvertingRef.current = false;

      const doneCount = items.filter((item) => item.status === "done").length;
      const errorCount = items.filter((item) => item.status === "error").length;

      // Only notify if there is at least one result in the current batch
      if (doneCount > 0 || errorCount > 0) {
        showDesktopNotification(doneCount, errorCount);
        playSuccessChime();
      }
    }
  }, [items]);

  useEffect(() => {
    let active = true;
    let unlistenProgress: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupListeners = async () => {
      const uProgress = await listen<{ id: string; percent: number }>(
        "conversion:progress",
        (event) => {
          if (active) {
            // Cap ticker progress at 99.9 to ensure it never prematurely displays 100% in UI
            const percent = Math.min(Math.max(event.payload.percent, 0), 99.9);
            updateItem(event.payload.id, { progress: percent });
          }
        }
      );
      if (!active) {
        uProgress();
        return;
      }
      unlistenProgress = uProgress;

      const uComplete = await listen<{
        id: string;
        output_path: string;
      }>("conversion:complete", (event) => {
        if (active) {
          const { id, output_path } = event.payload;
          updateItem(id, { status: "done", progress: 100 });
          
          const item = useQueueStore.getState().items.find((i) => i.id === id);
          if (item) {
            const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
            const globalFormat = useSettingsStore.getState().globalFormat;
            addHistoryEntry({
              id,
              fileName: item.fileName,
              sourceFormat: ext.toUpperCase(),
              targetFormat: (item.settings?.targetFormat || globalFormat || "webp").toUpperCase(),
              outputPath: output_path,
              timestamp: Date.now(),
              status: "done",
            });
          }
        }
      });
      if (!active) {
        uComplete();
        return;
      }
      unlistenComplete = uComplete;

      const uError = await listen<{ id: string; error: string }>(
        "conversion:error",
        (event) => {
          if (active) {
            updateItem(event.payload.id, { status: "error", error: event.payload.error });
            
            // Log error in conversion history as well
            const item = useQueueStore.getState().items.find((i) => i.id === event.payload.id);
            if (item) {
              const ext = item.fileName.split(".").pop()?.toLowerCase() || "";
              addHistoryEntry({
                id: event.payload.id,
                fileName: item.fileName,
                sourceFormat: ext.toUpperCase(),
                targetFormat: (item.settings?.targetFormat || "webp").toUpperCase(),
                outputPath: "",
                timestamp: Date.now(),
                status: "error",
                error: event.payload.error,
              });
            }
          }
        }
      );
      if (!active) {
        uError();
        return;
      }
      unlistenError = uError;
    };

    setupListeners();

    return () => {
      active = false;
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };
  }, [updateItem, addHistoryEntry]);
};

