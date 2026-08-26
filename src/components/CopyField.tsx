import { useState } from "react";

/** Value display + one-click copy (clipboard API with execCommand fallback). */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/30"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <div className="select-all rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 font-mono text-lg tracking-[0.2em] text-slate-100">
        {value}
      </div>
    </div>
  );
}
