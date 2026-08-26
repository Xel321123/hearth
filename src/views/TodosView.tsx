import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { TodoView } from "../types";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
import { TagInput } from "../components/TagInput";
import { useHousehold } from "../hooks/useHousehold";
import { useTodos } from "../hooks/useTodos";
import type { TodoFilter } from "../hooks/useTodos";
import { formatRelativeDate, todayIso } from "../lib/dates";

export function TodosView() {
  const { todos, filter, setFilter, loading, error, load, create, complete, remove } = useTodos();
  const [modalOpen, setModalOpen] = useState(false);

  const knownTags = [...new Set(todos.flatMap((t) => t.tags))].sort();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex rounded-lg bg-slate-800/80 p-0.5 text-sm font-medium">
          {(["mine", "household"] as TodoFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 transition-colors ${filter === f ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {f === "mine" ? "My Tasks" : "Household"}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{todos.length} open</span>
      </div>

      {loading && todos.length === 0 ? (
        <Spinner />
      ) : error && todos.length === 0 ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : todos.length === 0 ? (
        <EmptyState
          icon="✅"
          title={filter === "mine" ? "Nothing assigned to you" : "No open tasks"}
          hint={
            filter === "mine"
              ? "Tasks other members assign to you will show up here."
              : "Add a task — it lands on the household list, sorted by nearest deadline."
          }
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              + Add task
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onComplete={() => void complete(todo)} onDelete={() => void remove(todo)} />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-2xl text-white shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105 hover:bg-indigo-400 sm:right-[calc(50%-17rem)]"
        aria-label="Add task"
      >
        +
      </button>

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={create} suggestions={knownTags} />
    </section>
  );
}

function TodoRow({
  todo,
  onComplete,
  onDelete,
}: {
  todo: TodoView;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { profiles } = useHousehold();
  const assignee = profiles.find((p) => p.id === todo.profile_id);
  const today = todayIso();
  const overdue = todo.due_date !== null && todo.due_date < today;

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onComplete}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 text-transparent transition-colors hover:border-indigo-400 hover:text-indigo-400"
          aria-label={`Mark done: ${todo.title}`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${overdue ? "text-red-300" : "text-slate-100"}`}>{todo.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            {todo.due_date && (
              <span
                className={
                  overdue
                    ? "font-semibold text-red-400"
                    : todo.due_date === today
                      ? "font-semibold text-amber-300"
                      : ""
                }
              >
                Due {formatRelativeDate(todo.due_date)}
              </span>
            )}
            {assignee && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 font-medium text-slate-300">{assignee.name}</span>
            )}
            {todo.tags.map((tag) => (
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
          aria-label={`Delete task: ${todo.title}`}
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

function TaskModal({
  open,
  onClose,
  onCreate,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { household_id: string; profile_id: string; title: string; due_date: string | null; tags: string[] }) => Promise<void>;
  suggestions: string[];
}) {
  const { session, profiles, activeProfile } = useHousehold();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [profileId, setProfileId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDueDate("");
      setProfileId(activeProfile?.id ?? "");
      setTags([]);
    }
  }, [open, activeProfile?.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const trimmed = title.trim();
    if (!trimmed || !profileId) return;
    setSaving(true);
    try {
      await onCreate({
        household_id: session.householdId,
        profile_id: profileId,
        title: trimmed,
        due_date: dueDate || null,
        tags,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="New task" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label htmlFor="task-title" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Title
          </label>
          <input
            id="task-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Buy oat milk"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="task-due" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Due date <span className="normal-case text-slate-500">(optional)</span>
          </label>
          <input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            style={{ colorScheme: "dark" }}
          />
        </div>

        <div>
          <label htmlFor="task-profile" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Assigned to
          </label>
          <select
            id="task-profile"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            style={{ colorScheme: "dark" }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Tags</span>
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} placeholder="#errands #urgent" />
        </div>

        <button
          type="submit"
          disabled={saving || !title.trim() || !profileId}
          className="w-full rounded-xl bg-indigo-500 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add task"}
        </button>
      </form>
    </Modal>
  );
}
