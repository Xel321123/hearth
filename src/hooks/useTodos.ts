import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../types";
import type { TodoView } from "../types";
import { api } from "../lib/api";
import type { TodoInput } from "../lib/api";
import { enqueue } from "../lib/offline";
import { sortTodosByDeadline } from "../lib/sort";
import { useHousehold } from "./useHousehold";
import { useOnline } from "./useOnline";
import { useSyncOnReconnect } from "./useSyncOnReconnect";
import { useToast } from "./useToast";

export type TodoFilter = "mine" | "household";

export interface UseTodos {
  todos: TodoView[];
  filter: TodoFilter;
  setFilter: (f: TodoFilter) => void;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: TodoInput) => Promise<void>;
  complete: (todo: TodoView) => Promise<void>;
  restore: (todo: TodoView) => Promise<void>;
  remove: (todo: TodoView) => Promise<void>;
}

export function useTodos(): UseTodos {
  const { session, activeProfile } = useHousehold();
  const toast = useToast();
  const online = useOnline();
  const token = session?.accessToken ?? null;
  const activeProfileId = activeProfile?.id ?? null;

  const [todos, setTodos] = useState<TodoView[]>([]);
  const [filter, setFilter] = useState<TodoFilter>("household");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.listTodos(token, {
        filter,
        activeProfileId: activeProfileId ?? undefined,
        completed: false,
      });
      setTodos(sortTodosByDeadline(res.todos));
      setError(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 0)) {
        setError(err instanceof ApiError ? err.message : "Could not load tasks");
      }
    } finally {
      setLoading(false);
    }
  }, [token, filter, activeProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useSyncOnReconnect(load);

  const create = useCallback(
    async (input: TodoInput) => {
      if (!token) return;
      if (!online) {
        enqueue({ base: "fn", path: "/todos", method: "POST", query: undefined, body: input, token });
        toast.show("Offline — task queued, will sync when back online", "info");
        return;
      }
      try {
        const created = await api.createTodo(token, input);
        // Targeted push: assigned to someone else's persona → notify their devices.
        if (input.profile_id !== activeProfileId) {
          void api
            .notifyTaskAssigned(token, {
              household_id: input.household_id,
              profile_id: input.profile_id,
              todo_id: created.id,
              title: created.title,
            })
            .catch(() => undefined);
        }
        await load();
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not create task", "error");
      }
    },
    [token, online, activeProfileId, load, toast],
  );

  const complete = useCallback(
    async (todo: TodoView) => {
      if (!token) return;
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, completed: true, completed_at: new Date().toISOString() } : t)),
      );
      if (!online) {
        enqueue({ base: "fn", path: "/todos", method: "PATCH", query: { id: todo.id }, body: { completed: true }, token });
        toast.show("Offline — queued, will sync when back online", "info");
        return;
      }
      try {
        await api.updateTodo(token, todo.id, { completed: true });
        await load();
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not update task", "error");
        await load();
      }
    },
    [token, online, load, toast],
  );

  const restore = useCallback(
    async (todo: TodoView) => {
      if (!token) return;
      if (!online) {
        enqueue({ base: "fn", path: "/todos", method: "PATCH", query: { id: todo.id }, body: { completed: false }, token });
        toast.show("Offline — queued, will sync when back online", "info");
        return;
      }
      try {
        await api.updateTodo(token, todo.id, { completed: false });
        await load();
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not restore task", "error");
      }
    },
    [token, online, load, toast],
  );

  const remove = useCallback(
    async (todo: TodoView) => {
      if (!token) return;
      if (!online) {
        enqueue({ base: "fn", path: "/todos", method: "DELETE", query: { id: todo.id }, body: undefined, token });
        toast.show("Offline — queued, will sync when back online", "info");
        return;
      }
      try {
        await api.deleteTodo(token, todo.id);
        setTodos((prev) => prev.filter((t) => t.id !== todo.id));
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not delete task", "error");
      }
    },
    [token, online, toast],
  );

  return { todos, filter, setFilter, loading, error, load, create, complete, restore, remove };
}
