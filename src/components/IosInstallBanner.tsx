import { useState } from "react";
import { storage } from "../lib/storage";

/**
 * Standalone install instructions for iOS Safari, where the install prompt
 * API doesn't exist. Shown only on iOS Safari in a browser tab.
 */
export function IosInstallBanner() {
  const [dismissed, setDismissed] = useState(() => storage.getItem("hearth:ios_banner_dismissed") === "1");
  if (dismissed) return null;

  const isIosSafari = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true);
  if (!isIosSafari || standalone) return null;

  const dismiss = () => {
    storage.setItem("hearth:ios_banner_dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="mb-3 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-200">
      <div className="flex items-start justify-between gap-2">
        <p>
          <span className="font-semibold">Install Hearth</span> — tap{" "}
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs">Share</span> →{" "}
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs">Add to Home Screen</span> for a
          full-screen, offline-first app.
        </p>
        <button type="button" onClick={dismiss} className="text-slate-500 hover:text-slate-300" aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
