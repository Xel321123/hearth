import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { FreezerView } from "../types";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
import { TagInput } from "../components/TagInput";
import { useFreezer } from "../hooks/useFreezer";
import { useHousehold } from "../hooks/useHousehold";
import { formatRelativeDate, todayIso } from "../lib/dates";

export function FreezerView() {
  const { items, loading, error, load, create, consume, remove } = useFreezer();
  const [modalOpen, setModalOpen] = useState(false);
  const knownTags = [...new Set(items.flatMap((i) => i.tags))].sort();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-200">Freezer</h2>
        <span className="text-xs text-slate-500">{items.length} items · oldest first</span>
      </div>

      {loading && items.length === 0 ? (
        <Spinner />
      ) : error && items.length === 0 ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="❄️"
          title="Freezer is empty"
          hint="Add what's in it — items are listed oldest first (FIFO) so nothing gets forgotten at the back."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              + Add item
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <FreezerRow key={item.id} item={item} onConsume={() => void consume(item)} onDelete={() => void remove(item)} />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-2xl text-white shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105 hover:bg-indigo-400 sm:right-[calc(50%-17rem)]"
        aria-label="Add freezer item"
      >
        +
      </button>

      <ItemModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={create} suggestions={knownTags} />
    </section>
  );
}

function FreezerRow({
  item,
  onConsume,
  onDelete,
}: {
  item: FreezerView;
  onConsume: () => void;
  onDelete: () => void;
}) {
  const { profiles } = useHousehold();
  const addedBy = item.profile_id ? profiles.find((p) => p.id === item.profile_id) : null;

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onConsume}
          className="mt-0.5 shrink-0 rounded-full border-2 border-slate-600 px-2.5 py-0.5 text-xs font-semibold text-slate-400 transition-colors hover:border-emerald-400 hover:text-emerald-300"
          aria-label={`Consumed: ${item.name}`}
        >
          Consumed
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-100">{item.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span>in {formatRelativeDate(item.added_date)}</span>
            {item.quantity && <span className="rounded-full bg-slate-800 px-2 py-0.5 font-medium text-slate-300">{item.quantity}</span>}
            {addedBy && <span className="text-slate-500">{addedBy.name}</span>}
            {item.tags.map((tag) => (
              <span key={tag} className="text-indigo-300">
                #{tag}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-slate-600 transition-colors hover:text-red-400"
          aria-label={`Delete item: ${item.name}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function ItemModal({
  open,
  onClose,
  onCreate,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    household_id: string;
    name: string;
    added_date: string | null;
    quantity: string | null;
    tags: string[];
    profile_id: string | null;
  }) => Promise<void>;
  suggestions: string[];
}) {
  const { session, activeProfile } = useHousehold();
  const [name, setName] = useState("");
  const [addedDate, setAddedDate] = useState(todayIso());
  const [quantity, setQuantity] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setAddedDate(todayIso());
      setQuantity("");
      setTags([]);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onCreate({
        household_id: session.householdId,
        name: trimmed,
        added_date: addedDate || null,
        quantity: quantity.trim() || null,
        tags,
        profile_id: activeProfile?.id ?? null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Add to freezer" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label htmlFor="item-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Name
          </label>
          <input
            id="item-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Frozen peas"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="item-date" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Date added
            </label>
            <input
              id="item-date"
              type="date"
              value={addedDate}
              onChange={(e) => setAddedDate(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              style={{ colorScheme: "dark" }}
            />
          </div>
          <div>
            <label htmlFor="item-qty" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Weight / qty <span className="normal-case text-slate-500">(optional)</span>
            </label>
            <input
              id="item-qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              maxLength={30}
              placeholder="500 g"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Tags</span>
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} placeholder="#meat #dinner" />
        </div>

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full rounded-xl bg-indigo-500 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add item"}
        </button>
      </form>
    </Modal>
  );
}
