import { useState } from "react";
import { useHousehold } from "../hooks/useHousehold";
import { usePush } from "../hooks/usePush";
import { storage } from "../lib/storage";

/** In-app prompt to enable Web Push for the active profile on this device. */
export function NotifyPrompt() {
  const { session, activeProfile } = useHousehold();
  const { state, busy, enable } = usePush();
  const [dismissed, setDismissed] = useState(() => storage.getItem("hearth:notify_dismissed") === "1");

  if (!session || !activeProfile || state === "unsupported" || state === "registered" || state === "denied" || dismissed) {
    return null;
  }

  return (
    <div className="mb-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-sm text-slate-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Get notified on this device</p>
          <p className="mt-0.5 text-slate-300">
            Tasks assigned to <span className="font-medium text-indigo-300">{activeProfile.name}</span> will ping this
            device — even when the app is closed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            storage.setItem("hearth:notify_dismissed", "1");
            setDismissed(true);
          }}
          className="text-slate-500 hover:text-slate-300"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void enable()}
        className="mt-2 w-full rounded-lg bg-indigo-500 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {busy ? "Enabling…" : "Enable notifications"}
      </button>
    </div>
  );
}
