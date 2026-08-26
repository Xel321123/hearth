/**
 * Strict input validation for every payload, mirroring the DB CHECK
 * constraints (0002_core_schema.sql). Handlers MUST run every client field
 * through these before touching the database.
 */
import { ApiError } from "./errors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG_RE = /^[a-zA-Z0-9_-]{1,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY_CODE_RE = /^[A-HJ-KM-NP-TV-Z2-9]{6}$/;

function invalid(code: string, message: string): never {
  throw new ApiError(400, code, message);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid("VALIDATION_ERROR", `${field} must be a non-empty string`);
  }
  return value.trim();
}

export function validateUuid(value: unknown, field = "id"): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(s)) invalid("VALIDATION_ERROR", `${field} must be a valid UUID`);
  return s.toLowerCase();
}

/** Household join code input: trim + uppercase + 6-char alphabet check. */
export function validateDisplayCodeInput(value: unknown): string {
  const s = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!DISPLAY_CODE_RE.test(s)) {
    invalid("VALIDATION_ERROR", "display_code must be 6 characters from the household alphabet");
  }
  return s;
}

/** Password as submitted at join time. Created passwords are 16 chars. */
export function validatePasswordInput(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    invalid("VALIDATION_ERROR", "password must be 8-128 characters");
  }
  return value;
}

export function validateProfileName(value: unknown): string {
  const s = requiredString(value, "name");
  if (s.length > 40) invalid("VALIDATION_ERROR", "name must be at most 40 characters");
  return s;
}

export function validateTodoTitle(value: unknown): string {
  const s = requiredString(value, "title");
  if (s.length > 200) invalid("VALIDATION_ERROR", "title must be at most 200 characters");
  return s;
}

export function validateItemName(value: unknown): string {
  const s = requiredString(value, "name");
  if (s.length > 200) invalid("VALIDATION_ERROR", "name must be at most 200 characters");
  return s;
}

/**
 * Tags: accepts strings with or without a leading '#', stores them WITHOUT
 * the '#'. Max 20, each 1-30 chars of [a-zA-Z0-9_-], no whitespace.
 */
export function validateTags(value: unknown): string[] {
  if (!Array.isArray(value)) invalid("VALIDATION_ERROR", "tags must be an array");
  if (value.length > 20) invalid("VALIDATION_ERROR", "at most 20 tags allowed");
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") invalid("VALIDATION_ERROR", "each tag must be a string");
    const tag = raw.trim().replace(/^#+/, "");
    if (!TAG_RE.test(tag)) {
      invalid(
        "VALIDATION_ERROR",
        `invalid tag "${raw}": 1-30 chars of letters, digits, _ or - (no spaces)`,
      );
    }
    out.push(tag);
  }
  return out;
}

export function validateQuantity(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = requiredString(value, "quantity");
  if (s.length > 30) invalid("VALIDATION_ERROR", "quantity must be at most 30 characters");
  return s;
}

export function validateDueDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = requiredString(value, "due_date");
  if (!DATE_RE.test(s)) invalid("VALIDATION_ERROR", "due_date must be YYYY-MM-DD");
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    invalid("VALIDATION_ERROR", "due_date is not a real calendar date");
  }
  return s;
}

export function validateSearchQuery(value: unknown): string {
  const s = requiredString(value, "q");
  if (s.length > 100) invalid("VALIDATION_ERROR", "query must be at most 100 characters");
  return s;
}

export function validateBooleanParam(value: string | null, field: string): boolean | null {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  invalid("VALIDATION_ERROR", `${field} must be true or false`);
}
