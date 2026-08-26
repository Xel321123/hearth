import { useEffect, useState } from "react";
import { ApiError } from "../types";
import type { SearchResponse } from "../types";
import { api } from "../lib/api";
import { useDebounced } from "./useDebounced";
import { useHousehold } from "./useHousehold";

export interface UseSearch {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResponse | null;
  loading: boolean;
  error: string | null;
}

/** Debounced live search across todos + freezer (keywords and #tags). */
export function useSearch(): UseSearch {
  const { session } = useHousehold();
  const token = session?.accessToken ?? null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounced = useDebounced(query.trim(), 300);

  useEffect(() => {
    if (!token) return;
    const active = debounced.length > 0 && (debounced.length >= 2 || debounced.startsWith("#"));
    if (!active) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .search(token, debounced)
      .then((r) => {
        if (!cancelled) {
          setResults(r);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, token]);

  return { query, setQuery, results, loading, error };
}
