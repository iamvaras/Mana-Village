import {
  codeFromDbMessage,
  err,
  ok,
  type AppError,
  type AppErrorCode,
  type Result,
} from '@mana/core';

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

const FRIENDLY: Readonly<Record<AppErrorCode, string>> = {
  NETWORK: 'No internet connection. Please try again.',
  AUTH_REQUIRED: 'Please sign in again.',
  FORBIDDEN: "You don't have permission for this action.",
  NOT_FOUND: 'This item is not available.',
  VALIDATION: 'Please check the details and try again.',
  INVALID_TRANSITION: 'This issue was already updated. Please refresh.',
  CONFLICT: 'Someone else changed this. Please refresh.',
  RATE_LIMITED: 'Too many attempts. Please try again later.',
  UPLOAD_FAILED: 'Photo upload failed. Please try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

/** Message the UI can show. Detail stays in `message`; this never leaks internals. */
export function friendlyMessage(code: AppErrorCode): string {
  return FRIENDLY[code];
}

/**
 * "MV_VALIDATION: a department with this name already exists" → "A department with
 * this name already exists." The database writes these details for people to read.
 */
export function dbDetail(message: string): string {
  const text = message.replace(/^.*?MV_[A-Z_]+:\s*/s, '').trim();
  if (!text) return message;
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * Convert any Supabase / network error into an AppError.
 * Database functions raise "MV_<CODE>: detail" (see private.raise_app_error).
 */
export function toAppError(e: unknown): AppError {
  if (e === null || e === undefined) return { code: 'UNKNOWN', message: FRIENDLY.UNKNOWN };
  const x = (typeof e === 'object' ? e : { message: String(e) }) as ErrorLike;
  const message = typeof x.message === 'string' ? x.message : '';
  const code = typeof x.code === 'string' ? x.code : '';
  const status = typeof x.status === 'number' ? x.status : undefined;

  const fromDb = codeFromDbMessage(message);
  if (fromDb !== 'UNKNOWN') return { code: fromDb, message: dbDetail(message) };

  if (x.name === 'TypeError' && /fetch|network/i.test(message)) return { code: 'NETWORK', message };
  if (/Failed to fetch|Network request failed|NetworkError|ECONNREFUSED/i.test(message)) {
    return { code: 'NETWORK', message };
  }
  if (code === 'otp_expired' || /token has expired|invalid.*otp|otp.*invalid/i.test(message)) {
    return { code: 'VALIDATION', message, fields: { code: 'The code is wrong or expired.' } };
  }
  if (
    code === 'PGRST301' ||
    code === 'PGRST303' ||
    status === 401 ||
    /JWT|session/i.test(message)
  ) {
    return { code: 'AUTH_REQUIRED', message };
  }
  if (code === '42501' || status === 403) return { code: 'FORBIDDEN', message };
  if (code === '23514' || code === '23502' || code === '22P02' || code === '23505') {
    return { code: 'VALIDATION', message };
  }
  if (status === 429 || /rate limit|too many/i.test(message))
    return { code: 'RATE_LIMITED', message };
  return { code: 'UNKNOWN', message: message || FRIENDLY.UNKNOWN };
}

type DataOf<R> = R extends { data: infer D } ? D : null;

/** Run a Supabase call and wrap its `{ data, error }` into a Result. Never throws. */
export async function run<R extends { error: unknown }>(
  fn: () => PromiseLike<R>,
): Promise<Result<DataOf<R>>> {
  try {
    const res = await fn();
    if (res.error) return err(toAppError(res.error));
    const data = 'data' in res ? (res as { data: unknown }).data : null;
    return ok(data as DataOf<R>);
  } catch (e) {
    return err(toAppError(e));
  }
}

export function validationError(fields: Record<string, string>): Result<never> {
  return err({ code: 'VALIDATION', message: FRIENDLY.VALIDATION, fields });
}

/** Treat a missing `data` on success as an error (Supabase types allow null on the error branch). */
export function required<T>(res: Result<T | null>): Result<T> {
  if (!res.ok) return res;
  if (res.value === null) return err(toAppError({ message: 'empty response' }));
  return ok(res.value);
}
