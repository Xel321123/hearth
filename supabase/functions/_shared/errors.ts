/** ApiError with HTTP status + machine-readable code. Thrown by handlers. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Map a PostgREST/supabase-js error to a stable ApiError. */
export function mapDbError(
  error: { code?: string; message?: string } | null,
  fallbackCode = "DB_ERROR",
): ApiError {
  const code = error?.code ?? "";
  const message = error?.message ?? "database error";
  if (code === "23505") return new ApiError(409, "CONFLICT", message);
  if (code === "23514") return new ApiError(400, "VALIDATION_ERROR", message);
  if (code === "42501") return new ApiError(403, "FORBIDDEN", "permission denied");
  if (code === "P0001") {
    if (message.includes("profile limit")) {
      return new ApiError(409, "PROFILE_LIMIT", "a household can have at most 5 profiles");
    }
    if (message.includes("does not belong")) {
      return new ApiError(403, "FOREIGN_PROFILE", "profile does not belong to this household");
    }
  }
  return new ApiError(400, fallbackCode, message);
}
