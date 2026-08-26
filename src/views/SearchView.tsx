import { useSearch } from "../hooks/useSearch";
import { useHousehold } from "../hooks/useHousehold";
import { Spinner } from "../components/Spinner";
import { formatRelativeDate } from "../lib/dates";

/** Global live search across tasks and freezer items (keywords + #tags). */
export function SearchView() {
  const { query, setQuery, results, loading, error } = useSearch();
  const { profiles } = useHousehold();
  const trimmed = query.trim();

  const showHint = trimmed.length === 0;
  const showResults = !showHint && !loading && results !== null;
  const empty =
    showResults && results.todos.length === 0 && results.freezer.length === 0 && !error;

  return (
    <section>
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks & freezer…  try  #dinner"
          maxLength={100}
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-3 pl-9 pr-8 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          aria-label="Search"
        />
        {trimmed && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-200"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {showHint && (
        <p className="mt-10 text-center text-sm text-slate-500">
          Search by keyword or <span className="text-indigo-400">#tag</span> — live, across tasks and the freezer.
        </p>
      )}

      {loading && <Spinner label="Searching…" />}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {empty && (
        <p className="mt-10 text-center text-sm text-slate-500">
          No results for “{trimmed}”
        </p>
      )}

      {showResults && (
        <div className="mt-4 space-y-5">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Tasks</h2>
              <span className="text-xs text-slate-500">{results.todos.length}</span>
            </div>
            {results.todos.length === 0 ? (
              <p className="text-sm text-slate-600">—</p>
            ) : (
              <ul className="space-y-2">
                {results.todos.map((t) => {
                  const assignee = profiles.find((p) => p.id === t.profile_id);
                  return (
                    <li key={t.id} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
                      <p className={`font-medium ${t.completed ? "text-slate-500 line-through" : "text-slate-100"}`}>{t.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                        {assignee && <span className="rounded-full bg-slate-800 px-2 py-0.5">{assignee.name}</span>}
                        {t.due_date && <span>Due {formatRelativeDate(t.due_date)}</span>}
                        {t.tags.map((tag) => (
                          <span key={tag} className="text-indigo-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Freezer</h2>
              <span className="text-xs text-slate-500">{results.freezer.length}</span>
            </div>
            {results.freezer.length === 0 ? (
              <p className="text-sm text-slate-600">—</p>
            ) : (
              <ul className="space-y-2">
                {results.freezer.map((i) => (
                  <li key={i.id} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
                    <p className={`font-medium ${i.consumed ? "text-slate-500 line-through" : "text-slate-100"}`}>
                      {i.name}
                      {i.quantity ? ` · ${i.quantity}` : ""}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                      <span>added {formatRelativeDate(i.added_date)}</span>
                      {i.tags.map((tag) => (
                        <span key={tag} className="text-indigo-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
