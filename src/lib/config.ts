/**
 * Environment access with a Node fallback so the same modules run in
 * `node --test` suites (import.meta.env is Vite-only; tests read process.env).
 */
interface HearthEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_VAPID_PUBLIC_KEY?: string;
}

function readEnv(): HearthEnv {
  const viteEnv = (import.meta as { env?: HearthEnv }).env;
  if (viteEnv) return viteEnv;
  const procEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  return { ...procEnv } as HearthEnv;
}

const env = readEnv();

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? "";
export const VAPID_PUBLIC_KEY: string = env.VITE_VAPID_PUBLIC_KEY ?? "";

/** Fail fast in the browser if the app was built without env config. */
export function assertClientEnv(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example → .env (see AGENTS.md).");
  }
}
