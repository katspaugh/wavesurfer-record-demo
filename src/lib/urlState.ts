/** URL-state helpers for the `?session=<id>` parameter. Pure functions for testability. */

export const SESSION_PARAM = 'session'
export const FRESH_TOKEN = 'new'

export function readSessionParam(search: string): string | null {
  return new URLSearchParams(search).get(SESSION_PARAM)
}

export function buildSessionUrl(
  pathname: string,
  search: string,
  hash: string,
  value: string | null,
): string {
  const params = new URLSearchParams(search)
  if (value) params.set(SESSION_PARAM, value)
  else params.delete(SESSION_PARAM)
  const next = params.toString()
  return `${pathname}${next ? `?${next}` : ''}${hash}`
}
