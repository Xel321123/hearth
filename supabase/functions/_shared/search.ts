/**
 * Search spec builder: #tag queries → exact tag containment; text queries →
 * full-text (websearch) with an ILIKE fallback for very short queries
 * (websearch_to_tsquery yields nothing for 1-2 char words).
 */
import { ApiError } from "./errors.ts";

export type SearchSpec =
  | { kind: "tag"; tag: string }
  | { kind: "text"; tsquery: string | null; ilike: string };

const TAG_RE = /^[a-zA-Z0-9_-]{1,30}$/;

export function buildSearchSpec(query: unknown): SearchSpec {
  const q = typeof query === "string" ? query.trim() : "";
  if (q.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "q must be a non-empty string");
  }
  if (q.length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "q must be at most 100 characters");
  }
  if (q.startsWith("#")) {
    const tag = q.slice(1);
    if (!TAG_RE.test(tag)) {
      throw new ApiError(400, "VALIDATION_ERROR", `invalid tag query: ${q}`);
    }
    return { kind: "tag", tag };
  }
  const ilike = `%${q}%`;
  const tsquery = q.length >= 3 ? q : null;
  return { kind: "text", tsquery, ilike };
}
