/** Application error codes shared by both apps. See docs/api.md §4. */
export const APP_ERROR_CODES = [
  'NETWORK',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'INVALID_TRANSITION',
  'CONFLICT',
  'RATE_LIMITED',
  'UPLOAD_FAILED',
  'UNKNOWN',
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  /** Field-level validation messages, keyed by field name. */
  readonly fields?: Readonly<Record<string, string>>;
}

export type Result<T, E = AppError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E = AppError>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Database functions raise errors whose message starts with one of these
 * prefixes (see private.raise_app_error in migrations).
 */
const DB_PREFIX_TO_CODE: Readonly<Record<string, AppErrorCode>> = {
  MV_FORBIDDEN: 'FORBIDDEN',
  MV_NOT_FOUND: 'NOT_FOUND',
  MV_VALIDATION: 'VALIDATION',
  MV_INVALID_TRANSITION: 'INVALID_TRANSITION',
  MV_CONFLICT: 'CONFLICT',
  MV_RATE_LIMIT: 'RATE_LIMITED',
  MV_AUTH_REQUIRED: 'AUTH_REQUIRED',
};

/** Map a database error message (e.g. "MV_FORBIDDEN: ...") to an app error code. */
export function codeFromDbMessage(message: string): AppErrorCode {
  const prefix = message.split(':', 1)[0]?.trim() ?? '';
  return DB_PREFIX_TO_CODE[prefix] ?? 'UNKNOWN';
}
