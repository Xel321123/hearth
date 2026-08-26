/**
 * Minimal ambient stubs so `tsc -p supabase/tsconfig.json` can typecheck the
 * Edge Functions without resolving Deno / jsr: / npm: modules. These are
 * CHECK-ONLY declarations — the real types come from the runtime.
 * External APIs (supabase-js, web-push) are intentionally `any`-ish; our own
 * code in functions/** is fully strict-checked.
 */

declare namespace Deno {
  const env: {
    get(name: string): string | undefined;
  };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "jsr:@supabase/supabase-js@2" {
  export interface PostgrestError {
    code?: string;
    message?: string;
  }
  export interface SupabaseClient {
    from(table: string): any;
    rpc(fn: string, args?: Record<string, unknown>): Promise<{
      data: unknown;
      error: PostgrestError | null;
    }>;
  }
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): SupabaseClient;
}

declare module "npm:web-push@3.6.7" {
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: unknown,
      payload: string,
      options?: Record<string, unknown>,
    ): Promise<unknown>;
  };
  export default webpush;
}
