import { useState } from "react";
import { BottomNav } from "../components/BottomNav";
import type { TabId } from "../components/BottomNav";
import { IosInstallBanner } from "../components/IosInstallBanner";
import { NotifyPrompt } from "../components/NotifyPrompt";
import { ProfileSwitcher } from "../components/ProfileSwitcher";
import { useHousehold } from "../hooks/useHousehold";
import { useOnline } from "../hooks/useOnline";
import { FreezerView } from "./FreezerView";
import { HistoryView } from "./HistoryView";
import { SearchView } from "./SearchView";
import { TodosView } from "./TodosView";

/** Authenticated app shell: header + profile switcher + tab content + bottom nav. */
export function Shell() {
  const { session, activeProfile, logout } = useHousehold();
  const online = useOnline();
  const [tab, setTab] = useState<TabId>("todos");
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-xl" aria-hidden="true">
              🔥
            </span>
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-800"
              aria-label="Switch profile"
            >
              <span className="max-w-[9rem] truncate font-semibold text-slate-100">
                {activeProfile?.name ?? "Pick a profile"}
              </span>
              <span className="text-xs text-slate-500">▾</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs tracking-widest text-slate-400"
              title="Household code"
            >
              {session?.displayCode}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              aria-label="Leave household"
              title="Leave this household on this device"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-4">
        {!online && (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200" role="status">
            📡 Offline — changes are queued and will sync when you're back online.
          </div>
        )}
        <IosInstallBanner />
        <NotifyPrompt />
        {tab === "todos" && <TodosView />}
        {tab === "freezer" && <FreezerView />}
        {tab === "search" && <SearchView />}
        {tab === "history" && <HistoryView />}
      </main>

      <BottomNav active={tab} onChange={setTab} />
      <ProfileSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </div>
  );
}
