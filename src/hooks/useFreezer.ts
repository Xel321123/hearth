import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../types";
import type { FreezerView } from "../types";
import { api } from "../lib/api";
import type { FreezerInput } from "../lib/api";
import { enqueue } from "../lib/offline";
import { sortFreezerFifo } from "../lib/sort";
import { useHousehold } from "./useHousehold";
import { useOnline } from "./useOnline";
import { useSyncOnReconnect } from "./useSyncOnReconnect";
import { useToast } from "./useToast";

export interface UseFreezer {
  items: FreezerView[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: FreezerInput) => Promise<void>;
  consume: (item: FreezerView) => Promise<void>;
  restore: (item: FreezerView) => Promise<void>;
  remove: (item: FreezerView) => Promise<void>;
}

export function useFreezer(): UseFreezer {
  const { session } = useHousehold();
  const toast = useToast();
  const online = useOnline();
  const token = session?.accessToken ?? null;

  const [items, setItems] = useState<FreezerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.listFreezer(token, { consumed: false });
      setItems(sortFreezerFifo(res.items));
      setError(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 0)) {
        setError(err instanceof ApiError ? err.message : "Could not load freezer");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useSyncOnReconnect(load);

  const create = useCallback(
    async (input: FreezerInput) => {
      if (!token) return;
      if (!online) {
        enqueue({ base: "fn", path: "/freezer", method: "POST", query: undefined, body: input, token });
        toast.show("Offline — item queued, will sync when back online", "info");
        return;
      }
      try {
        await api.createFreezerItem(token, input);
        await load();
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not add item", "error");
      }
    },
    [token, online, load, toast],
  );

  const consume = useCallback(
    async (item: FreezerView) => {
      if (!token) return;
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, consumed: true, consumed_at: new Date().toISOString() } : i)),
      );
      if (!online) {
        enqueue({ base: "fn", path: "/freezer", method: "PATCH", query: { id: item.id }, body: { consumed: true }, token });
        toast.show("Offline — queued, will sync when back online", "info");
        return;
      }
      try {
        await api.updateFreezerItem(token, item.id, { consumed: true });
        await load();
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not update item", "error");
        await load();
      }
    },
    [token, online, load, toast],
  );

  const restore = useCallback(
    async (item: FreezerView) => {
      if (!token) return;
      if (!online) {
        enqueue({ base: "fn", path: "/freezer", method: "PATCH", query: { id: item.id }, body: { consumed: false }, token });
        toast.show("Offline — queued, will sync when back online", "info");
        return;
      }
      try {
        await api.updateFreezerItem(token, item.id, { consumed: false });
        await load();
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not restore item", "error");
      }
    },
    [token, online, load, toast],
  );

  const remove = useCallback(
    async (item: FreezerView) => {
      if (!token) return;
      if (!online) {
        enqueue({ base: "fn", path: "/freezer", method: "DELETE", query: { id: item.id }, body: undefined, token });
        toast.show("Offline — queued, will sync when back online", "info");
        return;
      }
      try {
        await api.deleteFreezerItem(token, item.id);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : "Could not delete item", "error");
      }
    },
    [token, online, toast],
  );

  return { items, loading, error, load, create, consume, restore, remove };
}
