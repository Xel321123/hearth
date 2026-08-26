import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../types";
import type { FreezerView, TodoView } from "../types";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { api } from "../lib/api";
import { compareTsDesc } from "../lib/sort";
import { formatRelativeDate } from "../lib/dates";
import { useHousehold } from "../hooks/useHousehold";
import { useSyncOnReconnect } from "../hooks/useSyncOnReconnect";
import { useToast } from "../hooks/useToast";

/** Completed tasks + consumed freezer items (archives). */
export function HistoryView() {
  const { session } = useHousehold();
  const toast = useToast();
  const token = session?.accessToken ?? null;

  const [completedTodos, setCompletedTodos] = useState<TodoView[]>([]);
  const [consumed, setConsumed] = useState<FreezerView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [todos, freezer] = await Promise.all([
        api.listTodos(token, { completed: true }),
        api.listFreezer(token, { consumed: true }),
      ]);
      setCompletedTodos([...todos.todos].sort((a, b) => compareTsDesc(a.completed_at, b.completed_at)));
      setConsumed([...freezer.items].sort((a, b) => compareTsDesc(a.consumed_at, b.consumed_at)));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 0)) {
        toast.show(err instanceof ApiError ? err.message : "Could not load history", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useSyncOnReconnect(load);

  const restoreTodo = async (todo: TodoView) => {
    if (!token) return;
    try {
      await api.updateTodo(token, todo.id, { completed: false });
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Could not restore task", "error");
    }
  };

  const restoreItem = async (item: FreezerView) => {
    if (!token) return;
    try {
      await api.updateFreezerItem(token, item.id, { consumed: false });
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Could not restore item", "error");
    }
  };

  if (loading) return <Spinner />;

  const empty = completedTodos.length === 0 && consumed.length === 0;
  if (empty) {
    return (
      <EmptyState
        icon="🗂️"
        title="Nothing archived yet"
        hint="Tasks you mark done and freezer items you consume land here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-200">Completed tasks</h2>
          <span className="text-xs text-slate-500">{completedTodos.length}</span>
        </div>
        {completedTodos.length === 0 ? (
          <p className="text-sm text-slate-500">No completed tasks yet.</p>
        ) : (
          <ul className="space-y-2">
            {completedTodos.map((todo) => (
              <li key={todo.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-300 line-through decoration-slate-600">{todo.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    done {todo.completed_at ? formatRelativeDate(todo.completed_at.slice(0, 10)) : ""}
                    {todo.tags.map((tag) => (
                      <span key={tag} className="ml-2 text-indigo-300">
                        #{tag}
                      </span>
                    ))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void restoreTodo(todo)}
                  className="shrink-0 text-xs font-semibold text-slate-400 hover:text-indigo-300"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-200">Consumed items</h2>
          <span className="text-xs text-slate-500">{consumed.length}</span>
        </div>
        {consumed.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing consumed yet.</p>
        ) : (
          <ul className="space-y-2">
            {consumed.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-300 line-through decoration-slate-600">
                    {item.name}
                    {item.quantity ? ` · ${item.quantity}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    consumed {item.consumed_at ? formatRelativeDate(item.consumed_at.slice(0, 10)) : ""}
                    {item.tags.map((tag) => (
                      <span key={tag} className="ml-2 text-indigo-300">
                        #{tag}
                      </span>
                    ))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void restoreItem(item)}
                  className="shrink-0 text-xs font-semibold text-slate-400 hover:text-indigo-300"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
