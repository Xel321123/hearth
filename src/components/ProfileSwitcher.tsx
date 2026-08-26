import { useState } from "react";
import { ApiError } from "../types";
import { useHousehold } from "../hooks/useHousehold";
import { useToast } from "../hooks/useToast";
import { Modal } from "./Modal";

/** Pick (or add) the household member this device acts as. Persisted locally. */
export function ProfileSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles, activeProfile, setActiveProfile, addProfile } = useHousehold();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const atCap = profiles.length >= 5;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await addProfile(trimmed);
      setAdding(false);
      setName("");
      toast.show(`Profile "${trimmed}" added`, "success");
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Could not add profile", "error");
    }
  };

  return (
    <Modal open={open} title={`Who's using this device? (${profiles.length}/5)`} onClose={onClose}>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                setActiveProfile(p.id);
                onClose();
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                activeProfile?.id === p.id
                  ? "bg-indigo-500/20 font-semibold text-indigo-200"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{p.name}</span>
              {activeProfile?.id === p.id && <span className="text-indigo-400">✓</span>}
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="New member's name"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setName("");
            }}
            className="rounded-xl px-2 text-slate-400 hover:text-slate-200"
            aria-label="Cancel"
          >
            ✕
          </button>
        </form>
      ) : atCap ? (
        <p className="mt-3 text-xs text-slate-500">A household can hold up to 5 profiles.</p>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
        >
          + Add profile
        </button>
      )}
    </Modal>
  );
}
