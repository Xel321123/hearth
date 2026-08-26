import type { ReactNode } from "react";

export function EmptyState({ icon, title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-800 px-6 py-12 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <p className="font-medium text-slate-300">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}
