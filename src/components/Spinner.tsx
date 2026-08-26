export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-slate-500" role="status">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
