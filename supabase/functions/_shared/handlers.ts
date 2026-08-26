/** Handler wrapper: CORS preflight, ApiError mapping, uniform error body. */
import { ApiError } from "./errors.ts";
import { corsPreflight, json } from "./cors.ts";

export type Handler = (req: Request) => Promise<Response> | Response;

export function handle(fn: Handler): Handler {
  return async (req) => {
    const preflight = corsPreflight(req);
    if (preflight) return preflight;
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ApiError) {
        return json({ error: { code: e.code, message: e.message } }, e.status);
      }
      console.error("unhandled error:", e);
      return json(
        { error: { code: "INTERNAL_ERROR", message: "internal server error" } },
        500,
      );
    }
  };
}

/** Parse a JSON body, rejecting malformed input. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("not an object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "request body must be a JSON object");
  }
}
