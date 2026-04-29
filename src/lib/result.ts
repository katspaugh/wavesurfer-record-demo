export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E = AppError> = Ok<T> | Err<E>

export type AppErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'not-found'
  | 'in-use'
  | 'aborted'
  | 'invalid-state'
  | 'storage'
  | 'encoding'
  | 'speech'
  | 'unknown'

export type AppError = {
  readonly code: AppErrorCode
  readonly message: string
  readonly cause?: unknown
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

export function appError(code: AppErrorCode, message: string, cause?: unknown): AppError {
  return cause === undefined ? { code, message } : { code, message, cause }
}

export function fail<T = never>(code: AppErrorCode, message: string, cause?: unknown): Result<T, AppError> {
  return err(appError(code, message, cause))
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

export function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error))
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

export async function tryAsync<T>(
  task: () => Promise<T>,
  toError: (cause: unknown) => AppError,
): Promise<Result<T, AppError>> {
  try {
    return ok(await task())
  } catch (cause) {
    return err(toError(cause))
  }
}

export function trySync<T>(task: () => T, toError: (cause: unknown) => AppError): Result<T, AppError> {
  try {
    return ok(task())
  } catch (cause) {
    return err(toError(cause))
  }
}

export function fromThrown(cause: unknown, fallbackMessage: string, code: AppErrorCode = 'unknown'): AppError {
  if (cause instanceof Error) return { code, message: cause.message || fallbackMessage, cause }
  return { code, message: fallbackMessage, cause }
}
