import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../types";
import type { CreateHouseholdResponse } from "../types";
import { api } from "../lib/api";
import { useHousehold } from "../hooks/useHousehold";
import { CopyField } from "../components/CopyField";

/** Landing: join an existing household or create a new one (no PII anywhere). */
export function AuthView() {
  const { join, busy, adoptCreated } = useHousehold();
  const [mode, setMode] = useState<"join" | "create">("join");

  // Join form
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  // Create form
  const [name, setName] = useState("");
  // One-time credentials reveal
  const [credentials, setCredentials] = useState<CreateHouseholdResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const joinValid = code.length === 6 && password.length >= 8;

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinValid) return;
    setError(null);
    try {
      await join(code, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join household");
    }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createHousehold(name.trim() || undefined);
      setCredentials(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create household");
    }
  };

  if (credentials) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-5 text-center">
            <div className="text-4xl">🔑</div>
            <h1 className="mt-2 text-xl font-bold text-slate-100">Your household is ready</h1>
            <p className="mt-1 text-sm text-slate-400">Save these — they're the only way back in.</p>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <CopyField label="Household code" value={credentials.display_code} />
            <CopyField label="Password" value={credentials.password} />
          </div>

          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <p className="font-semibold">⚠️ No recovery. Ever.</p>
            <p className="mt-1 text-amber-200/80">
              Hearth has no accounts and no password reset — by design. If you lose the code or password, the
              household and its data are gone forever. Write them down or save them in your password manager.
            </p>
          </div>

          <button
            type="button"
            onClick={() => adoptCreated(credentials)}
            className="mt-5 w-full rounded-xl bg-indigo-500 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400"
          >
            I've saved them — open Hearth
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-4xl">🔥</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">Hearth</h1>
          <p className="mt-1 text-sm text-slate-400">
            One todo list &amp; freezer for your household.
            <br />
            No accounts. No email. Just a code.
          </p>
        </div>

        <div className="mb-4 flex rounded-xl bg-slate-800/80 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setMode("join");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 transition-colors ${mode === "join" ? "bg-indigo-500 text-white" : "text-slate-400"}`}
          >
            Join
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("create");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 transition-colors ${mode === "create" ? "bg-indigo-500 text-white" : "text-slate-400"}`}
          >
            New household
          </button>
        </div>

        {mode === "join" ? (
          <form onSubmit={(e) => void onJoin(e)} className="space-y-3">
            <div>
              <label htmlFor="join-code" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Household code
              </label>
              <input
                id="join-code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="ABCDEF"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3 text-center font-mono text-lg tracking-[0.35em] text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="join-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Password
              </label>
              <input
                id="join-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Household password"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3 text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={!joinValid || busy}
              className="w-full rounded-xl bg-indigo-500 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:opacity-40"
            >
              {busy ? "Joining…" : "Join household"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void onCreate(e)} className="space-y-3">
            <div>
              <label htmlFor="create-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Your name <span className="normal-case text-slate-500">(optional)</span>
              </label>
              <input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Alex"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3 text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-500 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create household"}
            </button>
            <p className="text-center text-xs text-slate-500">
              You'll get a one-time code &amp; password. Share them with your household — that's the only secret.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
